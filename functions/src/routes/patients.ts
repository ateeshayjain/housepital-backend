import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import {
  AuthRequest,
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
} from "../middleware/auth";
import { parseJsonCol } from "../utils/helpers";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import { validateBody, recordVitalsSchema } from "../utils/validators";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────

function formatPatient(row: any): any {
  return {
    ...row,
    conditions: parseJsonCol(row.conditions),
    medications: parseJsonCol(row.medications),
    allergies: parseJsonCol(row.allergies),
    emergency_contacts: parseJsonCol(row.emergency_contacts),
  };
}

// ── GET /patients ────────────────────────────────────────────

router.get("/", verifyAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const db = getDb();

  try {
    // Get all patient IDs this user has access to
    const memberships = await db("family_members")
      .where("user_id", authReq.uid)
      .select("patient_id");

    const patientIds = memberships.map((m: any) => m.patient_id);

    if (patientIds.length === 0) {
      res.json({ patients: [] });
      return;
    }

    const patients = await db("patients").whereIn("id", patientIds);
    res.json({ patients: patients.map(formatPatient) });
  } catch (error: any) {
    logger.error("GET /patients error", { error: error.message });
    res.status(500).json({ error: "Failed to fetch patients" });
  }
});

// ── GET /patients/:id ────────────────────────────────────────

router.get(
  "/:id",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const patient = await db("patients").where("id", req.params.id).first();
      if (!patient) {
        res.status(404).json({ error: "Patient not found" });
        return;
      }
      res.json({ patient: formatPatient(patient) });
    } catch (error: any) {
      logger.error("GET /patients/:id error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch patient" });
    }
  }
);

// ── PUT /patients/:id ────────────────────────────────────────

router.put(
  "/:id",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;

    try {
      const existing = await db("patients").where("id", patientId).first();
      if (!existing) {
        res.status(404).json({ error: "Patient not found" });
        return;
      }

      const updates: any = { updated_at: new Date() };
      const allowedFields = [
        "name",
        "age",
        "gender",
        "dietary_restrictions",
        "mobility_status",
        "doctor_name",
        "doctor_phone",
        "doctor_hospital",
        "address",
        "city",
        "height",
        "weight",
        "diagnosis",
        "iv_central_line",
        "discharge_summary_available",
        "feeding_type",
        "mental_condition",
        "motion_status",
        "bp_sugar_insulin",
        "requirement",
      ];
      const jsonFields = [
        "conditions",
        "medications",
        "allergies",
        "emergency_contacts",
      ];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }
      for (const field of jsonFields) {
        if (req.body[field] !== undefined) {
          updates[field] = JSON.stringify(req.body[field]);
        }
      }

      await db("patients").where("id", patientId).update(updates);
      const updated = await db("patients").where("id", patientId).first();
      res.json(formatPatient(updated));
    } catch (error: any) {
      logger.error("PUT /patients/:id error", { error: error.message });
      res.status(500).json({ error: "Failed to update patient" });
    }
  }
);

// ── GET /patients/:id/dashboard ──────────────────────────────

router.get(
  "/:id/dashboard",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;

    try {
      // Active deployment
      const deployment = await db("deployments")
        .where("patient_id", patientId)
        .where("status", "active")
        .first();

      // Today's attendance
      let attendanceToday = null;
      if (deployment) {
        attendanceToday = await db("attendance")
          .where("deployment_id", deployment.id)
          .whereRaw("DATE(date) = CURDATE()")
          .first();
      }

      // Latest vitals
      const latestVitals = await db("vitals")
        .where("patient_id", patientId)
        .orderBy("recorded_at", "desc")
        .first();

      // Today's report summary
      let reportSummary = null;
      if (deployment) {
        const todayReport = await db("daily_reports")
          .where("deployment_id", deployment.id)
          .whereRaw("DATE(date) = CURDATE()")
          .first();
        if (todayReport) {
          reportSummary = {
            id: todayReport.id,
            completed_tasks: todayReport.completed_tasks || 0,
            total_tasks: todayReport.total_tasks || 0,
            submitted_at: todayReport.submitted_at,
          };
        }
      }

      // Billing summary
      const billingRow = await db("invoices")
        .where("patient_id", patientId)
        .where("status", "pending")
        .select(db.raw("COALESCE(SUM(grand_total), 0) as pending_amount"))
        .first();

      const billingSummary = {
        pending_amount: billingRow?.pending_amount || 0,
      };

      // Active services count
      const activeServicesCount = await db("deployments")
        .where("patient_id", patientId)
        .where("status", "active")
        .count("id as count")
        .first();

      res.json({
        deployment: deployment || null,
        attendance_today: attendanceToday || null,
        latest_vitals: latestVitals || null,
        report_summary: reportSummary,
        billing_summary: billingSummary,
        active_services_count: Number(activeServicesCount?.count || 0),
      });
    } catch (error: any) {
      logger.error("GET /patients/:id/dashboard error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  }
);

// ── GET /patients/:id/deployment ─────────────────────────────

router.get(
  "/:id/deployment",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const deployment = await db("deployments")
        .where("patient_id", req.params.id)
        .where("status", "active")
        .first();

      res.json({ deployment: deployment || null });
    } catch (error: any) {
      logger.error("GET /patients/:id/deployment error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch deployment" });
    }
  }
);

