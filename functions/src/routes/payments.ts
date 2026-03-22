import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDb } from "../config/cloudSql";
import { getRazorpay, getRazorpayKeySecret } from "../config/razorpay";
import {
  AuthRequest,
  verifyAuth,
  requirePrimary,
} from "../middleware/auth";
import { logger } from "../utils/logger";
import {
  validateBody,
  createPaymentOrderSchema,
  verifyPaymentSchema,
} from "../utils/validators";

const router = Router();

// ── POST /payments/create-order ─────────────────────────────

router.post(
  "/create-order",
  verifyAuth,
  requirePrimary,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();

    const data = validateBody(createPaymentOrderSchema, req.body);

    if (data.patient_id !== authReq.patientId) {
      res
        .status(403)
        .json({ error: "You do not have access to this patient" });
      return;
    }

    try {
      const razorpay = getRazorpay();

      // Create Razorpay order (amount in paise)
      const order = await razorpay.orders.create({
        amount: data.amount,
        currency: "INR",
        receipt: `hpl_${Date.now()}`,
        notes: {
          patient_id: data.patient_id,
          payment_type: data.payment_type,
          reference_type: data.reference_type || "",
          reference_id: data.reference_id || "",
        },
      });

      // Store pending payment
      const paymentId = uuidv4();
      await db("payments").insert({
        id: paymentId,
        patient_id: data.patient_id,
        family_member_id: authReq.userId,
        razorpay_order_id: order.id,
        amount: data.amount,
        currency: "INR",
        payment_type: data.payment_type,
        reference_type: data.reference_type || null,
        reference_id: data.reference_id || null,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      });

      res.status(201).json({
        payment_id: paymentId,
        razorpay_order_id: order.id,
        amount: order.amount,
        currency: order.currency,
      });
    } catch (error: any) {
      logger.error("POST /payments/create-order error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to create payment order" });
    }
  }
);

// ── POST /payments/verify ───────────────────────────────────

router.post(
  "/verify",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();

    const data = validateBody(verifyPaymentSchema, req.body);

    try {
      // Verify signature
      const secret = getRazorpayKeySecret();
      const body = data.razorpay_order_id + "|" + data.razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");

      if (expectedSignature !== data.razorpay_signature) {
        res.status(400).json({ error: "Invalid payment signature" });
        return;
      }

      // Update payment record
      const payment = await db("payments")
        .where("razorpay_order_id", data.razorpay_order_id)
        .first();

      if (!payment) {
        res.status(404).json({ error: "Payment record not found" });
        return;
      }

      await db("payments")
        .where("id", payment.id)
        .update({
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
          status: "captured",
          updated_at: new Date(),
        });

      // Update booking payment status if linked
      if (payment.reference_type === "booking" && payment.reference_id) {
        await db("bookings")
          .where("id", payment.reference_id)
          .update({
            payment_status: "paid",
            updated_at: new Date(),
          });
      }

      res.json({
        success: true,
        payment_id: payment.id,
        status: "captured",
      });
    } catch (error: any) {
      logger.error("POST /payments/verify error", { error: error.message });
      res.status(500).json({ error: "Failed to verify payment" });
    }
  }
);

// ── POST /payments/webhook ──────────────────────────────────
// No auth middleware — Razorpay calls this directly

router.post("/webhook", async (req: Request, res: Response) => {
  const db = getDb();

  const webhookSignature = req.headers["x-razorpay-signature"] as string;
  if (!webhookSignature) {
    res.status(400).json({ error: "Missing webhook signature" });
    return;
  }

  try {
    const secret = getRazorpayKeySecret();
    const rawBody =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== webhookSignature) {
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const eventType = event.event;
    const payload = event.payload?.payment?.entity;

    if (!payload) {
      res.json({ status: "ignored" });
      return;
    }

    const orderId = payload.order_id;

    if (eventType === "payment.captured") {
      await db("payments")
        .where("razorpay_order_id", orderId)
        .update({
          razorpay_payment_id: payload.id,
          status: "captured",
          updated_at: new Date(),
        });

      // Update linked booking
      const payment = await db("payments")
        .where("razorpay_order_id", orderId)
        .first();
      if (
        payment &&
        payment.reference_type === "booking" &&
        payment.reference_id
      ) {
        await db("bookings")
          .where("id", payment.reference_id)
          .update({ payment_status: "paid", updated_at: new Date() });
      }
    } else if (eventType === "payment.failed") {
      await db("payments")
        .where("razorpay_order_id", orderId)
        .update({
          status: "failed",
          updated_at: new Date(),
        });
    } else if (eventType === "refund.processed") {
      const refundEntity = event.payload?.refund?.entity;
      if (refundEntity) {
        await db("payments")
          .where("razorpay_payment_id", refundEntity.payment_id)
          .update({
            status: "refunded",
            refund_amount: refundEntity.amount,
            updated_at: new Date(),
          });
      }
    }

    res.json({ status: "ok" });
  } catch (error: any) {
    logger.error("POST /payments/webhook error", { error: error.message });
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
