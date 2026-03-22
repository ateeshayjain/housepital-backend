import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../config/cloudSql";
import {
  AuthRequest,
  verifyAuth,
  requirePrimary,
} from "../middleware/auth";

const router = Router();

// ── POST /ratings ───────────────────────────────────────────

router.post(
  "/",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();

    const { patient_id, deployment_id, rating, comment } = req.body;

    if (!patient_id || !deployment_id || rating == null) {
      res.status(400).json({
        error: "patient_id, deployment_id, and rating are required",
      });
      return;
    }

    if (rating < 1 || rating > 5) {
      res.status(400).json({ error: "Rating must be between 1 and 5" });
      return;
    }

    if (patient_id !== authReq.patientId) {
      res
        .status(403)
        .json({ error: "You do not have access to this patient" });
      return;
    }

    try {
      // Check for existing rating today for this deployment
      const existing = await db("daily_ratings")
        .where("deployment_id", deployment_id)
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
        patient_id,
        deployment_id,
        family_member_id: authReq.userId,
        rating,
        comment: comment || null,
        created_at: new Date(),
      });

      res.status(201).json({ success: true, id: ratingId });
    } catch (error: any) {
      console.error("POST /ratings error:", error.message);
      res.status(500).json({ error: "Failed to submit rating" });
    }
  }
);

export default router;
