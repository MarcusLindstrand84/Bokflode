import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createHash, timingSafeEqual } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import rateLimit from "express-rate-limit";
import { router } from "./routes.js";
import { appendAudit } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function allowedOrigins() {
  const origins = new Set([
    "http://127.0.0.1:5173",
    "http://localhost:5173"
  ]);
  const extra = (process.env.FRONTEND_ORIGIN ?? "").trim();
  if (extra) origins.add(extra.replace(/\/$/, ""));
  return origins;
}

export function getAuthConfig() {
  return {
    secret: process.env.SESSION_SECRET ?? "",
    password: process.env.BOKFLODE_PASSWORD ?? "",
    user: process.env.BOKFLODE_USER || "bokflode"
  };
}

export function assertAuthConfig() {
  const { secret, password } = getAuthConfig();
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET saknas eller är för kort (minst 16 tecken). Se server/.env.example.");
  }
  if (!password) {
    throw new Error("BOKFLODE_PASSWORD saknas. Se server/.env.example.");
  }
}

function safeEqual(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function isPublicApi(req) {
  const p = req.path;
  if (req.method === "GET" && p === "/health") return true;
  if (req.method === "POST" && p === "/auth/login") return true;
  if (req.method === "POST" && p === "/auth/logout") return true;
  if (req.method === "GET" && p === "/auth/me") return true;
  return false;
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function createApp() {
  assertAuthConfig();
  const { secret, password, user: expectedUser } = getAuthConfig();
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }));

  const origins = allowedOrigins();
  app.use(cors({
    origin(origin, cb) {
      if (!origin || origins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true
  }));

  app.use(express.json({ limit: "1mb" }));

  app.use(session({
    name: "bokflode.sid",
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 8 * 60 * 60 * 1000
    }
  }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: { ok: false, error: "För många inloggningsförsök. Vänta och försök igen." }
  });
  app.use("/api/auth/login", loginLimiter);

  app.use("/api", (req, res, next) => {
    if (isPublicApi(req)) return next();
    if (req.session?.user) return next();
    return res.status(401).json({ ok: false, error: "Inte inloggad." });
  });

  const authRouter = express.Router();

  authRouter.post("/login", (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const pass = String(req.body?.password ?? "");
    const userOk = safeEqual(username, expectedUser);
    const passOk = safeEqual(pass, password);
    if (!userOk || !passOk) {
      appendAudit("login_fail", "ogiltiga uppgifter", false);
      return res.status(401).json({ ok: false, error: "Fel användarnamn eller lösenord." });
    }
    req.session.user = expectedUser;
    res.json({ ok: true, username: expectedUser });
  });

  authRouter.post("/logout", (req, res) => {
    const done = () => {
      res.clearCookie("bokflode.sid");
      res.json({ ok: true });
    };
    if (!req.session) return done();
    req.session.destroy(() => done());
  });

  authRouter.get("/me", (req, res) => {
    if (req.session?.user) {
      return res.json({ authenticated: true, username: req.session.user });
    }
    res.json({ authenticated: false });
  });

  app.use("/api/auth", authRouter);
  app.use("/api", router);

  const dist = path.resolve(__dirname, "../../client/dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(dist, "index.html"), (err) => {
        if (err) next();
      });
    });
  }

  app.use((err, _req, res, _next) => {
    if (err?.type === "entity.parse.failed" || err instanceof SyntaxError) {
      return res.status(400).json({ ok: false, error: "Ogiltig JSON." });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ ok: false, error: "För stor begäran." });
    }
    console.error(err);
    res.status(500).json({
      ok: false,
      error: isProduction() ? "Ett oväntat fel uppstod." : (err.message || "Ett oväntat fel uppstod.")
    });
  });

  return app;
}
