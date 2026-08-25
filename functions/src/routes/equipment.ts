import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { AuthRequest, verifyAuth } from "../middleware/auth";
import { logger } from "../utils/logger";
import { v4 as uuidv4 } from "uuid";
import {
  validateBody,
  equipmentReviewSchema,
} from "../utils/validators";

const router = Router();

// ── GET /equipment ──────────────────────────────────────────

router.get("/", verifyAuth, async (req: Request, res: Response) => {
  const db = getDb();
  const category = req.query.category as string | undefined;
  const type = req.query.type as string | undefined;
  const search = req.query.search as string | undefined;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.page_size as string) || 20;
  const offset = (page - 1) * pageSize;

  try {
    // `equipment_catalog` has no is_active / type column. It has `status`
    // ('Active'/'Inactive') and the two availability booleans, which is also
    // how the Flutter client models an item — EquipmentItem.type is a DERIVED
    // getter (availableForRent ? 'Rental' : 'Sale'), never a stored field.
    // Querying the phantom columns made this listing a guaranteed 500, so the
    // equipment catalog has never loaded from the API.
    let query = db("equipment_catalog").where("status", "Active");

    if (category) {
      query = query.where("category", category);
    }
    if (type) {
      const t = type.toLowerCase();
      if (t === "rental" || t === "rent") {
        query = query.where("available_for_rent", true);
      } else if (t === "sale" || t === "buy") {
        query = query.where("available_for_sale", true);
      }
    }
    if (search && search.trim()) {
      query = query.where(function () {
        this.where("name", "like", `%${search}%`).orWhere(
          "description",
          "like",
          `%${search}%`
        );
      });
    }

    const [items, countResult] = await Promise.all([
      query.clone().orderBy("sort_order", "asc").limit(pageSize).offset(offset),
      query.clone().count("id as count").first(),
    ]);

    res.json({
      items,
      total: Number(countResult?.count || 0),
      page,
      page_size: pageSize,
    });
  } catch (error: any) {
    logger.error("GET /equipment error", { error: error.message });
    res.status(500).json({ error: "Failed to fetch equipment" });
  }
});


// ── GET /equipment/:id/reviews ──────────────────────────────
//
// The review list and its composer are on every equipment item. Neither had a
// route: the GET returned nothing so the list rendered from a local array,
// and the POST failed into a catch that printed "Thank you for your review!"
//
// Only `published` rows are returned, and no author id leaves the server —
// what a reviewer is called in public is a stored display name, never
// re-derived from the patient record.
router.get(
  "/:id/reviews",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();
    try {
      const rows = await db("equipment_reviews")
        .where("equipment_id", req.params.id)
        .where("status", "published")
        .orderBy("created_at", "desc")
        .limit(50);

      res.json({
        reviews: rows.map((r: any) => ({
          id: r.id,
          user_name: r.display_name || "Housepital customer",
          rating: Number(r.rating),
          text: r.text || null,
          date: r.created_at,
        })),
      });
    } catch (error: any) {
      logger.error("GET /equipment/:id/reviews error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to load reviews" });
    }
  }
);

// ── POST /equipment/:id/reviews ─────────────────────────────
//
// One review per person per item, enforced by a unique key AND by an upsert
// here — a second submission edits the first rather than erroring, because
// the alternative is a dead button with no explanation.
router.post(
  "/:id/reviews",
  verifyAuth,
  async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const db = getDb();
    const data = validateBody(equipmentReviewSchema, req.body);

    try {
      const item = await db("equipment_catalog")
        .where("id", req.params.id)
        .first();
      if (!item) {
        res.status(404).json({ error: "Equipment item not found" });
        return;
      }

      const author = await db("family_members")
        .where("id", authReq.userId)
        .first();
      // First name only. A review is public; a full name on a healthcare
      // product is more disclosure than anyone intends when they tap submit.
      const displayName = (author?.name || "").trim().split(/\s+/)[0] || null;

      const existing = await db("equipment_reviews")
        .where("equipment_id", req.params.id)
        .where("author_id", authReq.userId)
        .first();

      if (existing) {
        await db("equipment_reviews").where("id", existing.id).update({
          rating: data.rating,
          text: data.text || null,
          updated_at: new Date(),
        });
        res.json({ id: existing.id, updated: true });
        return;
      }

      const id = uuidv4();
      await db("equipment_reviews").insert({
        id,
        equipment_id: req.params.id,
        patient_id: authReq.patientId,
        author_id: authReq.userId,
        display_name: displayName,
        rating: data.rating,
        text: data.text || null,
        status: "published",
        created_at: new Date(),
        updated_at: new Date(),
      });

      res.status(201).json({ id, updated: false });
    } catch (error: any) {
      logger.error("POST /equipment/:id/reviews error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to submit review" });
    }
  }
);

export default router;
