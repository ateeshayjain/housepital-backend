import * as functions from "firebase-functions";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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

// ── Rate Limiters ───────────────────────────────────────────

// General rate limit: 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// Strict rate limit for auth: 5 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many authentication attempts. Please try again later." },
});

// Payment rate limit: 10 requests per 15 minutes
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many payment requests. Please try again later." },
});

// ── CORS ────────────────────────────────────────────────────

const allowedOrigins = [
  "https://housepital-patient.web.app",
  "https://housepital-patient.firebaseapp.com",
  "http://localhost:8080", // dev
  "http://localhost:8082", // dev
];

// ── Express App ──────────────────────────────────────────────

const app = express();

// Security & parsing
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);
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

app.use("/auth", authLimiter, authRoutes);
app.use("/patients", generalLimiter, patientRoutes);
app.use("/deployments", generalLimiter, deploymentRoutes);
app.use("/staff", generalLimiter, staffRoutes);
app.use("/reports", generalLimiter, reportRoutes);
app.use("/", generalLimiter, familyRoutes); // family routes mount at /patients/:patientId/family AND /family/:memberId
app.use("/services", generalLimiter, serviceRoutes);
app.use("/", generalLimiter, bookingRoutes); // /bookings (POST) + /patients/:patientId/bookings (GET)
app.use("/", generalLimiter, assessmentRoutes); // /assessments (POST) + /patients/:patientId/assessments (GET)
app.use("/", generalLimiter, billingRoutes); // /patients/:patientId/billing + /invoices/:id + /transactions/:id
app.use("/payments", paymentLimiter, paymentRoutes);
app.use("/", generalLimiter, concernRoutes); // /concerns (POST) + /patients/:patientId/concerns (GET)
app.use("/ratings", generalLimiter, ratingRoutes);
app.use("/notifications", generalLimiter, notificationRoutes);
app.use("/equipment", generalLimiter, equipmentRoutes);
app.use("/patients", generalLimiter, medicationRoutes); // /patients/:patientId/medications, /patients/:patientId/medication-logs
app.use("/coupons", generalLimiter, couponRoutes);

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
