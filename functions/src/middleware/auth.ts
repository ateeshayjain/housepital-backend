import { Request, Response, NextFunction } from "express";
import { auth } from "../config/firebase";
import { getDb } from "../config/cloudSql";
import { logger } from "../utils/logger";

// Extend Express Request with auth context
export interface AuthRequest extends Request {
  uid: string;
  phone: string;
  userId: string; // family_members.id
  patientId: string; // family_members.patient_id ("" when not onboarded)
  role: "PRIMARY_CONTACT" | "FAMILY_MEMBER" | "PATIENT_SELF";
  /**
   * False when the caller authenticated with Firebase but has no
   * family_members row yet. Such a request carries NO patient context and
   * must not reach any patient-scoped route — only onboarding.
   */
  onboarded: boolean;
}

/**
 * Middleware: verify Firebase ID token and attach user context.
 * Looks up the family_members table by Firebase uid to get patient_id and role.
 */
export async function verifyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    // Verify Firebase ID token
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const phone = decoded.phone_number || "";

    // Look up user in MySQL
    const db = getDb();
    const user = await db("family_members")
      .where("user_id", uid)
      .first();

    if (!user) {
      // User exists in Firebase Auth but not onboarded yet
      // Allow through with minimal context for onboarding endpoint
      (req as AuthRequest).uid = uid;
      (req as AuthRequest).phone = phone;
      (req as AuthRequest).userId = "";
      (req as AuthRequest).patientId = "";
      (req as AuthRequest).role = "FAMILY_MEMBER";
      (req as AuthRequest).onboarded = false;
      next();
      return;
    }

    // Attach full context
    (req as AuthRequest).uid = uid;
    (req as AuthRequest).phone = phone;
    (req as AuthRequest).userId = user.id;
    (req as AuthRequest).patientId = user.patient_id;
    (req as AuthRequest).role = user.role;
    (req as AuthRequest).onboarded = true;

    next();
  } catch (error: any) {
    if (error.code === "auth/id-token-expired") {
      res.status(401).json({ error: "Token expired. Please re-authenticate." });
    } else {
      logger.error("Auth error", { error: error.message });
      res.status(401).json({ error: "Invalid authentication token" });
    }
  }
}

/**
 * Middleware: require PRIMARY_CONTACT role.
 * Must be used AFTER verifyAuth.
 */
export function requirePrimary(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthRequest;
  if (authReq.role !== "PRIMARY_CONTACT") {
    res.status(403).json({
      error: "Only the Primary Contact can perform this action",
    });
    return;
  }
  next();
}

/**
 * Middleware: verify the patient_id in the URL matches the user's patient.
 * Prevents cross-patient data access.
 */
export function verifyPatientAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authReq = req as AuthRequest;
  const patientId = req.params.patientId || req.params.id;

  // FAILS CLOSED. The previous version was:
  //
  //   if (patientId && authReq.patientId && patientId !== authReq.patientId)
  //
  // which denies only when BOTH ids are present AND differ — every other
  // combination fell through to next(). The dangerous combination was an
  // empty authReq.patientId, and verifyAuth hands out exactly that: a
  // Firebase-authenticated caller with no family_members row gets
  // `patientId = ""` so they can reach onboarding. That blank claim then
  // satisfied this guard for EVERY patient id in the system.
  //
  // Firebase phone auth is open to anyone with a phone number, so the
  // practical effect was: sign in, never onboard, and read any patient's
  // medications, invoices, vitals, reports, concerns and family list by
  // guessing or enumerating an id. The guard was weakest exactly where the
  // caller's identity was least established.
  //
  // An authorisation predicate must read "allow if proven", never "deny if
  // disproven". All three conditions below are required.
  if (!authReq.onboarded || !authReq.patientId) {
    res.status(403).json({
      error: "Your account is not linked to a patient yet",
    });
    return;
  }

  if (!patientId) {
    // A route mounted this middleware without declaring :patientId or :id.
    // That is a wiring mistake, and the safe response to a guard that cannot
    // evaluate is refusal, not passage.
    logger.error("verifyPatientAccess mounted on a route with no patient id", {
      path: req.originalUrl,
    });
    res.status(403).json({ error: "You do not have access to this patient" });
    return;
  }

  if (patientId !== authReq.patientId) {
    res.status(403).json({ error: "You do not have access to this patient" });
    return;
  }

  next();
}
