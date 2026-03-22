import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../config/cloudSql";
import {
  AuthRequest,
  verifyAuth,
  requirePrimary,
} from "../middleware/auth";
import { logger } from "../utils/logger";
import { validateBody, submitRatingSchema } from "../utils/validators";

const router = Router();

// ── POST /ratings ───────────────────────────────────────────

router.post(
  "/",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();

    const data = validateBody(submitRatingSchema, req.body);

    if (data.patient_id !== authReq.patientId) {
      res
        .status(403)
        .json({ error: "You do not have access to this patient" });
      return;
    }

    try {
      // Check for existing rating today for this deployment
      const existing = await db("daily_ratings")
        .where("deployment_id", data.deployment_id)
        .where("family_member_id", authReq.userId)
        .whereRaw("DATE(created_at) = CURDATE()")
        .first();

      if (existing) {
        res.status(409).json({
          error: "You have already submitted a rating for today",
        });
        return;
      }

      const ratingId = uuidv4();

      await db("daily_ratings").insert({
        id: ratingId,
        patient_id: data.patient_id,
        deployment_id: data.deployment_id,
        family_member_id: authReq.userId,
        rating: data.rating,
        comment: data.comment || null,
        created_at: new Date(),
      });

      res.status(201).json({ success: true, id: ratingId });
    } catch (error: any) {
      logger.error("POST /ratings error", { error: error.message });
      res.status(500).json({ error: "Failed to submit rating" });
    }
  }
);

export default router;
