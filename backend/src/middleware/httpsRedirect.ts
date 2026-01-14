// backend/src/middleware/httpsRedirect.ts
import { Request, Response, NextFunction } from "express";

/**
 * HTTPS Redirect Middleware
 * Redirects all HTTP requests to HTTPS in production
 * Only activates when FORCE_HTTPS=true
 */
export const httpsRedirect = (req: Request, res: Response, next: NextFunction) => {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const FORCE_HTTPS = process.env.FORCE_HTTPS === "true";
  const TRUST_PROXY = process.env.TRUST_PROXY === "true";

  // Skip in development mode
  if (NODE_ENV !== "production" || !FORCE_HTTPS) {
    return next();
  }

  // Check if request is secure
  // If behind proxy (Cloudflare/nginx), check X-Forwarded-Proto header
  const isSecure = TRUST_PROXY
    ? req.headers["x-forwarded-proto"] === "https"
    : req.secure || req.protocol === "https";

  if (!isSecure) {
    // Construct HTTPS URL
    const host = req.headers.host || req.hostname;
    const httpsUrl = `https://${host}${req.originalUrl}`;

    console.warn(`⚠️  HTTPS Redirect: ${req.method} ${req.originalUrl} → ${httpsUrl}`);
    
    // 301 Permanent redirect to HTTPS
    return res.redirect(301, httpsUrl);
  }

  next();
};

/**
 * Strict Transport Security (HSTS) Header
 * Forces browsers to only use HTTPS for specified duration
 */
export const hstsHeader = (req: Request, res: Response, next: NextFunction) => {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const HSTS_MAX_AGE = parseInt(process.env.HSTS_MAX_AGE || "31536000", 10); // 1 year default

  // Only apply HSTS in production
  if (NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      `max-age=${HSTS_MAX_AGE}; includeSubDomains; preload`
    );
  }

  next();
};
