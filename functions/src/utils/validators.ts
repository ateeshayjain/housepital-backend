import { z } from "zod";
import { AppError } from "../middleware/errorHandler";

// ── Schemas ──────────────────────────────────────────────────

export const createBookingSchema = z.object({
  patient_id: z.string().uuid(),
  service_id: z.string(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_slot: z.string(),
  promo_code: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const createPaymentOrderSchema = z.object({
  patient_id: z.string().uuid(),
  amount: z.number().positive(),
  payment_type: z.string(),
  reference_type: z.string().optional(),
  reference_id: z.string().optional(),
});

export const verifyPaymentSchema = z.object({
  razorpay_payment_id: z.string(),
  razorpay_order_id: z.string(),
  razorpay_signature: z.string(),
});

export const raiseConcernSchema = z.object({
  patient_id: z.string(),
  category: z.string(),
  description: z.string().min(10).max(2000),
  urgency: z.enum(["low", "medium", "high", "emergency"]),
  preferred_resolution: z.string().optional(),
  evidence_urls: z.array(z.string()).max(5).optional(),
});

export const submitRatingSchema = z.object({
  patient_id: z.string(),
  deployment_id: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export const onboardingSchema = z.object({
  name: z.string().min(1).max(255),
  relationship: z.string().optional(),
  preferred_language: z.enum(["en", "hi"]).optional(),
  patient_name: z.string().min(1).max(255),
  patient_age: z.number().int().min(0).max(150).optional(),
  patient_gender: z.enum(["male", "female", "other"]).optional(),
  patient_city: z.string(),
  patient_conditions: z.array(z.string()).optional(),
  patient_address: z.string().optional(),
});

// Field names match BOTH the `medications` table and MedicationFull.toJson()
// in the Flutter client. They previously matched neither: the schema accepted
// schedule_times / start_date / low_stock_threshold, the client sent
// time_slots / prescribed_date / stock_unit / reminders_enabled, and the
// table has the client's names. So a well-formed request from the app was
// stripped to almost nothing by validation, and whatever survived hit an
// unknown column.
export const addMedicationSchema = z.object({
  name: z.string().min(1).max(255),
  dosage: z.string().max(100).optional(),
  form: z.string().max(50).optional(),
  frequency: z.string().optional(),
  time_slots: z.array(z.string()).optional(),
  instructions: z.string().max(1000).optional(),
  prescribed_by: z.string().max(255).optional(),
  prescribed_date: z.string().optional(),
  end_date: z.string().optional(),
  stock_count: z.number().int().min(0).optional(),
  stock_unit: z.string().max(50).optional(),
  reminders_enabled: z.boolean().optional(),
});

export const addFamilyMemberSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional().or(z.literal("")),
  relationship: z.string().min(1),
  role: z.enum(["PRIMARY_CONTACT", "FAMILY_MEMBER", "PATIENT_SELF"]).optional(),
  preferred_language: z.enum(["en", "hi"]).optional(),
});

export const createAssessmentSchema = z.object({
  patient_id: z.string(),
  service_category: z.string().min(1),
  questionnaire_responses: z.record(z.unknown()).optional(),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1),
  category: z.string().min(1),
  order_amount: z.number().min(0),
});

export const fcmTokenSchema = z.object({
  token: z.string().min(1),
  device_type: z.string().optional(),
});

// ── Validation helper ────────────────────────────────────────

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      result.error.issues.map((i) => i.message).join(", "),
      400
    );
  }
  return result.data;
}

// ── Round-5: schemas for the routes that never existed ──────
//
// Thirteen client calls had no backend route at all. These cover the ones
// whose data model already exists, plus the two tables migration 006 adds.
// Every one of them backs a control the user can already tap.

export const recordVitalsSchema = z.object({
  systolic: z.number().int().min(40).max(300).optional(),
  diastolic: z.number().int().min(20).max(200).optional(),
  pulse: z.number().int().min(20).max(250).optional(),
  spo2: z.number().int().min(50).max(100).optional(),
  temperature: z.number().min(80).max(115).optional(),
  sugar: z.number().min(20).max(800).optional(),
  recorded_at: z.string().optional(),
  notes: z.string().max(1000).optional(),
}).refine(
  (v) =>
    [v.systolic, v.diastolic, v.pulse, v.spo2, v.temperature, v.sugar]
      .some((x) => x !== undefined),
  { message: "At least one vital reading is required" }
);

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const rateBookingSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const declineAssessmentSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const acceptAssessmentSchema = z.object({
  selected_plan: z.string().max(120).optional(),
});

export const staffReplacementSchema = z.object({
  reason: z.string().min(1).max(1000),
  details: z.string().max(2000).optional(),
});

export const equipmentReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  text: z.string().max(2000).optional(),
});
