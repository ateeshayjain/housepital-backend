import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { verifyAuth } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();

// ── GET /services ───────────────────────────────────────────

router.get("/", verifyAuth, async (_req: Request, res: Response) => {
  const db = getDb();

  try {
    const services = await db("service_catalog")
      .where("is_active", true)
      .orderBy("display_order", "asc");

    const formatted = services.map((s: any) => ({
      ...s,
      // Hide prices for manpower services (caretaker, nursing, japa, nanny)
      base_price_min: s.hide_price ? null : s.base_price_min,
      base_price_max: s.hide_price ? null : s.base_price_max,
    }));

    res.json({ services: formatted });
  } catch (error: any) {
    logger.error("GET /services error", { error: error.message });
    res.status(500).json({ error: "Failed to fetch services" });
  }
});

// ── GET /services/:id ───────────────────────────────────────

router.get("/:id", verifyAuth, async (req: Request, res: Response) => {
  const db = getDb();

  try {
    const service = await db("service_catalog")
      .where("id", req.params.id)
      .first();

    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    res.json({
      service: {
        ...service,
        base_price_min: service.hide_price ? null : service.base_price_min,
        base_price_max: service.hide_price ? null : service.base_price_max,
      },
    });
  } catch (error: any) {
    logger.error("GET /services/:id error", { error: error.message });
    res.status(500).json({ error: "Failed to fetch service" });
  }
});

export default router;
