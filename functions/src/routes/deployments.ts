import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { AuthRequest, verifyAuth } from "../middleware/auth";
import { parseJsonCol } from "../utils/helpers";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import {
  validateBody,
  staffReplacementSchema,
} from "../utils/validators";
import {
  classifyVital,
  classifyBloodPressure,
} from "../utils/vitalClassifier";

const router = Router();

// ── GET /deployments/:id/service-detail ──────────────────────

router.get(
  "/:id/service-detail",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();
    const deploymentId = req.params.id;

    try {
      const deployment = await db("deployments")
        .where("id", deploymentId)
        .first();

      if (!deployment) {
        res.status(404).json({ error: "Deployment not found" });
        return;
      }

      // Build ActiveService shape
      const startDate = new Date(deployment.start_date);
      const now = new Date();
      const consumedDays = Math.max(
        0,
        Math.floor(
          (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1
      );

      const service = {
        id: deployment.id,
        name: deployment.service_name || deployment.staff_role || "Care Service",
        service_category: deployment.service_category || "care_package",
        status: deployment.status,
        start_date: deployment.start_date,
        end_date: deployment.end_date,
        total_days: deployment.total_days || 30,
        consumed_days: consumedDays,
        is_session_based: deployment.is_session_based || false,
        total_staff: 1,
        checked_in_staff: 0,
        daily_rate: deployment.daily_rate || null,
        total_paid: deployment.total_paid || null,
        total_consumed: deployment.total_consumed || null,
        remaining: deployment.remaining || null,
        renewal_date: deployment.next_billing_date || null,
        deployment_ids: [deployment.id],
      };

      // Staff on duty today — single JOIN instead of N+1
      const todayAttendance = await db("attendance")
        .leftJoin("staff", "attendance.staff_id", "staff.id")
        .where("attendance.deployment_id", deploymentId)
        .whereRaw("DATE(attendance.date) = CURDATE()")
        .select(
          "attendance.*",
          "staff.name as staff_name",
          "staff.photo_url",
          "staff.role as staff_role",
          "staff.rating"
        );

      const staffOnDuty = todayAttendance.map((att: any) => ({
        id: att.staff_id,
        name: att.staff_name || null,
        photo_url: att.photo_url || null,
        role: att.staff_role || deployment.staff_role || "Caretaker",
        shift_type: deployment.shift_type || "24hr",
        check_in_time: att.check_in_time || null,
        rating: att.rating || null,
        is_replacement: !!att.replacement_name,
        replacing_name: att.replacement_name || null,
      }));

      // Update checked_in count
      service.checked_in_staff = staffOnDuty.filter(
        (s: any) => s.check_in_time
      ).length;

      // Attendance last 7 days
      const attendanceDays = await db("attendance")
        .where("deployment_id", deploymentId)
        .whereRaw("date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)")
        .orderBy("date", "desc");

      const formattedAttendanceDays = attendanceDays.map((a: any) => ({
        date: a.date,
        status: a.status,
        staff_name: a.staff_name || null,
        replacement_name: a.replacement_name || null,
      }));

      // Vitals summary
      let vitalsSummary = null;
      const recentVitals = await db("vitals")
        .where("patient_id", deployment.patient_id)
        .orderBy("recorded_at", "desc")
        .limit(7);

      if (recentVitals.length > 0) {
        const latest = recentVitals[0];
        const systolics = recentVitals
          .map((v: any) => v.systolic)
          .filter(Boolean)
          .reverse();
        const spo2s = recentVitals
          .map((v: any) => v.spo2)
          .filter(Boolean)
          .reverse();
        const pulses = recentVitals
          .map((v: any) => v.pulse)
          .filter(Boolean)
          .reverse();
        const temps = recentVitals
          .map((v: any) => v.temperature)
          .filter(Boolean)
          .reverse();

        // Delegated to the shared classifier. These four used to be inline
        // ternaries with their own thresholds — the app's FOURTH set — and
        // the client re-classifies the same reading with the canonical table,
        // so one reading was scored twice and could come back two different
        // colours. The inline temperature check only ever compared upward, so
        // a hypothermic 95F was reported to the family as "normal".
        // See utils/vitalClassifier.ts.
        const bpStatus = classifyBloodPressure(latest.systolic, latest.diastolic);
        const spo2Status = classifyVital("spo2", latest.spo2);
        const pulseStatus = classifyVital("pulse", latest.pulse);
        const tempStatus = classifyVital("temperature", latest.temperature);

        vitalsSummary = {
          bp: {
            label:
              latest.systolic && latest.diastolic
                ? `${latest.systolic}/${latest.diastolic}`
                : "--",
            status: bpStatus,
            sparkline: systolics,
          },
          spo2: {
            label: latest.spo2 ? `${latest.spo2}%` : "--",
            status: spo2Status,
            sparkline: spo2s,
          },
          pulse: {
            label: latest.pulse ? `${latest.pulse} bpm` : "--",
            status: pulseStatus,
            sparkline: pulses,
          },
          temperature: {
            label: latest.temperature ? `${latest.temperature}\u00b0F` : "--",
            status: tempStatus,
            sparkline: temps,
          },
        };
      }

      // Today's report
      let todayReport = null;
      const report = await db("daily_reports")
        .where("deployment_id", deploymentId)
        .whereRaw("DATE(date) = CURDATE()")
        .first();

      if (report) {
        const sections = parseJsonCol(report.sections) || [];
        const tasks: any[] = [];
        for (const section of sections) {
          if (section.tasks) {
            for (const task of section.tasks) {
              tasks.push({
                name: task.name,
                status: task.completed
                  ? "completed"
                  : task.skipped
                  ? "upcoming"
                  : "in_progress",
                completed_at: task.completed_at || null,
              });
            }
          }
        }

        todayReport = {
          total_tasks: report.total_tasks || 0,
          completed_tasks: report.completed_tasks || 0,
          tasks,
          staff_notes: report.staff_notes || null,
        };
      }

      // Equipment
      const equipment = await db("equipment_deployments")
        .where("deployment_id", deploymentId)
        .where("status", "active");

      const formattedEquipment = equipment.map((e: any) => ({
        name: e.name || e.equipment_name,
        monthly_rate: e.monthly_rate || 0,
        start_date: e.start_date,
        status: e.status,
      }));

      res.json({
        service,
        staff_on_duty: staffOnDuty,
        attendance_days: formattedAttendanceDays,
        vitals_summary: vitalsSummary,
        today_report: todayReport,
        equipment: formattedEquipment,
      });
    } catch (error: any) {
      logger.error("GET service-detail error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch service detail" });
    }
  }
);

