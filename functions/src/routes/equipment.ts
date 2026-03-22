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
    let query = db("equipment_catalog").where("is_active", true);

    if (category) {
      query = query.where("category", category);
    }
    if (type) {
      query = query.where("type", type);
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
