import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { verifyAuth } from "../middleware/auth";
import { parseJsonCol } from "../utils/helpers";
import { logger } from "../utils/logger";

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

        const bpStatus =
          latest.systolic > 180 || latest.diastolic > 120
            ? "critical"
            : latest.systolic > 140 || latest.diastolic > 90
            ? "warning"
            : "normal";

        const spo2Status =
          latest.spo2 < 90
            ? "critical"
            : latest.spo2 < 95
            ? "warning"
            : "normal";

        const pulseStatus =
          latest.pulse > 120 || latest.pulse < 50
            ? "critical"
            : latest.pulse > 100 || latest.pulse < 60
            ? "warning"
            : "normal";

        const tempStatus =
          latest.temperature > 103
            ? "critical"
            : latest.temperature > 100
            ? "warning"
            : "normal";

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

export default router;
