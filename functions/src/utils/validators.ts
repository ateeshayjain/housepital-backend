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
