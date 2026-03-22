import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import {
  AuthRequest,
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
} from "../middleware/auth";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────

function parseJsonCol(val: any): any {
  if (val == null) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}

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
    console.error("GET /patients error:", error.message);
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
      console.error("GET /patients/:id error:", error.message);
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
      console.error("PUT /patients/:id error:", error.message);
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
      console.error("GET /patients/:id/dashboard error:", error.message);
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
      console.error("GET /patients/:id/deployment error:", error.message);
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
      console.error("GET attendance/today error:", error.message);
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
      console.error("GET attendance error:", error.message);
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
      console.error("GET vitals/latest error:", error.message);
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
      console.error("GET vitals error:", error.message);
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
      console.error("GET reports/today error:", error.message);
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
      console.error("GET reports error:", error.message);
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  }
);

// ── GET /patients/:id/active-services ────────────────────────

router.get(
  "/:id/active-services",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.id;

    try {
      // Get active deployments with staff info
      const deployments = await db("deployments")
        .where("deployments.patient_id", patientId)
        .where("deployments.status", "active")
        .select("deployments.*");

      const services: any[] = [];

      for (const dep of deployments) {
        // Count staff checked in today
        const checkedIn = await db("attendance")
          .where("deployment_id", dep.id)
          .whereRaw("DATE(date) = CURDATE()")
          .where("status", "checked_in")
          .count("id as count")
          .first();

        // Compute consumed days
        const startDate = new Date(dep.start_date);
        const now = new Date();
        const consumedDays = Math.max(
          0,
          Math.floor(
            (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1
        );

        // Latest vitals for this patient
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
          checked_in_staff: Number(checkedIn?.count || 0),
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
      console.error("GET active-services error:", error.message);
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
      console.error("GET health-manager error:", error.message);
      res.status(500).json({ error: "Failed to fetch health manager" });
    }
  }
);

export default router;
