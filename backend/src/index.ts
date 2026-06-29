import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import assetsRouter from "./routes/assets";
import officeRoutes from "./routes/offices";
import employeesRouter from "./routes/employees";
import exportRoutes from "./routes/export";
import settingsRouter from "./routes/settings";
import departmentsRouter from "./routes/departments";
import salaryLevelsRouter from "./routes/salary-levels";
import eventTypesRouter from "./routes/event-types";
import payrollRouter from "./routes/payroll";
import eventsRouter from "./routes/events";
import positionsRouter from "./routes/positions";
import { notificationsRouter } from "./routes/notifications";
import activityRouter from "./routes/activity";

import { requireAuth, requirePermissionSlugs } from "./middleware/auth";
import { getEnv, getEnvList } from "./lib/env";
import { runStartupMigrations } from "./db/startup-migration";
import { pool } from "./db/pool";
import { startPermissionCacheInvalidationListener } from "./lib/permissions-cache-listener";

// Run DB migrations on startup (non-blocking)
runStartupMigrations().catch((e) => console.warn("[startup-migration] failed:", e));
if (process.env.NODE_ENV !== "test") {
  startPermissionCacheInvalidationListener().catch((e) => console.warn("[permissions-cache-listener] failed:", e));
}


const app = express();
const PORT = Number.parseInt(getEnv("PORT", "4000"), 10);

const allowedOrigins = new Set([
  ...getEnvList("ALLOWED_ORIGINS", "FRONTEND_URL"),
]);

const allowVercelPreviews = getEnv("ALLOW_VERCEL_PREVIEWS", "false") === "true";

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-server and non-browser requests.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, origin);
      return;
    }

    if (allowVercelPreviews && origin.endsWith(".vercel.app")) {
      callback(null, origin);
      return;
    }

    const isLocalhost = origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
    if (process.env.NODE_ENV !== "production" && isLocalhost) {
      callback(null, origin);
      return;
    }

    callback(new Error("CORS origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

// Explicit OPTIONS handler for all routes to ensure preflight success
app.options("*", (req, res) => {
  res.sendStatus(200);
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
app.get("/", (_req, res) => {
  res.json({ message: "EL ERP API is running" });
});

app.get("/health", async (_req, res) => {
  try {
    // Ping DB to keep Supabase awake and verify connection health
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[health-check] Database connection error:", error);
    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: error.message || String(error),
      timestamp: new Date().toISOString()
    });
  }
});

// Auth routes (public)
app.use("/auth", authRouter);
app.use("/users", usersRouter);

// Protected routes
app.use("/assets", requireAuth, assetsRouter);
app.use("/items", requireAuth, assetsRouter); // Compatibility for old inventory-pro app
app.use("/api/inventory", requireAuth, assetsRouter); // Contract alias (e.g. /api/inventory/stats)
app.use("/offices", requireAuth, officeRoutes);
app.use("/stores", requireAuth, officeRoutes); // Compatibility for old inventory-pro app
app.use("/employees", requireAuth, employeesRouter);
app.use("/export", requireAuth, exportRoutes);
app.use("/settings", requireAuth, requirePermissionSlugs(["settings:write", "users:manage"]), settingsRouter);
app.use("/departments", requireAuth, departmentsRouter);
app.use("/positions", requireAuth, positionsRouter);
app.use("/salary-levels", requireAuth, requirePermissionSlugs(["salary-levels:manage"]), salaryLevelsRouter);
app.use("/event-types", requireAuth, eventTypesRouter);

app.use("/payroll", requireAuth, requirePermissionSlugs(["payroll:read", "payroll:write"]), payrollRouter);
app.use("/events", requireAuth, eventsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/activity", activityRouter);

// Error handler
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message || "Internal server error" });
  }
);

if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 EL ERP API running on http://localhost:${PORT}`);
  });
}

export default app;
