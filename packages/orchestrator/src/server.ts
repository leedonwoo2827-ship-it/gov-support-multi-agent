// orchestrator — Hono REST API + SSE
import "dotenv/config";
import { networkInterfaces } from "node:os";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getDb } from "./db/client.js";
import searchRoute from "./routes/search.js";
import casesRoute from "./routes/cases.js";
import postsRoute from "./routes/posts.js";
import runsRoute from "./routes/runs.js";
import eventsRoute from "./routes/events.js";
import exportRoute from "./routes/export.js";
import programsRoute from "./routes/programs.js";
import profilesRoute from "./routes/profiles.js";
import settingsRoute from "./routes/settings.js";
import adminRoute from "./routes/admin.js";

// DB 초기화 (스키마 자동 적용)
getDb();

const app = new Hono();
app.use("*", logger());
app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/", (c) =>
  c.json({
    name: "gov-support-multi-agent",
    version: "0.1.0",
    endpoints: [
      "POST /api/search",
      "GET  /api/programs",
      "POST /api/cases",
      "GET  /api/cases",
      "GET  /api/cases/:id",
      "POST /api/cases/:id/run-all",
      "POST /api/cases/:id/agents/:agentId/run",
      "POST /api/runs/bulk",
      "GET  /api/runs/:id",
      "GET  /api/posts",
      "GET  /api/posts/:id",
      "GET  /api/events/case/:id  (SSE)",
      "GET  /api/events/global    (SSE)",
      "GET  /api/export/db",
      "GET  /api/export/programs/csv",
      "GET  /api/export/posts/csv",
      "GET  /api/export/cases/:id/json",
      "GET  /api/export/cases/:id/md",
    ],
  }),
);

app.route("/api/search", searchRoute);
app.route("/api/programs", programsRoute);
app.route("/api/profiles", profilesRoute);
app.route("/api/cases", casesRoute);
app.route("/api/posts", postsRoute);
app.route("/api/runs", runsRoute);
app.route("/api/events", eventsRoute);
app.route("/api/export", exportRoute);
app.route("/api/settings", settingsRoute);
app.route("/api/admin", adminRoute);

function getLanIps(): string[] {
  const ips: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

const port = Number(process.env.ORCHESTRATOR_PORT ?? 8787);
serve({ fetch: app.fetch, port }, ({ port }) => {
  const lans = getLanIps();
  console.log("");
  console.log("┌─ orchestrator (정부지원 멀티에이전트 API)");
  console.log(`│  Local    : http://localhost:${port}`);
  for (const ip of lans) {
    console.log(`│  Network  : http://${ip}:${port}`);
  }
  console.log(`│  DB       : ${process.env.DB_PATH ?? "./data/gov.db"}`);
  console.log(`│  Mock     : ${process.env.ANTHROPIC_API_KEY ? "off (실 Claude 호출)" : "on (키 없음 — 더미 응답)"}`);
  console.log("└──────────────────────────────────────────────");
  console.log("");
});
