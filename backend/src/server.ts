// backend/src/server.ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { createServer } from "http";
import authRoutes from "./routes/authRoutes";
import fileRoutes from "./routes/fileRoutes";
import fileRoutesV2 from "./routes/fileRoutes.v2";
import fileRoutesV3 from "./routes/fileRoutes.v3";
import cryptoRoutes from "./routes/cryptoRoutes";
import migrationRoutes from "./routes/migrationRoutes";
import recoveryRoutes from "./routes/recoveryRoutes";
import accountRoutes from "./routes/accountRoutes";
import adminRoutes from "./routes/adminRoutes";
import securityRoutes from "./routes/securityRoutes";
import fileRequestRoutes from "./routes/fileRequestRoutes";
import teamRoutes from "./routes/teamRoutes";
import activityRoutes from "./routes/activityRoutes";
import { publicDownload } from "./controllers/fileController";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { httpsRedirect, hstsHeader } from "./middleware/httpsRedirect";
import { advancedSecurityHeaders, securityContext } from "./middleware/securityHeaders";
import { cspNonceMiddleware } from "./middleware/cspNonce";
import { initializeWebSocket } from "./lib/websocket";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";

// Enable trust proxy for Cloudflare/nginx deployments
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", true);
  console.log("✅ Trust proxy enabled (behind Cloudflare/nginx)");
}

// Validate critical production environment variables
if (NODE_ENV === "production") {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64) {
    console.error("🔴 FATAL: JWT_SECRET must be set and >= 64 characters in production");
    process.exit(1);
  }
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.error("🔴 FATAL: R2 credentials must be set in production");
    process.exit(1);
  }
} else {
  // Dev mode warnings
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-insecure-secret") {
    console.warn("⚠️  WARNING: Using insecure JWT_SECRET in development mode");
  }
}

// --- CORS CONFIGURATION (FAZ 5: Allowlist) ---
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:3000", "http://192.168.1.125:3000", "http://192.168.1.125:8082"];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Development mode: allow all origins
    if (NODE_ENV === "development") {
      return callback(null, true);
    }
    
    if (CORS_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS rejected origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // FAZ 6: Allow cookies (refresh token)
};

// --- SECURITY: HTTPS Redirect (MUST be first middleware) ---
app.use(httpsRedirect);
app.use(hstsHeader);

app.use(cors(corsOptions));

// --- MIDDLEWARE: Body & Cookie Parsers (MUST be before routes) ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // FAZ 6: Required for refresh token cookies

// --- SECURITY HEADERS (FAZ 5: Helmet + Advanced) ---
app.use(
  helmet({
    hsts: NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    contentSecurityPolicy: false, // Configured separately below
    crossOriginEmbedderPolicy: false,
  })
);

// --- ADVANCED SECURITY HEADERS ---
app.use(cspNonceMiddleware); // FAZ 7: Generate unique nonce for CSP
app.use(advancedSecurityHeaders);
app.use(securityContext);

// --- CSP ENFORCED MODE (FAZ 5: Production) ---
if (NODE_ENV === "production" && process.env.CSP_ENABLED === "true") {
  const cspReportUri = process.env.CSP_REPORT_URI || "/api/security/csp-report";
  
  app.use((req, res, next) => {
    helmet.contentSecurityPolicy({
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", `'nonce-${res.locals.cspNonce}'`], // FAZ 7: Use nonce instead of unsafe-inline
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Next.js requires unsafe-inline
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", process.env.FRONTEND_URL || "https://yourdomain.com"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
        reportUri: [cspReportUri],
      },
      reportOnly: false, // Enforce in production
    })(req, res, next);
  });
  console.log("✅ CSP enabled in ENFORCE mode");
} else if (NODE_ENV === "production") {
  // Report-only mode for gradual rollout
  app.use(
    helmet.contentSecurityPolicy({
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
      reportOnly: true,
    })
  );
  console.log("⚠️  CSP enabled in REPORT-ONLY mode");
}

// --- REQUEST ID MIDDLEWARE (FAZ 5: Correlation ID) ---
app.use((req, res, next) => {
  const requestId = randomUUID();
  (req as any).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

// --- COOKIE PARSER (FAZ 6: Refresh token cookies) ---
app.use(cookieParser());

// --- BODY PARSER (FAZ 5: Payload limits) ---
app.use(express.json({ limit: "10mb" })); // Limit for encrypted metadata

// --- ROUTES ---
app.use("/auth", authRoutes);
app.use("/files", fileRoutes);
app.use("/api/files/v2", fileRoutesV2); // FAZ 2: Presigned URL endpoints
app.use("/api/files/v3", fileRoutesV3); // FAZ 3: Zero-knowledge encrypted files
app.use("/api/crypto", cryptoRoutes); // FAZ 3: KDF initialization
app.use("/api/migration", migrationRoutes); // FAZ 4: Migration endpoints
app.use("/api/crypto/recovery", recoveryRoutes); // FAZ 4: Recovery key management
app.use("/api/security", securityRoutes); // FAZ 5: Security endpoints (CSP report)
app.use("/account", accountRoutes);
app.use("/api/admin", adminRoutes); // Admin routes
app.use("/file-requests", fileRequestRoutes); // Dosya istekleri (File Requests)
app.use("/api/team", teamRoutes); // Ekip yönetimi (Team Management)
app.use("/api/activities", activityRoutes); // Etkinlikler (Activity Feed)
// Public share download route (no auth)
app.get("/share/:token", publicDownload);

// basit sağlık kontrolü
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// --- ERROR HANDLERS (FAZ 5: Must be last) ---
app.use(notFoundHandler);
app.use(errorHandler);

const httpServer = createServer(app);

// WebSocket sunucusunu başlat
initializeWebSocket(httpServer);

httpServer.listen(Number(PORT), HOST, () => {
  console.log(`Server çalışıyor: http://${HOST}:${PORT}`);
  console.log(`WebSocket hazır: ws://${HOST}:${PORT}`);
});

