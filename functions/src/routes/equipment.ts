import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { verifyAuth } from "../middleware/auth";
import { logger } from "../utils/logger";

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

export default router;
