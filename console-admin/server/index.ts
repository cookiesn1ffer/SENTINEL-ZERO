import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import {
  accessRequest,
  closeRogueSockets,
  currentMode,
  DEVICE_ID,
  forceFreshToken,
  killSwitchStatus,
  manifestViolationRequest,
  openRogueSockets,
  postureRead,
  reportPosture,
  requestBrowserBaseline,
  rogueSocketsOpen,
  setMode,
  SYS1_URL,
} from "./sentinel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // Console <-> browser CORS (dev runs the UI on a different port than this API).
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // -------- console API: things only a real backend process can do --------
  const api = express.Router();

  api.get("/health", async (_req, res) => {
    res.json({ ok: true, device_id: DEVICE_ID, sys1_url: SYS1_URL, mode: await currentMode() });
  });

  api.get("/mode", async (_req, res) => {
    res.json({ mode: await currentMode() });
  });

  api.post("/mode", (req, res) => {
    const next = req.body?.mode === "manual" ? "manual" : "auto";
    setMode(next);
    res.json({ mode: next });
  });

  // Attack 1 — port exposure. Opens real listening sockets (visible to any
  // real port scanner, not faked), then shows a baseline browser request
  // flip from ALLOW to CHALLENGE once posture reflects them.
  api.post("/attack1/run", async (_req, res) => {
    try {
      const before = await requestBrowserBaseline(await postureRead());
      const opened = await openRogueSockets();
      await new Promise((r) => setTimeout(r, 800));
      const posture = await postureRead();
      const postureResp = await reportPosture(posture);
      const after = await requestBrowserBaseline(posture);
      res.json({ opened, postureScore: postureResp.posture_score_component, before, after });
    } catch (e: any) {
      res.status(502).json({ error: e?.response?.data ?? e?.message ?? String(e) });
    }
  });

  api.post("/attack1/reset", (_req, res) => {
    const closed = closeRogueSockets();
    res.json({ closed });
  });

  api.get("/attack1/status", (_req, res) => {
    res.json({ rogueSocketsOpen: rogueSocketsOpen() });
  });

  // Attack 2 — impossible travel. Same token, two geos 5s apart.
  api.post("/attack2/run", async (_req, res) => {
    try {
      await forceFreshToken();
      const first = await accessRequest("Pune");
      await new Promise((r) => setTimeout(r, 5000));
      const second = await accessRequest("Singapore");
      res.json({ first, second });
    } catch (e: any) {
      res.status(502).json({ error: e?.response?.data ?? e?.message ?? String(e) });
    }
  });

  // Attack 3 — manifest violation. 'notes' suddenly requests 'network'.
  api.post("/attack3/run", async (_req, res) => {
    try {
      const result = await manifestViolationRequest();
      const killStatus = await killSwitchStatus();
      res.json({ result, killStatus });
    } catch (e: any) {
      res.status(502).json({ error: e?.response?.data ?? e?.message ?? String(e) });
    }
  });

  app.use("/api/console", api);

  // -------- static frontend (production build only; dev uses Vite) --------
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  if (process.env.NODE_ENV === "production") {
    app.use(express.static(staticPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  const port = process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 3001);

  server.listen(port, () => {
    console.log(`[console-api] listening on http://localhost:${port}  (sys1 @ ${SYS1_URL})`);
  });
}

startServer().catch(console.error);
