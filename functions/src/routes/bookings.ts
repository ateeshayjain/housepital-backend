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
import { validateBody, createBookingSchema } from "../utils/validators";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────

function generateBookingNumber(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `HPL-BOOK-${num}`;
}

const GST_RATE = 0.18;

// ── POST /bookings ──────────────────────────────────────────

router.post(
  "/bookings",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();

    const data = validateBody(createBookingSchema, req.body);

    try {
      // Verify patient access
      if (data.patient_id !== authReq.patientId) {
        res
          .status(403)
          .json({ error: "You do not have access to this patient" });
        return;
      }

      // Get service details
      const service = await db("service_catalog")
        .where("id", data.service_id)
        .first();

      if (!service) {
        res.status(404).json({ error: "Service not found" });
        return;
      }

      // Calculate pricing (use base_price_min as the base amount, all in paise)
      let baseAmount = service.base_price_min || 0;
      let discountAmount = 0;

      // Validate promo code if provided
      if (data.promo_code) {
        const coupon = await db("coupons")
          .where("code", data.promo_code)
          .where("is_active", true)
          .where("valid_from", "<=", new Date())
          .where("valid_until", ">=", new Date())
          .first();

        if (coupon) {
          if (
            !coupon.applicable_categories ||
            coupon.applicable_categories === "all" ||
            coupon.applicable_categories.includes(service.category)
          ) {
            if (baseAmount >= (coupon.min_order_amount || 0)) {
              if (coupon.discount_type === "percentage") {
                discountAmount = Math.floor(
                  (baseAmount * coupon.discount_value) / 100
                );
                if (coupon.max_discount && discountAmount > coupon.max_discount) {
                  discountAmount = coupon.max_discount;
                }
              } else {
                discountAmount = coupon.discount_value;
              }
            }
          }
        }
      }

      const subtotal = baseAmount - discountAmount;
      const gstAmount = Math.round(subtotal * GST_RATE);
      const totalAmount = subtotal + gstAmount;

      const bookingId = uuidv4();
      const bookingNumber = generateBookingNumber();

      await db("bookings").insert({
        id: bookingId,
        booking_number: bookingNumber,
        patient_id: data.patient_id,
        service_id: data.service_id,
        booked_by: authReq.userId,
        scheduled_date: data.scheduled_date,
        scheduled_slot: data.scheduled_slot,
        price_amount: baseAmount,
        discount_amount: discountAmount,
        gst_amount: gstAmount,
        total_amount: totalAmount,
        promo_code: data.promo_code || null,
        status: "pending",
        payment_status: "unpaid",
        created_at: new Date(),
        updated_at: new Date(),
      });

      const booking = await db("bookings").where("id", bookingId).first();
      res.status(201).json({ booking });
    } catch (error: any) {
      logger.error("POST /bookings error", { error: error.message });
      res.status(500).json({ error: "Failed to create booking" });
    }
  }
);

// ── GET /patients/:patientId/bookings ───────────────────────

router.get(
  "/patients/:patientId/bookings",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const offset = (page - 1) * pageSize;

    try {
      const [bookings, countResult] = await Promise.all([
        db("bookings")
          .where("patient_id", req.params.patientId)
          .orderBy("created_at", "desc")
          .limit(pageSize)
          .offset(offset),
        db("bookings")
          .where("patient_id", req.params.patientId)
          .count("id as count")
          .first(),
      ]);

      res.json({
        bookings,
        total: Number(countResult?.count || 0),
        page,
        page_size: pageSize,
      });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/bookings error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch bookings" });
    }
  }
);

export default router;
