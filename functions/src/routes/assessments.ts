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
import {
  validateBody,
  createAssessmentSchema,
  acceptAssessmentSchema,
  declineAssessmentSchema,
} from "../utils/validators";

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

    const data = validateBody(createAssessmentSchema, req.body);
    const { patient_id, service_category, questionnaire_responses } = data;

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
        requested_by: authReq.userId,
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


// ── PUT /assessments/:id/accept ─────────────────────────────
//
// A coordinator sends a quote; the family accepts or declines it. Both
// buttons exist in the app and neither had a route, so a quote could be
// accepted on the phone and stay "quote_sent" on the CRM forever.
router.put(
  "/assessments/:id/accept",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();
    const data = validateBody(acceptAssessmentSchema, req.body);

    try {
      const row = await db("assessment_requests")
        .where("id", req.params.id)
        .where("patient_id", authReq.patientId)
        .first();
      if (!row) {
        res.status(404).json({ error: "Assessment request not found" });
        return;
      }
      if (row.status === "accepted" || row.status === "declined") {
        res.status(409).json({ error: `Already ${row.status}` });
        return;
      }
      // A quote that has expired must not be acceptable at its old price.
      if (row.quote_expires_at && new Date(row.quote_expires_at) < new Date()) {
        res.status(409).json({
          error: "This quote has expired. Please ask for a new one.",
        });
        return;
      }

      await db("assessment_requests").where("id", req.params.id).update({
        status: "accepted",
        accepted_at: new Date(),
        selected_plan: data.selected_plan || row.selected_plan || null,
        updated_at: new Date(),
      });
      res.json({ success: true, id: req.params.id, status: "accepted" });
    } catch (error: any) {
      logger.error("PUT /assessments/:id/accept error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to accept assessment" });
    }
  }
);

// ── PUT /assessments/:id/decline ────────────────────────────
router.put(
  "/assessments/:id/decline",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();
    const data = validateBody(declineAssessmentSchema, req.body);

    try {
      const row = await db("assessment_requests")
        .where("id", req.params.id)
        .where("patient_id", authReq.patientId)
        .first();
      if (!row) {
        res.status(404).json({ error: "Assessment request not found" });
        return;
      }
      if (row.status === "accepted" || row.status === "declined") {
        res.status(409).json({ error: `Already ${row.status}` });
        return;
      }

      await db("assessment_requests").where("id", req.params.id).update({
        status: "declined",
        declined_at: new Date(),
        decline_reason: data.reason || null,
        updated_at: new Date(),
      });
      res.json({ success: true, id: req.params.id, status: "declined" });
    } catch (error: any) {
      logger.error("PUT /assessments/:id/decline error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to decline assessment" });
    }
  }
);

export default router;
