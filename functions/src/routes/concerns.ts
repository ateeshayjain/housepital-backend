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
import { validateBody, raiseConcernSchema } from "../utils/validators";

const router = Router();

// ── POST /concerns ──────────────────────────────────────────

router.post(
  "/concerns",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();

    const data = validateBody(raiseConcernSchema, req.body);

    if (data.patient_id !== authReq.patientId) {
      res
        .status(403)
        .json({ error: "You do not have access to this patient" });
      return;
    }

    try {
      const concernId = uuidv4();

      await db("family_concerns").insert({
        id: concernId,
        patient_id: data.patient_id,
        raised_by: authReq.userId,
        category: data.category,
        description: data.description,
        urgency: data.urgency,
        preferred_resolution: data.preferred_resolution || null,
        evidence_urls: JSON.stringify(data.evidence_urls || []),
        status: "open",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const concern = await db("family_concerns")
        .where("id", concernId)
        .first();

      res.status(201).json({
        concern: {
          ...concern,
          evidence_urls: parseJsonCol(concern.evidence_urls),
        },
      });
    } catch (error: any) {
      logger.error("POST /concerns error", { error: error.message });
      res.status(500).json({ error: "Failed to raise concern" });
    }
  }
);

// ── GET /patients/:patientId/concerns ───────────────────────

router.get(
  "/patients/:patientId/concerns",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const concerns = await db("family_concerns")
        .where("patient_id", req.params.patientId)
        .orderBy("created_at", "desc");

      const formatted = concerns.map((c: any) => ({
        ...c,
        evidence_urls: parseJsonCol(c.evidence_urls),
      }));

      res.json({ concerns: formatted });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/concerns error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch concerns" });
    }
  }
);

export default router;
