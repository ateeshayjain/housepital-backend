import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import { verifyAuth } from "../middleware/auth";
import { parseJsonCol } from "../utils/helpers";
import { logger } from "../utils/logger";

const router = Router();

// ── GET /staff/:id/profile ───────────────────────────────────

router.get(
  "/:id/profile",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();
    const staffId = req.params.id;

    try {
      const staff = await db("staff").where("id", staffId).first();

      if (!staff) {
        res.status(404).json({ error: "Staff not found" });
        return;
      }

      // Get recent reviews
      const reviews = await db("staff_reviews")
        .where("staff_id", staffId)
        .orderBy("created_at", "desc")
        .limit(10);

      const formattedReviews = reviews.map((r: any) => ({
        id: r.id,
        patient_name: r.patient_name || "Family Member",
        rating: r.rating,
        comment: r.comment || null,
        date: r.created_at,
      }));

      // Get verification documents (limited view — no URLs for sensitive docs)
      const documents = await db("staff_documents")
        .where("staff_id", staffId)
        .select("type", "label", "status", "verified_at");

      // Filter out sensitive document types from the URL
      const safeDocuments = documents.map((d: any) => ({
        type: d.type,
        label: d.label || d.type,
        status: d.status || "pending",
        verified_at: d.verified_at || null,
        // No document_url exposed to family — sensitive info
        document_url: null,
      }));

      // Return limited profile — NO salary, address, Aadhaar, PAN
      res.json({
        staff: {
          id: staff.id,
          name: staff.name,
          photo_url: staff.photo_url || null,
          role: staff.role,
          rating: staff.rating || null,
          total_reviews: staff.total_reviews || formattedReviews.length,
          id_verified: staff.id_verified || false,
          training_complete: staff.training_complete || false,
          police_verified: staff.police_verified || false,
          languages: parseJsonCol(staff.languages),
          experience: staff.experience || null,
          assigned_since: staff.assigned_since || null,
          documents: safeDocuments,
          reviews: formattedReviews,
        },
      });
    } catch (error: any) {
      logger.error("GET staff profile error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch staff profile" });
    }
  }
);

export default router;
