import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../config/cloudSql";
import {
  AuthRequest,
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
} from "../middleware/auth";

const router = Router();

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

function formatMedication(row: any): any {
  return {
    ...row,
    schedule_times: parseJsonCol(row.schedule_times),
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
      console.error(
        "GET /patients/:patientId/medications error:",
        error.message
      );
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

    const {
      name,
      dosage,
      frequency,
      schedule_times,
      instructions,
      start_date,
      end_date,
      stock_count,
      low_stock_threshold,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    try {
      const medicationId = uuidv4();

      await db("medications").insert({
        id: medicationId,
        patient_id: patientId,
        name,
        dosage: dosage || null,
        frequency: frequency || null,
        schedule_times: JSON.stringify(schedule_times || []),
        instructions: JSON.stringify(instructions || null),
        start_date: start_date || null,
        end_date: end_date || null,
        stock_count: stock_count || 0,
        low_stock_threshold: low_stock_threshold || 5,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const medication = await db("medications")
        .where("id", medicationId)
        .first();

      res.status(201).json(formatMedication(medication));
    } catch (error: any) {
      console.error(
        "POST /patients/:patientId/medications error:",
        error.message
      );
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
        "start_date",
        "end_date",
        "stock_count",
        "low_stock_threshold",
        "is_active",
      ];
      const jsonFields = ["schedule_times", "instructions"];

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
      console.error(
        "PUT /patients/:patientId/medications/:id error:",
        error.message
      );
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
      console.error(
        "DELETE /patients/:patientId/medications/:id error:",
        error.message
      );
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
      let query = db("medication_logs")
        .where("patient_id", patientId)
        .orderBy("scheduled_time", "desc");

      if (date) {
        query = query.whereRaw("DATE(scheduled_time) = ?", [date]);
      } else {
        query = query.whereRaw("DATE(scheduled_time) = CURDATE()");
      }

      const logs = await query;

      res.json({ logs });
    } catch (error: any) {
      console.error(
        "GET /patients/:patientId/medication-logs error:",
        error.message
      );
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
      console.error(
        "PUT /patients/:patientId/medications/:id/stock error:",
        error.message
      );
      res.status(500).json({ error: "Failed to update stock" });
    }
  }
);

export default router;
