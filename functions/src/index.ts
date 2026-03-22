import * as functions from "firebase-functions";
import express from "express";
import cors from "cors";
import helmet from "helmet";

// Import route handlers
import authRoutes from "./routes/auth";
// Phase 2+: uncomment as routes are built
// import patientRoutes from "./routes/patients";
// import serviceRoutes from "./routes/services";
// import bookingRoutes from "./routes/bookings";
// import assessmentRoutes from "./routes/assessments";
// import billingRoutes from "./routes/billing";
// import paymentRoutes from "./routes/payments";
// import concernRoutes from "./routes/concerns";
// import ratingRoutes from "./routes/ratings";
// import notificationRoutes from "./routes/notifications";
// import equipmentRoutes from "./routes/equipment";
// import medicationRoutes from "./routes/medications";
// import deploymentRoutes from "./routes/deployments";
// import couponRoutes from "./routes/coupons";
// import familyRoutes from "./routes/family";

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
// Phase 2+: uncomment as routes are built
// app.use("/patients", patientRoutes);
// app.use("/services", serviceRoutes);
// app.use("/bookings", bookingRoutes);
// app.use("/assessments", assessmentRoutes);
// app.use("/billing", billingRoutes);
// app.use("/payments", paymentRoutes);
// app.use("/concerns", concernRoutes);
// app.use("/ratings", ratingRoutes);
// app.use("/notifications", notificationRoutes);
// app.use("/equipment", equipmentRoutes);
// app.use("/medications", medicationRoutes);
// app.use("/deployments", deploymentRoutes);
// app.use("/coupons", couponRoutes);
// app.use("/family", familyRoutes);

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
