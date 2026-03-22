import { Router, Request, Response } from "express";
import { getDb } from "../config/cloudSql";
import {
  verifyAuth,
  verifyPatientAccess,
} from "../middleware/auth";
import { parseJsonCol } from "../utils/helpers";
import { logger } from "../utils/logger";

const router = Router();

// ── GET /patients/:patientId/billing ────────────────────────
// Returns quick billing overview: amount_due + due_date

router.get(
  "/patients/:patientId/billing",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.patientId;

    try {
      const result = await db("invoices")
        .where("patient_id", patientId)
        .where("status", "pending")
        .select(
          db.raw("COALESCE(SUM(grand_total), 0) as amount_due"),
          db.raw("MIN(due_date) as due_date")
        )
        .first();

      res.json({
        amount_due: Number(result?.amount_due || 0),
        due_date: result?.due_date || null,
      });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/billing error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch billing info" });
    }
  }
);

// ── GET /patients/:patientId/billing/summary ────────────────

router.get(
  "/patients/:patientId/billing/summary",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.patientId;

    try {
      // Total outstanding
      const outstanding = await db("invoices")
        .where("patient_id", patientId)
        .where("status", "pending")
        .select(db.raw("COALESCE(SUM(grand_total), 0) as total"))
        .first();

      // Total paid
      const paid = await db("payments")
        .where("patient_id", patientId)
        .where("status", "captured")
        .select(db.raw("COALESCE(SUM(amount), 0) as total"))
        .first();

      // Overdue invoices
      const overdue = await db("invoices")
        .where("patient_id", patientId)
        .where("status", "pending")
        .where("due_date", "<", new Date())
        .select(db.raw("COALESCE(SUM(grand_total), 0) as total"))
        .first();

      // Next due date
      const nextDue = await db("invoices")
        .where("patient_id", patientId)
        .where("status", "pending")
        .where("due_date", ">=", new Date())
        .orderBy("due_date", "asc")
        .select("due_date", "grand_total")
        .first();

      // Recent invoices
      const recentInvoices = await db("invoices")
        .where("patient_id", patientId)
        .orderBy("created_at", "desc")
        .limit(5);

      res.json({
        total_outstanding: Number(outstanding?.total || 0),
        total_paid: Number(paid?.total || 0),
        overdue_amount: Number(overdue?.total || 0),
        next_due_date: nextDue?.due_date || null,
        next_due_amount: nextDue ? Number(nextDue.grand_total) : null,
        recent_invoices: recentInvoices.map((inv: any) => ({
          ...inv,
          line_items: parseJsonCol(inv.line_items),
        })),
      });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/billing/summary error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch billing summary" });
    }
  }
);

// ── GET /patients/:patientId/invoices ───────────────────────

router.get(
  "/patients/:patientId/invoices",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const offset = (page - 1) * pageSize;

    try {
      const invoices = await db("invoices")
        .where("patient_id", req.params.patientId)
        .orderBy("created_at", "desc")
        .limit(pageSize)
        .offset(offset);

      const formatted = invoices.map((inv: any) => ({
        ...inv,
        line_items: parseJsonCol(inv.line_items),
      }));

      res.json({ invoices: formatted });
    } catch (error: any) {
      logger.error("GET /patients/:patientId/invoices error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  }
);

// ── GET /invoices/:id ───────────────────────────────────────

router.get(
  "/invoices/:id",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const invoice = await db("invoices")
        .where("id", req.params.id)
        .first();

      if (!invoice) {
        res.status(404).json({ error: "Invoice not found" });
        return;
      }

      res.json({
        invoice: {
          ...invoice,
          line_items: parseJsonCol(invoice.line_items),
        },
      });
    } catch (error: any) {
      logger.error("GET /invoices/:id error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch invoice" });
    }
  }
);

// ── GET /patients/:patientId/transactions ───────────────────

router.get(
  "/patients/:patientId/transactions",
  verifyAuth,
  verifyPatientAccess,
  async (req: Request, res: Response) => {
    const db = getDb();
    const patientId = req.params.patientId;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    try {
      let query = db("payments")
        .where("patient_id", patientId)
        .orderBy("created_at", "desc")
        .limit(limit);

      if (status) {
        query = query.where("status", status);
      }

      const transactions = await query;
      res.json(transactions);
    } catch (error: any) {
      logger.error("GET /patients/:patientId/transactions error", {
        error: error.message,
      });
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  }
);

// ── GET /transactions/:id ───────────────────────────────────

router.get(
  "/transactions/:id",
  verifyAuth,
  async (req: Request, res: Response) => {
    const db = getDb();

    try {
      const transaction = await db("payments")
        .where("id", req.params.id)
        .first();

      if (!transaction) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }

      res.json(transaction);
    } catch (error: any) {
      logger.error("GET /transactions/:id error", { error: error.message });
      res.status(500).json({ error: "Failed to fetch transaction" });
    }
  }
);

export default router;
