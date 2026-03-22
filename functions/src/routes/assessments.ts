import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../config/cloudSql";
import {
  AuthRequest,
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
} from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();

function generateRequestNumber(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `HPL-ASR-${num}`;
}

// ── POST /assessments ───────────────────────────────────────

router.post(
  "/assessments",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();

    const { patient_id, service_category, questionnaire_responses } = req.body;

    if (!patient_id || !service_category) {
      res.status(400).json({
        error: "patient_id and service_category are required",
      });
      return;
    }

    try {
      if (patient_id !== authReq.patientId) {
        res
          .status(403)
          .json({ error: "You do not have access to this patient" });
        return;
      }

      const assessmentId = uuidv4();
      const requestNumber = generateRequestNumber();

      await db("assessment_requests").insert({
        id: assessmentId,
        request_number: requestNumber,
        patient_id,
        family_member_id: authReq.userId,
        service_category,
        questionnaire_responses: JSON.stringify(
          questionnaire_responses || {}
        ),
        status: "submitted",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const assessment = await db("assessment_requests")
        .where("id", assessmentId)
        .first();

      res.status(201).json({
        assessment: {
          ...assessment,
          questionnaire_responses: questionnaire_responses || {},
        },
      });
    } catch (error: any) {
      logger.error("POST /assessments error", { error: error.message });
      res.status(500).json({ error: "Failed to create assessment request" });
    }
  }
);

// ── GET /patients/:patientId/assessments ────────────────────

router.get(
  "/patients/:patientId/assessments",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const assessments = await db("assessment_requests")
        .where("patient_id", req.params.patientId)
        .orderBy("created_at", "desc");

      const formatted = assessments.map((a: any) => {
        let responses = a.questionnaire_responses;
        if (typeof responses === "string") {
          try {
            responses = JSON.parse(responses);
          } catch {
            responses = {};
          }
        }
        return { ...a, questionnaire_responses: responses };
      });

      res.json({ assessments: formatted });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/assessments error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  }
);

export default router;
