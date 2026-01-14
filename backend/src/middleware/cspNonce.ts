/**
 * CSP Nonce Generator - FAZ 7: XSS Protection
 * 
 * Security Benefits:
 * - Eliminates need for 'unsafe-inline' in CSP
 * - Each request gets unique nonce (cryptographically random)
 * - Inline scripts only execute if they have matching nonce
 * - XSS attacks cannot inject valid nonce
 * 
 * Usage:
 * 1. Backend generates nonce per request
 * 2. Sends nonce in CSP header: script-src 'nonce-{nonce}'
 * 3. Frontend uses nonce in script tags: <script nonce="{nonce}">
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Generate cryptographically random nonce
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("base64");
}

/**
 * CSP Nonce Middleware
 * Generates unique nonce for each request
 * Accessible in templates via res.locals.cspNonce
 */
export function cspNonceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const nonce = generateNonce();
  
  // Store nonce for use in response
  res.locals.cspNonce = nonce;
  
  // Attach to request for logging
  (req as any).cspNonce = nonce;
  
  next();
}

/**
 * Enhanced CSP Header with Nonce
 * Use this instead of hardcoded CSP in server.ts
 */
export function cspHeaderWithNonce(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const nonce = res.locals.cspNonce || generateNonce();
  const NODE_ENV = process.env.NODE_ENV || "development";
  const FRONTEND_URL = process.env.FRONTEND_URL || "https://yourdomain.com";
  
  // Build CSP directives
  const cspDirectives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`, // ✅ No unsafe-inline!
    `style-src 'self' 'nonce-${nonce}'`,  // ✅ Nonce for styles too
    `img-src 'self' data: https:`,
    `connect-src 'self' ${FRONTEND_URL}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `media-src 'self'`,
    `frame-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];
  
  // Add report-uri in production
  if (NODE_ENV === "production") {
    const reportUri = process.env.CSP_REPORT_URI || "/api/security/csp-report";
    cspDirectives.push(`report-uri ${reportUri}`);
  }
  
  // Set CSP header
  res.setHeader(
    "Content-Security-Policy",
    cspDirectives.join("; ")
  );
  
  next();
}

/**
 * Helper: Get nonce from response object
 * For use in server-side rendering
 */
export function getCspNonce(res: Response): string {
  return res.locals.cspNonce || "";
}
