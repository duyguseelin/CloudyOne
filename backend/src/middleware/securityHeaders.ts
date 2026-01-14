// backend/src/middleware/securityHeaders.ts
import { Request, Response, NextFunction } from "express";

/**
 * Advanced Security Headers Middleware
 * Adds comprehensive security headers beyond Helmet defaults
 */
export const advancedSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  const NODE_ENV = process.env.NODE_ENV || "development";

  // X-Content-Type-Options: Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // X-Frame-Options: Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // X-XSS-Protection: Enable XSS filter (legacy, but still useful)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer-Policy: Control referrer information
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions-Policy: Restrict browser features
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()"
  );

  // X-Download-Options: Prevent IE from executing downloads
  res.setHeader("X-Download-Options", "noopen");

  // X-Permitted-Cross-Domain-Policies: Restrict Adobe Flash/PDF
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  // Clear-Site-Data on logout (implemented per route)
  // Cache-Control for sensitive endpoints
  if (req.path.includes("/admin") || req.path.includes("/account")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  // Production-only headers
  if (NODE_ENV === "production") {
    // Expect-CT: Certificate Transparency (deprecated but still useful)
    res.setHeader("Expect-CT", "max-age=86400, enforce");

    // X-Powered-By: Remove server fingerprinting (already handled by Helmet)
    res.removeHeader("X-Powered-By");
  }

  next();
};

/**
 * CSP Report Handler
 * Logs Content Security Policy violations
 */
export const cspReportHandler = (req: Request, res: Response) => {
  const report = req.body;
  
  console.error("🚨 CSP Violation Report:", {
    documentUri: report["document-uri"],
    violatedDirective: report["violated-directive"],
    blockedUri: report["blocked-uri"],
    sourceFile: report["source-file"],
    lineNumber: report["line-number"],
    timestamp: new Date().toISOString(),
  });

  // TODO: Send to monitoring service (Sentry, Datadog, etc.)
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureMessage("CSP Violation", { extra: report });
  // }

  res.status(204).end(); // No content response
};

/**
 * Security Context Middleware
 * Adds security-related info to request object for logging
 */
export const securityContext = (req: Request, res: Response, next: NextFunction) => {
  (req as any).securityContext = {
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers["user-agent"] || "unknown",
    origin: req.headers.origin || req.headers.referer || "unknown",
    protocol: req.protocol,
    isSecure: req.secure,
    timestamp: new Date().toISOString(),
  };

  next();
};
