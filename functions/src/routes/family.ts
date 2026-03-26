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
import { validateBody, addFamilyMemberSchema } from "../utils/validators";

const router = Router();

// ── GET /patients/:patientId/family ──────────────────────────

router.get(
  "/patients/:patientId/family",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const members = await db("family_members")
        .where("patient_id", req.params.patientId)
        .orderBy("created_at", "asc");

      const formatted = members.map((m: any) => ({
        ...m,
        notification_preferences: m.notification_preferences
          ? typeof m.notification_preferences === "string"
            ? JSON.parse(m.notification_preferences)
            : m.notification_preferences
          : null,
      }));

      res.json({ family_members: formatted });
    } catch (error: any) {
      logger.error("GET family error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch family members" });
    }
  }
);

// ── POST /patients/:patientId/family ─────────────────────────

router.post(
  "/patients/:patientId/family",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.patientId;
    const data = validateBody(addFamilyMemberSchema, req.body);
    const { name, phone, email, relationship, role, preferred_language } = data;

    try {
      const memberId = uuidv4();
      await db("family_members").insert({
        id: memberId,
        user_id: "", // Will be linked when user registers
        patient_id: patientId,
        name,
        phone,
        email: email || null,
        relationship,
        role: role || "FAMILY_MEMBER",
        preferred_language: preferred_language || "en",
        notification_preferences: JSON.stringify({
          attendance: true,
          vitals_alert: true,
          daily_report: true,
          payment_reminder: false,
          booking_update: false,
          weekly_summary: true,
        }),
        created_at: new Date(),
      });

      const member = await db("family_members")
        .where("id", memberId)
        .first();

      res.status(201).json({
        ...member,
        notification_preferences: member.notification_preferences
          ? typeof member.notification_preferences === "string"
            ? JSON.parse(member.notification_preferences)
            : member.notification_preferences
          : null,
      });
    } catch (error: any) {
      logger.error("POST family error", { error: error.message });
      res.status(500).json({ error: "Failed to add family member" });
    }
  }
);

// ── POST /patients/:patientId/family/invite ──────────────────

router.post(
  "/patients/:patientId/family/invite",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const { phone } = req.body;

    if (!phone) {
      res.status(400).json({ error: "phone is required" });
      return;
    }

    try {
      // In production, send an SMS/WhatsApp invite with a deep link
      // For now, just record the invitation
      res.json({ success: true });
    } catch (error: any) {
      logger.error("POST family/invite error", { error: error.message });
      res.status(500).json({ error: "Failed to send invite" });
    }
  }
);

// ── PUT /patients/:patientId/family/:memberId ────────────────

router.put(
  "/patients/:patientId/family/:memberId",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const { memberId } = req.params;

    try {
      const existing = await db("family_members")
        .where("id", memberId)
        .first();

      if (!existing) {
        res.status(404).json({ error: "Family member not found" });
        return;
      }

      const updates: any = {};
      const allowedFields = [
        "name",
        "phone",
        "email",
        "relationship",
        "preferred_language",
      ];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (req.body.notification_preferences !== undefined) {
        updates.notification_preferences = JSON.stringify(
          req.body.notification_preferences
        );
      }

      if (Object.keys(updates).length > 0) {
        await db("family_members").where("id", memberId).update(updates);
      }

      const updated = await db("family_members")
        .where("id", memberId)
        .first();

      res.json({
        ...updated,
        notification_preferences: updated.notification_preferences
          ? typeof updated.notification_preferences === "string"
            ? JSON.parse(updated.notification_preferences)
            : updated.notification_preferences
          : null,
      });
    } catch (error: any) {
      logger.error("PUT family member error", { error: error.message });
      res.status(500).json({ error: "Failed to update family member" });
    }
  }
);

// ── POST /patients/:patientId/family/:memberId/remove ────────

router.post(
  "/patients/:patientId/family/:memberId/remove",
  verifyAuth,
  verifyPatientAccess,
  requirePrimary,
  async (req: Request, res: Response) => {
    const db = getDb();
    const { memberId } = req.params;

    try {
      const member = await db("family_members")
        .where("id", memberId)
        .first();

      if (!member) {
        res.status(404).json({ error: "Family member not found" });
        return;
      }

      if (member.role === "PRIMARY_CONTACT") {
        res
          .status(400)
          .json({ error: "Cannot remove the primary contact" });
        return;
      }

      await db("family_members").where("id", memberId).delete();
      res.json({ success: true });
    } catch (error: any) {
      logger.error("POST family remove error", { error: error.message });
      res.status(500).json({ error: "Failed to remove family member" });
    }
  }
);

// ── PUT /family/:memberId/remove (legacy) ────────────────────

router.put(
  "/family/:memberId/remove",
  verifyAuth,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();
    const { memberId } = req.params;

    try {
      // Verify the caller is PRIMARY_CONTACT for the same patient
      const member = await db("family_members")
        .where("id", memberId)
        .first();

      if (!member) {
        res.status(404).json({ error: "Family member not found" });
        return;
      }

      if (member.patient_id !== authReq.patientId) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      if (authReq.role !== "PRIMARY_CONTACT") {
        res.status(403).json({
          error: "Only the Primary Contact can remove members",
        });
        return;
      }

      if (member.role === "PRIMARY_CONTACT") {
        res
          .status(400)
          .json({ error: "Cannot remove the primary contact" });
        return;
      }

      await db("family_members").where("id", memberId).delete();
      res.json({ success: true });
    } catch (error: any) {
      logger.error("PUT family remove (legacy) error", { error: error.message });
      res.status(500).json({ error: "Failed to remove family member" });
    }
  }
);

export default router;
