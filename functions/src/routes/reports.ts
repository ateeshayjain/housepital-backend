import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { verifyAuth } from "../middleware/auth";
import { parseJsonCol } from "../utils/helpers";
import { logger } from "../utils/logger";

const router = Router();

// ── GET /reports/:id ─────────────────────────────────────────

router.get(
  "/:id",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();
    const reportId = req.params.id;

    try {
      const report = await db("daily_reports")
        .where("id", reportId)
        .first();

      if (!report) {
        res.status(404).json({ error: "Report not found" });
        return;
      }

      // Get staff name if not already on the record
      let staffName = report.staff_name;
      if (!staffName && report.staff_id) {
        const staff = await db("staff")
          .where("id", report.staff_id)
          .select("name")
          .first();
        staffName = staff?.name || null;
      }

      res.json({
        report: {
          ...report,
          staff_name: staffName,
          sections: parseJsonCol(report.sections),
          photo_urls: parseJsonCol(report.photo_urls),
          medications: parseJsonCol(report.medications),
        },
      });
    } catch (error: any) {
      logger.error("GET report detail error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch report" });
    }
  }
);

export default router;
