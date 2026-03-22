import {
  createBookingSchema,
  createPaymentOrderSchema,
  verifyPaymentSchema,
  raiseConcernSchema,
  submitRatingSchema,
  onboardingSchema,
  validateBody,
} from "../utils/validators";
import { AppError } from "../middleware/errorHandler";

describe("Zod validation schemas", () => {
  // ── createBookingSchema ────────────────────────────────────

  describe("createBookingSchema", () => {
    it("accepts valid booking input", () => {
      const input = {
        patient_id: "550e8400-e29b-41d4-a716-446655440000",
        service_id: "svc-001",
        scheduled_date: "2026-04-15",
        scheduled_slot: "morning",
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("accepts booking with optional promo_code", () => {
      const input = {
        patient_id: "550e8400-e29b-41d4-a716-446655440000",
        service_id: "svc-001",
        scheduled_date: "2026-04-15",
        scheduled_slot: "morning",
        promo_code: "SAVE20",
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects missing required fields", () => {
      const input = { patient_id: "550e8400-e29b-41d4-a716-446655440000" };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects invalid patient_id format", () => {
      const input = {
        patient_id: "not-a-uuid",
        service_id: "svc-001",
        scheduled_date: "2026-04-15",
        scheduled_slot: "morning",
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects invalid date format", () => {
      const input = {
        patient_id: "550e8400-e29b-41d4-a716-446655440000",
        service_id: "svc-001",
        scheduled_date: "15-04-2026",
        scheduled_slot: "morning",
      };
      const result = createBookingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ── createPaymentOrderSchema ───────────────────────────────

  describe("createPaymentOrderSchema", () => {
    it("accepts valid payment order input", () => {
      const input = {
        patient_id: "550e8400-e29b-41d4-a716-446655440000",
        amount: 50000,
        payment_type: "booking",
      };
      const result = createPaymentOrderSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects zero amount", () => {
      const input = {
        patient_id: "550e8400-e29b-41d4-a716-446655440000",
        amount: 0,
        payment_type: "booking",
      };
      const result = createPaymentOrderSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects negative amount", () => {
      const input = {
        patient_id: "550e8400-e29b-41d4-a716-446655440000",
        amount: -100,
        payment_type: "booking",
      };
      const result = createPaymentOrderSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ── submitRatingSchema ─────────────────────────────────────

  describe("submitRatingSchema", () => {
    it("accepts valid rating", () => {
      const input = {
        patient_id: "p1",
        deployment_id: "d1",
        rating: 4,
      };
      const result = submitRatingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects rating below 1", () => {
      const input = {
        patient_id: "p1",
        deployment_id: "d1",
        rating: 0,
      };
      const result = submitRatingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects rating above 5", () => {
      const input = {
        patient_id: "p1",
        deployment_id: "d1",
        rating: 6,
      };
      const result = submitRatingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects non-integer rating", () => {
      const input = {
        patient_id: "p1",
        deployment_id: "d1",
        rating: 3.5,
      };
      const result = submitRatingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ── raiseConcernSchema ─────────────────────────────────────

  describe("raiseConcernSchema", () => {
    it("accepts valid concern", () => {
      const input = {
        patient_id: "p1",
        category: "staff_behavior",
        description: "Staff was rude and unprofessional during morning shift.",
        urgency: "high" as const,
      };
      const result = raiseConcernSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects description shorter than 10 chars", () => {
      const input = {
        patient_id: "p1",
        category: "staff_behavior",
        description: "Too short",
        urgency: "low" as const,
      };
      const result = raiseConcernSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects invalid urgency value", () => {
      const input = {
        patient_id: "p1",
        category: "staff_behavior",
        description: "This is a valid description for the concern.",
        urgency: "super_urgent",
      };
      const result = raiseConcernSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ── onboardingSchema ───────────────────────────────────────

  describe("onboardingSchema", () => {
    it("accepts valid onboarding input", () => {
      const input = {
        name: "Aarav Sharma",
        patient_name: "Grandpa Sharma",
        patient_city: "delhi",
      };
      const result = onboardingSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const input = {
        name: "",
        patient_name: "Grandpa",
        patient_city: "delhi",
      };
      const result = onboardingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects patient_age above 150", () => {
      const input = {
        name: "Aarav",
        patient_name: "Grandpa",
        patient_city: "delhi",
        patient_age: 200,
      };
      const result = onboardingSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ── validateBody helper ────────────────────────────────────

  describe("validateBody", () => {
    it("returns parsed data on valid input", () => {
      const input = {
        patient_id: "p1",
        deployment_id: "d1",
        rating: 5,
      };
      const data = validateBody(submitRatingSchema, input);
      expect(data.rating).toBe(5);
    });

    it("throws AppError on invalid input", () => {
      expect(() => validateBody(submitRatingSchema, { rating: 99 })).toThrow(
        AppError
      );
    });

    it("thrown error has status code 400", () => {
      try {
        validateBody(submitRatingSchema, {});
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
      }
    });
  });
});