// ── GET /patients/:id/attendance/today ───────────────────────

router.get(
  "/:id/attendance/today",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;

    try {
      // Find active deployment for this patient
      const deployment = await db("deployments")
        .where("patient_id", patientId)
        .where("status", "active")
        .first();

      if (!deployment) {
        res.json({ attendance: null });
        return;
      }

      const attendance = await db("attendance")
        .where("deployment_id", deployment.id)
        .whereRaw("DATE(date) = CURDATE()")
        .first();

      res.json({ attendance: attendance || null });
    } catch (error: any) {
      logger.error("GET attendance/today error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch today's attendance" });
    }
  }
);

// ── GET /patients/:id/attendance ─────────────────────────────

router.get(
  "/:id/attendance",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const offset = (page - 1) * pageSize;

    try {
      // Find active deployment
      const deployment = await db("deployments")
        .where("patient_id", patientId)
        .where("status", "active")
        .first();

      if (!deployment) {
        res.json({ attendance: [], total: 0 });
        return;
      }

      const [records, countResult] = await Promise.all([
        db("attendance")
          .where("deployment_id", deployment.id)
          .orderBy("date", "desc")
          .limit(pageSize)
          .offset(offset),
        db("attendance")
          .where("deployment_id", deployment.id)
          .count("id as count")
          .first(),
      ]);

      res.json({
        attendance: records,
        total: Number(countResult?.count || 0),
      });
    } catch (error: any) {
      logger.error("GET attendance error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch attendance" });
    }
  }
);

// ── GET /patients/:id/vitals/latest ──────────────────────────

router.get(
  "/:id/vitals/latest",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const vitals = await db("vitals")
        .where("patient_id", req.params.id)
        .orderBy("recorded_at", "desc")
        .first();

      res.json({ vitals: vitals || null });
    } catch (error: any) {
      logger.error("GET vitals/latest error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch latest vitals" });
    }
  }
);

// ── GET /patients/:id/vitals ─────────────────────────────────

router.get(
  "/:id/vitals",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const period = (req.query.period as string) || "7d";

    // Map period to days
    const periodDays: Record<string, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
    };
    const days = periodDays[period] || 7;

    try {
      const vitals = await db("vitals")
        .where("patient_id", req.params.id)
        .whereRaw("recorded_at >= DATE_SUB(NOW(), INTERVAL ? DAY)", [days])
        .orderBy("recorded_at", "desc");

      res.json({ vitals });
    } catch (error: any) {
      logger.error("GET vitals error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch vitals" });
    }
  }
);

// ── GET /patients/:id/reports/today ──────────────────────────

router.get(
  "/:id/reports/today",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;

    try {
      const deployment = await db("deployments")
        .where("patient_id", patientId)
        .where("status", "active")
        .first();

      if (!deployment) {
        res.json({ report: null });
        return;
      }

      const report = await db("daily_reports")
        .where("deployment_id", deployment.id)
        .whereRaw("DATE(date) = CURDATE()")
        .first();

      if (!report) {
        res.json({ report: null });
        return;
      }

      res.json({
        report: {
          ...report,
          sections: parseJsonCol(report.sections),
          photo_urls: parseJsonCol(report.photo_urls),
          medications: parseJsonCol(report.medications),
        },
      });
    } catch (error: any) {
      logger.error("GET reports/today error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch today's report" });
    }
  }
);

// ── GET /patients/:id/reports ────────────────────────────────

