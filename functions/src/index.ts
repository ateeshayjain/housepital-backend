import * as functions from "firebase-functions";
import express from "express";
import cors from "cors";
import helmet from "helmet";

// Import route handlers
import authRoutes from "./routes/auth";
import patientRoutes from "./routes/patients";
import deploymentRoutes from "./routes/deployments";
import staffRoutes from "./routes/staff";
import reportRoutes from "./routes/reports";
import familyRoutes from "./routes/family";
import serviceRoutes from "./routes/services";
import bookingRoutes from "./routes/bookings";
import assessmentRoutes from "./routes/assessments";
import billingRoutes from "./routes/billing";
import paymentRoutes from "./routes/payments";
import concernRoutes from "./routes/concerns";
import ratingRoutes from "./routes/ratings";
import notificationRoutes from "./routes/notifications";
import equipmentRoutes from "./routes/equipment";
import medicationRoutes from "./routes/medications";
import couponRoutes from "./routes/coupons";

import { errorHandler } from "./middleware/errorHandler";

// ── Express App ──────────────────────────────────────────────

const app = express();

// Security & parsing
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ───────────────────────────────────────────────────

app.use("/auth", authRoutes);
app.use("/patients", patientRoutes);
app.use("/deployments", deploymentRoutes);
app.use("/staff", staffRoutes);
app.use("/reports", reportRoutes);
app.use("/", familyRoutes); // family routes mount at /patients/:patientId/family AND /family/:memberId
app.use("/services", serviceRoutes);
app.use("/", bookingRoutes); // /bookings (POST) + /patients/:patientId/bookings (GET)
app.use("/", assessmentRoutes); // /assessments (POST) + /patients/:patientId/assessments (GET)
app.use("/", billingRoutes); // /patients/:patientId/billing + /invoices/:id + /transactions/:id
app.use("/payments", paymentRoutes);
app.use("/", concernRoutes); // /concerns (POST) + /patients/:patientId/concerns (GET)
app.use("/ratings", ratingRoutes);
app.use("/notifications", notificationRoutes);
app.use("/equipment", equipmentRoutes);
app.use("/patients", medicationRoutes); // /patients/:patientId/medications, /patients/:patientId/medication-logs
app.use("/coupons", couponRoutes);

// Error handler (must be last)
app.use(errorHandler);

// ── Export as Cloud Function ─────────────────────────────────

// Export Express app as a single Cloud Function
// All routes are served under /api/...
export const api = functions
  .region("asia-south1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
    minInstances: 0,
  })
  .https.onRequest(app);
