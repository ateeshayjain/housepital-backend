import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../config/cloudSql";
import {
  AuthRequest,
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
} from "../middleware/auth";
import { parseJsonCol } from "../utils/helpers";
import { logger } from "../utils/logger";
import { validateBody, addMedicationSchema } from "../utils/validators";

const router = Router();

function formatMedication(row: any): any {
  return {
    ...row,
    time_slots: parseJsonCol(row.time_slots),
    instructions: parseJsonCol(row.instructions),
  };
}

// ── GET /patients/:patientId/medications ────────────────────

router.get(
  "/:patientId/medications",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const medications = await db("medications")
        .where("patient_id", req.params.patientId)
        .where("is_active", true)
        .orderBy("created_at", "desc");

      res.json({ medications: medications.map(formatMedication) });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/medications error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch medications" });
    }
  }
);

// ── POST /patients/:patientId/medications ───────────────────

router.post(
  "/:patientId/medications",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.patientId;

    const data = validateBody(addMedicationSchema, req.body);
    const {
      name,
      dosage,
      frequency,
      // Column names follow the SCHEMA, which is also what
      // MedicationFull.toJson() on the client serialises. This route used
      // `schedule_times` / `start_date` / `low_stock_threshold` — none of
      // which exist in `medications`, so every create and update returned a
      // 500 on an unknown column. Renaming the COLUMN instead would have
      // broken the Flutter client, which already speaks time_slots /
      // prescribed_date.
      time_slots,
      instructions,
      prescribed_date,
      end_date,
      stock_count,
      reminders_enabled,
    } = data;

    try {
      const medicationId = uuidv4();

      await db("medications").insert({
        id: medicationId,
        patient_id: patientId,
        name,
        dosage: dosage || null,
        frequency: frequency || null,
        time_slots: JSON.stringify(time_slots || []),
        instructions: JSON.stringify(instructions || null),
        prescribed_date: prescribed_date || null,
        end_date: end_date || null,
        stock_count: stock_count || 0,
        reminders_enabled: reminders_enabled ?? true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const medication = await db("medications")
        .where("id", medicationId)
        .first();

      res.status(201).json(formatMedication(medication));
    } catch (error: any) {
      logger.error("POST /patients/:patientId/medications error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to add medication" });
    }
  }
);

// ── PUT /patients/:patientId/medications/:id ────────────────

router.put(
  "/:patientId/medications/:id",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const db = getDb();
    const medicationId = req.params.id;

    try {
      const existing = await db("medications")
        .where("id", medicationId)
        .where("patient_id", req.params.patientId)
        .first();

      if (!existing) {
        res.status(404).json({ error: "Medication not found" });
        return;
      }

      const updates: any = { updated_at: new Date() };
      const allowedFields = [
        "name",
        "dosage",
        "frequency",
        "prescribed_date",
        "end_date",
        "stock_count",
        "stock_unit",
        "reminders_enabled",
        "is_active",
      ];
      const jsonFields = ["time_slots", "instructions"];

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

      await db("medications").where("id", medicationId).update(updates);
      const updated = await db("medications")
        .where("id", medicationId)
        .first();

      res.json(formatMedication(updated));
    } catch (error: any) {
      logger.error("PUT /patients/:patientId/medications/:id error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update medication" });
    }
  }
);

// ── DELETE /patients/:patientId/medications/:id ─────────────
// Soft delete

router.delete(
  "/:patientId/medications/:id",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const db = getDb();
    const medicationId = req.params.id;

    try {
      const existing = await db("medications")
        .where("id", medicationId)
        .where("patient_id", req.params.patientId)
        .first();

      if (!existing) {
        res.status(404).json({ error: "Medication not found" });
        return;
      }

      await db("medications")
        .where("id", medicationId)
        .update({ is_active: false, updated_at: new Date() });

      res.json({ success: true });
    } catch (error: any) {
      logger.error("DELETE /patients/:patientId/medications/:id error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to delete medication" });
    }
  }
);

// ── GET /patients/:patientId/medication-logs ────────────────

router.get(
  "/:patientId/medication-logs",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.patientId;
    const date = req.query.date as string | undefined;

    try {
      // medication_logs has no patient_id — a log belongs to a MEDICATION,
      // and the medication belongs to the patient. Filtering on a column that
      // does not exist made this endpoint a guaranteed 500; joining is also
      // the correct scoping, because it cannot return a log whose medication
      // belongs to someone else.
      let query = db("medication_logs")
        .join(
          "medications",
          "medication_logs.medication_id",
          "medications.id"
        )
        .where("medications.patient_id", patientId)
        .select("medication_logs.*", "medications.name as medication_name")
        .orderBy("medication_logs.scheduled_time", "desc");

      if (date) {
        query = query.whereRaw(
          "DATE(medication_logs.scheduled_time) = ?", [date]);
      } else {
        query = query.whereRaw(
          "DATE(medication_logs.scheduled_time) = CURDATE()");
      }

      const logs = await query;

      res.json({ logs });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/medication-logs error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch medication logs" });
    }
  }
);

// ── PUT /patients/:patientId/medications/:id/stock ──────────

router.put(
  "/:patientId/medications/:id/stock",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const db = getDb();
    const medicationId = req.params.id;

    const { stock_count } = req.body;

    if (stock_count == null) {
      res.status(400).json({ error: "stock_count is required" });
      return;
    }

    try {
      const existing = await db("medications")
        .where("id", medicationId)
        .where("patient_id", req.params.patientId)
        .first();

      if (!existing) {
        res.status(404).json({ error: "Medication not found" });
        return;
      }

      await db("medications")
        .where("id", medicationId)
        .update({ stock_count, updated_at: new Date() });

      res.json({ success: true });
    } catch (error: any) {
      logger.error("PUT /patients/:patientId/medications/:id/stock error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to update stock" });
    }
  }
);

export default router;
