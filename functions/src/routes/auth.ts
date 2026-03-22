import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../config/cloudSql";
import { db as firestore } from "../config/firebase";
import { AuthRequest, verifyAuth } from "../middleware/auth";

const router = Router();

/**
 * POST /auth/verify-otp
 * Called after Firebase Auth phone verification succeeds on the client.
 * Looks up or creates the user record in MySQL.
 * Returns user profile + patient context.
 */
router.post("/verify-otp", verifyAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const db = getDb();

  try {
    // Check if user already exists
    const existing = await db("family_members")
      .where("user_id", authReq.uid)
      .first();

    if (existing) {
      // Existing user — return profile + patient
      const patient = await db("patients")
        .where("id", existing.patient_id)
        .first();

      res.json({
        user_id: existing.id,
        patient_id: existing.patient_id,
        name: existing.name,
        phone: existing.phone,
        role: existing.role,
        preferred_language: existing.preferred_language,
        has_onboarded: true,
        patient: patient || null,
      });
      return;
    }

    // New user — not yet onboarded
    res.json({
      user_id: null,
      patient_id: null,
      has_onboarded: false,
      phone: authReq.phone,
    });
  } catch (error: any) {
    console.error("verify-otp error:", error.message);
    res.status(500).json({ error: "Failed to verify user" });
  }
});

/**
 * POST /auth/onboarding
 * Creates patient + family_member records for a new user.
 * Only called once during first-time setup.
 */
router.post("/onboarding", verifyAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const {
    name,
    relationship,
    preferred_language,
    patient_name,
    patient_age,
    patient_gender,
    patient_city,
    patient_conditions,
    patient_address,
  } = req.body;

  if (!name || !patient_name || !patient_city) {
    res.status(400).json({
      error: "name, patient_name, and patient_city are required",
    });
    return;
  }

  // Validate city
  const validCities = ["delhi", "faridabad", "gurgaon", "noida", "ghaziabad"];
  if (!validCities.includes(patient_city.toLowerCase())) {
    res.status(400).json({
      error: `Invalid city. Must be one of: ${validCities.join(", ")}`,
    });
    return;
  }

  const db = getDb();

  try {
    // Check if already onboarded
    const existing = await db("family_members")
      .where("user_id", authReq.uid)
      .first();

    if (existing) {
      res.status(409).json({ error: "User already onboarded" });
      return;
    }

    // Create patient
    const patientId = uuidv4();
    await db("patients").insert({
      id: patientId,
      name: patient_name,
      age: patient_age || null,
      gender: patient_gender || null,
      conditions: JSON.stringify(patient_conditions || []),
      city: patient_city.toLowerCase(),
      address: patient_address || null,
      emergency_contacts: JSON.stringify([]),
      allergies: JSON.stringify([]),
      medications: JSON.stringify([]),
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Create family member (PRIMARY_CONTACT)
    const memberId = uuidv4();
    await db("family_members").insert({
      id: memberId,
      user_id: authReq.uid,
      patient_id: patientId,
      name: name,
      phone: authReq.phone,
      relationship: relationship || "other",
      role: "PRIMARY_CONTACT",
      preferred_language: preferred_language || "en",
      notification_preferences: JSON.stringify({
        attendance: true,
        vitals_alert: true,
        daily_report: true,
        payment_reminder: true,
        booking_update: true,
        weekly_summary: true,
      }),
      created_at: new Date(),
    });

    // Create user-patient mapping in Firestore for security rules
    await firestore
      .collection("user_patients")
      .doc(authReq.uid)
      .collection("patients")
      .doc(patientId)
      .set({ role: "PRIMARY_CONTACT", created_at: new Date() });

    const patient = await db("patients").where("id", patientId).first();

    res.status(201).json({
      user_id: memberId,
      patient_id: patientId,
      name: name,
      phone: authReq.phone,
      role: "PRIMARY_CONTACT",
      preferred_language: preferred_language || "en",
      has_onboarded: true,
      patient: patient,
    });
  } catch (error: any) {
    console.error("Onboarding error:", error.message);
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

/**
 * POST /auth/fcm-token
 * Register or update FCM token for push notifications.
 */
router.post("/fcm-token", verifyAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { token, device_type } = req.body;

  if (!token) {
    res.status(400).json({ error: "FCM token is required" });
    return;
  }

  const db = getDb();

  try {
    // Upsert FCM token
    const existing = await db("fcm_tokens")
      .where("user_id", authReq.uid)
      .where("token", token)
      .first();

    if (existing) {
      await db("fcm_tokens")
        .where("id", existing.id)
        .update({ updated_at: new Date() });
    } else {
      await db("fcm_tokens").insert({
        id: uuidv4(),
        user_id: authReq.uid,
        token: token,
        device_type: device_type || "unknown",
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("FCM token error:", error.message);
    res.status(500).json({ error: "Failed to register FCM token" });
  }
});

export default router;
