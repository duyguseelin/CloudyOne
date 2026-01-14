/**
 * Security Controller - FAZ 5
 * CSP reporting and security endpoints
 */

import { Request, Response } from "express";

/**
 * POST /api/security/csp-report
 * Content-Security-Policy violation reporting endpoint
 */
export async function cspReport(req: Request, res: Response) {
  try {
    const report = req.body;

    // Log CSP violations (in production, send to monitoring service)
    console.warn("⚠️  CSP Violation:", JSON.stringify(report, null, 2));

    // Optional: Store in database or send to external service (Sentry, DataDog, etc.)

    return res.status(204).send();
  } catch (error) {
    console.error("❌ CSP report error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}
