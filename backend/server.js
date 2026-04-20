/**
 * Builddy AI-Tool Scaffold — Express Server
 * Health check, API routes, AI proxy, error handler, graceful shutdown.
 *
 * Modification Points:
 *   // {{MIDDLEWARE_INSERTION_POINT}}  — Add custom middleware here
 *   // {{ROUTE_INSERTION_POINT}}       — Add custom API routes here
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { initSchema, closeDb } from "./db.js";
import { rateLimiter, requireAuth, requestLogger, corsMiddleware, sanitizeInput } from "./middleware.js";
import authRoutes from "./routes/auth.js";
import apiRoutes from "./routes/api.js";
import aiRoutes from "./routes/ai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, "..", "frontend");
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

const app = express();

// {{MIDDLEWARE_INSERTION_POINT}}
// Serve onboarding assets (e.g. welcome page images, tutorial files)

app.use(corsMiddleware(ALLOWED_ORIGINS));
app.use(requestLogger);
app.use(rateLimiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);
app.use(express.static(STATIC_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime(), auth: true, ai: true });
});

app.use("/api/auth", authRoutes);
app.use("/api", apiRoutes);
app.use("/api/ai", aiRoutes);

// {{ROUTE_INSERTION_POINT}}

app.get("*", (_req, res) => { res.sendFile(path.join(STATIC_DIR, "index.html")); });

app.use((err, _req, res, _next) => {
  console.error("[server] Unhandled error:", err);
  if (err.type === "entity.parse.failed") return res.status(400).json({ success: false, error: "Invalid JSON" });
  res.status(err.statusCode || 500).json({ success: false, error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
});

let server = null;

function start() {
  initSchema();
  server = app.listen(PORT, () => {
    console.log(`[server] Running on http://localhost:${PORT}`);
    console.log(`[server] AI proxy enabled`);
  });
}

function gracefulShutdown(signal) {
  console.log(`\n[server] ${signal}. Shutting down...`);
  if (server) {
    server.close(() => { closeDb(); process.exit(0); });
    setTimeout(() => { closeDb(); process.exit(1); }, 10_000);
  } else { closeDb(); process.exit(0); }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

if (process.argv[1] === __filename || process.argv[1]?.endsWith("server.js")) start();

export { app, start };