router.get(
  "/:id/reports",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const offset = (page - 1) * pageSize;

    try {
      // Get all deployments for patient
      const deploymentIds = await db("deployments")
        .where("patient_id", patientId)
        .select("id");

      if (deploymentIds.length === 0) {
        res.json({ reports: [] });
        return;
      }

      const ids = deploymentIds.map((d: any) => d.id);

      const reports = await db("daily_reports")
        .whereIn("deployment_id", ids)
        .orderBy("date", "desc")
        .limit(pageSize)
        .offset(offset);

      res.json({
        reports: reports.map((r: any) => ({
          ...r,
          sections: parseJsonCol(r.sections),
          photo_urls: parseJsonCol(r.photo_urls),
          medications: parseJsonCol(r.medications),
        })),
      });
    } catch (error: any) {
      logger.error("GET reports error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  }
);

// ── GET /patients/:id/active-services ────────────────────────
// Fixed: replaced N+1 per-deployment attendance queries with a single batch query

router.get(
  "/:id/active-services",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;

    try {
      // Get active deployments
      const deployments = await db("deployments")
        .where("patient_id", patientId)
        .where("status", "active");

      if (deployments.length === 0) {
        res.json({ services: [] });
        return;
      }

      const deploymentIds = deployments.map((d: any) => d.id);

      // Get all attendance counts in one query
      const attendanceCounts = await db("attendance")
        .whereIn("deployment_id", deploymentIds)
        .whereRaw("DATE(date) = CURDATE()")
        .where("status", "checked_in")
        .groupBy("deployment_id")
        .select("deployment_id")
        .count("id as count");

      const countMap: Record<string, number> = {};
      for (const row of attendanceCounts) {
        countMap[row.deployment_id] = Number(row.count);
      }

      // Latest vitals for this patient (single query)
      const latestVital = await db("vitals")
        .where("patient_id", patientId)
        .orderBy("recorded_at", "desc")
        .first();

      let latestVitalLabel = null;
      let latestVitalStatus = null;
      if (latestVital) {
        if (latestVital.systolic && latestVital.diastolic) {
          latestVitalLabel = `${latestVital.systolic}/${latestVital.diastolic}`;
          latestVitalStatus = "normal";
          if (latestVital.systolic > 140 || latestVital.diastolic > 90) {
            latestVitalStatus = "warning";
          }
          if (latestVital.systolic > 180 || latestVital.diastolic > 120) {
            latestVitalStatus = "critical";
          }
        }
      }

      const services: any[] = [];

      for (const dep of deployments) {
        // Compute consumed days
        const startDate = new Date(dep.start_date);
        const now = new Date();
        const consumedDays = Math.max(
          0,
          Math.floor(
            (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1
        );

        services.push({
          id: dep.id,
          name: dep.service_name || dep.staff_role || "Care Service",
          service_category: dep.service_category || "care_package",
          status: dep.status,
          start_date: dep.start_date,
          end_date: dep.end_date,
          total_days: dep.total_days || 30,
          consumed_days: consumedDays,
          is_session_based: dep.is_session_based || false,
          total_staff: 1,
          checked_in_staff: countMap[dep.id] || 0,
          latest_vital_label: latestVitalLabel,
          latest_vital_status: latestVitalStatus,
          daily_rate: dep.daily_rate || null,
          total_paid: dep.total_paid || null,
          total_consumed: dep.total_consumed || null,
          remaining: dep.remaining || null,
          renewal_date: dep.next_billing_date || null,
          deployment_ids: [dep.id],
        });
      }

      res.json({ services });
    } catch (error: any) {
      logger.error("GET active-services error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch active services" });
    }
  }
);

// ── GET /patients/:id/health-manager ─────────────────────────

router.get(
  "/:id/health-manager",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;

    try {
      const assignment = await db("health_manager_assignments")
        .where("patient_id", patientId)
        .where("status", "active")
        .first();

      if (!assignment) {
        res.status(404).json({ error: "No health manager assigned" });
        return;
      }

      const staff = await db("staff")
        .where("id", assignment.staff_id)
        .first();

      if (!staff) {
        res.status(404).json({ error: "Health manager not found" });
        return;
      }

      res.json({
        id: assignment.id,
        staff_id: staff.id,
        name: staff.name,
        phone: staff.phone,
        photo_url: staff.photo_url || null,
        available_from: assignment.available_from || "08:00",
        available_to: assignment.available_to || "20:00",
      });
    } catch (error: any) {
      logger.error("GET health-manager error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch health manager" });
    }
  }
);

// ── POST /patients/:id/vitals ───────────────────────────────
//
// The vitals entry sheet in the app has never had a destination. It writes to
// the local provider and the reading dies with the install — which is also why
// the trend charts fall back to a generated sample series.
//
// recorded_by_type matters clinically: a family member's home cuff and a
// nurse's device are not the same evidence, and a doctor reading the trend
// needs to be able to tell them apart. Anything written through this route is
// 'family' or 'patient', never 'staff'.
router.post(
  "/:id/vitals",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();
    const data = validateBody(recordVitalsSchema, req.body);

    try {
      const id = uuidv4();
      await db("vitals").insert({
        id,
        patient_id: req.params.id,
        recorded_at: data.recorded_at ? new Date(data.recorded_at) : new Date(),
        systolic: data.systolic ?? null,
        diastolic: data.diastolic ?? null,
        pulse: data.pulse ?? null,
        spo2: data.spo2 ?? null,
        temperature: data.temperature ?? null,
        sugar: data.sugar ?? null,
        notes: data.notes || null,
        recorded_by_type:
          authReq.role === "PATIENT_SELF" ? "patient" : "family",
        recorded_by: authReq.userId,
        created_at: new Date(),
      });

      const row = await db("vitals").where("id", id).first();
      res.status(201).json(row);
    } catch (error: any) {
      logger.error("POST /patients/:id/vitals error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to record vitals" });
    }
  }
);

export default router;
