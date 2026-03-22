import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { AuthRequest, verifyAuth } from "../middleware/auth";
import { logger } from "../utils/logger";

const router = Router();

// ── GET /notifications ──────────────────────────────────────

router.get("/", verifyAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const db = getDb();
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.page_size as string) || 20;
  const offset = (page - 1) * pageSize;

  try {
    const [notifications, countResult] = await Promise.all([
      db("notification_log")
        .where("user_id", authReq.uid)
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset(offset),
      db("notification_log")
        .where("user_id", authReq.uid)
        .count("id as count")
        .first(),
    ]);

    res.json({
      notifications,
      total: Number(countResult?.count || 0),
      page,
      page_size: pageSize,
    });
  } catch (error: any) {
    logger.error("GET /notifications error", { error: error.message });
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ── PUT /notifications/:id/read ─────────────────────────────

router.put("/:id/read", verifyAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const db = getDb();

  try {
    const updated = await db("notification_log")
      .where("id", req.params.id)
      .where("user_id", authReq.uid)
      .update({ is_read: true, read_at: new Date() });

    if (updated === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error("PUT /notifications/:id/read error", { error: error.message });
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// ── PUT /notifications/read-all ─────────────────────────────

router.put("/read-all", verifyAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const db = getDb();

  try {
    await db("notification_log")
      .where("user_id", authReq.uid)
      .where("is_read", false)
      .update({ is_read: true, read_at: new Date() });

    res.json({ success: true });
  } catch (error: any) {
    logger.error("PUT /notifications/read-all error", { error: error.message });
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

export default router;
