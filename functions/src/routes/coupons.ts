import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { verifyAuth } from "../middleware/auth";
import { logger } from "../utils/logger";
import { validateBody, validateCouponSchema } from "../utils/validators";

const router = Router();

// ── POST /coupons/validate ──────────────────────────────────

router.post("/validate", verifyAuth, async (req: Request, res: Response) => {
  const db = getDb();

  const data = validateBody(validateCouponSchema, req.body);
  const { code, category, order_amount } = data;

  try {
    const coupon = await db("coupons")
      .where("code", code)
      .where("is_active", true)
      .first();

    if (!coupon) {
      res.status(404).json({ error: "Invalid coupon code" });
      return;
    }

    // Check validity dates
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      res.status(400).json({ error: "Coupon is not yet active" });
      return;
    }
    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      res.status(400).json({ error: "Coupon has expired" });
      return;
    }

    // Check category applicability
    if (
      coupon.applicable_categories &&
      coupon.applicable_categories !== "all"
    ) {
      const categories =
        typeof coupon.applicable_categories === "string"
          ? coupon.applicable_categories.split(",").map((c: string) => c.trim())
          : coupon.applicable_categories;

      if (!categories.includes(category)) {
        res.status(400).json({
          error: "Coupon is not applicable for this service category",
        });
        return;
      }
    }

    // Check minimum order amount
    if (coupon.min_order_amount && order_amount < coupon.min_order_amount) {
      res.status(400).json({
        error: `Minimum order amount is ${coupon.min_order_amount}`,
      });
      return;
    }

    // Check usage limit
    if (coupon.max_uses) {
      const usageCount = await db("bookings")
        .where("promo_code", code)
        .count("id as count")
        .first();
      if (Number(usageCount?.count || 0) >= coupon.max_uses) {
        res.status(400).json({ error: "Coupon usage limit reached" });
        return;
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discount_type === "percentage") {
      discountAmount = Math.floor(
        (order_amount * coupon.discount_value) / 100
      );
      if (coupon.max_discount && discountAmount > coupon.max_discount) {
        discountAmount = coupon.max_discount;
      }
    } else {
      discountAmount = coupon.discount_value;
    }

    res.json({
      id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      max_discount: coupon.max_discount || null,
      discount_amount: discountAmount,
      valid: true,
    });
  } catch (error: any) {
    logger.error("POST /coupons/validate error", { error: error.message });
    res.status(500).json({ error: "Failed to validate coupon" });
  }
});

// ── GET /coupons ────────────────────────────────────────────

router.get("/", verifyAuth, async (req: Request, res: Response) => {
  const db = getDb();
  const category = req.query.category as string | undefined;

  try {
    let query = db("coupons")
      .where("is_active", true)
      .where("valid_from", "<=", new Date())
      .where("valid_until", ">=", new Date());

    if (category) {
      query = query.where(function () {
        this.where("applicable_categories", "all")
          .orWhere("applicable_categories", "like", `%${category}%`);
      });
    }

    const coupons = await query.orderBy("created_at", "desc");
    res.json(coupons);
  } catch (error: any) {
    logger.error("GET /coupons error", { error: error.message });
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

export default router;