// ── GET /deployments/:id/attendance ──────────────────────────

router.get(
  "/:id/attendance",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();
    const deploymentId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 30;
    const offset = (page - 1) * pageSize;

    try {
      const deployment = await db("deployments")
        .where("id", deploymentId)
        .first();

      if (!deployment) {
        res.status(404).json({ error: "Deployment not found" });
        return;
      }

      const [records, countResult] = await Promise.all([
        db("attendance")
          .where("deployment_id", deploymentId)
          .orderBy("date", "desc")
          .limit(pageSize)
          .offset(offset),
        db("attendance")
          .where("deployment_id", deploymentId)
          .count("id as count")
          .first(),
      ]);

      res.json({
        records,
        total: Number(countResult?.count || 0),
      });
    } catch (error: any) {
      logger.error("GET deployment attendance error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  }
);


// ── POST /deployments/:id/replacement ───────────────────────
//
// THE ONLY CONTROL IN THIS APP FOR REMOVING A CAREGIVER FROM A HOME.
//
// The audit graded it Fail with "the only removal control is wired to a 404".
// A family that wants a particular person to stop coming tapped it, the POST
// failed, the client caught the error, and the screen said the request was
// sent. Nothing anywhere recorded that they asked.
//
// That is the worst possible failure for this specific button. The reasons a
// family asks for a different caregiver are rarely administrative, and a
// silent drop means the person they wanted removed keeps arriving while they
// believe it is being handled.
//
// An open request is therefore idempotent rather than duplicated: asking
// twice must not create a second ticket that splits the coordinator's
// attention, but it must also never be reported as failure.
router.post(
  "/:id/replacement",
  verifyAuth,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();
    const data = validateBody(staffReplacementSchema, req.body);

    try {
      const deployment = await db("deployments")
        .where("id", req.params.id)
        .where("patient_id", authReq.patientId)
        .first();

      if (!deployment) {
        res.status(404).json({ error: "Deployment not found" });
        return;
      }

      const existing = await db("staff_replacement_requests")
        .where("deployment_id", req.params.id)
        .whereIn("status", ["open", "acknowledged"])
        .first();

      if (existing) {
        res.status(200).json({
          id: existing.id,
          status: existing.status,
          already_open: true,
        });
        return;
      }

      const id = uuidv4();
      await db("staff_replacement_requests").insert({
        id,
        deployment_id: req.params.id,
        patient_id: authReq.patientId,
        staff_id: deployment.staff_id || null,
        requested_by: authReq.userId,
        reason: data.reason,
        details: data.details || null,
        status: "open",
        created_at: new Date(),
        updated_at: new Date(),
      });

      logger.info("Staff replacement requested", {
        deployment_id: req.params.id,
      });

      res.status(201).json({ id, status: "open", already_open: false });
    } catch (error: any) {
      logger.error("POST /deployments/:id/replacement error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to submit replacement request" });
    }
  }
);

export default router;
