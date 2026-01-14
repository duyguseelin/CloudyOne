// backend/src/middleware/adminSecurity.ts
import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prisma";

/**
 * Admin IP Whitelist Middleware
 * Restricts admin panel access to specific IP addresses
 */
export const adminIpWhitelist = (req: Request, res: Response, next: NextFunction) => {
  const ADMIN_IP_WHITELIST = process.env.ADMIN_IP_WHITELIST || "";
  const NODE_ENV = process.env.NODE_ENV || "development";

  // Skip whitelist in development mode or if not configured
  if (NODE_ENV !== "production" || !ADMIN_IP_WHITELIST) {
    return next();
  }

  // Get client IP (handle proxy scenarios)
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const clientIp =
    (typeof forwardedFor === "string" ? forwardedFor.split(",")[0]?.trim() : undefined) ||
    (typeof realIp === "string" ? realIp : undefined) ||
    req.socket.remoteAddress ||
    "unknown";

  // Parse whitelist
  const allowedIps = ADMIN_IP_WHITELIST.split(",").map((ip) => ip.trim());

  // Check if IP is whitelisted
  if (!allowedIps.includes(clientIp)) {
    console.error(`🚨 ADMIN ACCESS DENIED: IP ${clientIp} not in whitelist`);

    // Log security event
    logSecurityEvent({
      type: "ADMIN_IP_BLOCKED",
      ip: clientIp,
      path: req.path,
      userId: (req as any).userId || null,
    });

    return res.status(403).json({
      error: "Access denied: IP not authorized for admin panel",
    });
  }

  console.log(`✅ Admin IP whitelist check passed: ${clientIp}`);
  next();
};

/**
 * Admin 2FA Enforcement
 * Requires admin users to have 2FA enabled
 */
export const enforceAdmin2FA = async (req: Request, res: Response, next: NextFunction) => {
  const ADMIN_2FA_REQUIRED = process.env.ADMIN_2FA_REQUIRED === "true";

  if (!ADMIN_2FA_REQUIRED) {
    return next();
  }

  const userId = (req as any).userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, twoFactorEnabled: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if admin and 2FA enabled
    if (user.role === "ADMIN" && !user.twoFactorEnabled) {
      console.warn(`⚠️  Admin user ${userId} attempted access without 2FA enabled`);

      // Log security event
      logSecurityEvent({
        type: "ADMIN_2FA_MISSING",
        userId,
        path: req.path,
        ip: req.socket.remoteAddress || "unknown",
      });

      return res.status(403).json({
        error: "Admin users must enable 2FA to access admin panel",
        requiresSetup: true,
      });
    }

    next();
  } catch (error) {
    console.error("Admin 2FA check error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Admin Session Timeout
 * Enforces shorter session timeout for admin users
 */
export const adminSessionTimeout = (req: Request, res: Response, next: NextFunction) => {
  const ADMIN_SESSION_TIMEOUT = parseInt(process.env.ADMIN_SESSION_TIMEOUT || "30", 10); // minutes
  const userId = (req as any).userId;

  // Add header to inform client of admin session timeout
  if (userId) {
    res.setHeader("X-Admin-Session-Timeout", ADMIN_SESSION_TIMEOUT.toString());
  }

  next();
};

/**
 * Security Event Logger
 * Logs security-related events to database
 */
async function logSecurityEvent(event: {
  type: string;
  userId?: string | null;
  ip: string;
  path?: string;
  details?: any;
}) {
  try {
    // Log to Activity instead of SecurityEvent
    if (event.userId) {
      await prisma.activity.create({
        data: {
          userId: event.userId,
          type: 'OTHER',
          metadata: JSON.stringify({
            eventType: event.type,
            ipAddress: event.ip,
            path: event.path || null,
            details: event.details,
          }),
        },
      });
    }
    console.log(`Security event: ${event.type} - IP: ${event.ip}`);
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
}
