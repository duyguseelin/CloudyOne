/**
 * Audit Service - FAZ 5
 * Security event logging with redaction
 * 
 * Rules:
 * - NEVER log presigned URLs (data leak risk)
 * - NEVER log encryption keys, IVs, salts, secrets
 * - Log user actions with IP, user-agent, timestamp
 * - Use async queue for performance (optional: implement with BullMQ later)
 */

import { Request } from "express";
import { prisma } from "./prisma";

/**
 * Action types for audit logging
 */
export enum AuditAction {
  // Authentication
  LOGIN_SUCCESS = "LOGIN_SUCCESS",
  LOGIN_FAIL = "LOGIN_FAIL",
  REGISTER = "REGISTER",
  PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUEST",
  PASSWORD_RESET_COMPLETE = "PASSWORD_RESET_COMPLETE",
  LOGOUT = "LOGOUT",

  // File operations
  PRESIGN_UPLOAD = "PRESIGN_UPLOAD",
  PRESIGN_DOWNLOAD = "PRESIGN_DOWNLOAD",
  UPLOAD_COMPLETE = "UPLOAD_COMPLETE",
  FILE_DELETE = "FILE_DELETE",
  FILE_RESTORE = "FILE_RESTORE",
  FILE_SHARE = "FILE_SHARE",
  FILE_UNSHARE = "FILE_UNSHARE",

  // Migration
  MIGRATION_START = "MIGRATION_START",
  MIGRATION_COMMIT = "MIGRATION_COMMIT",
  MIGRATION_FAIL = "MIGRATION_FAIL",
  MIGRATION_CLEANUP = "MIGRATION_CLEANUP",

  // Crypto
  KDF_INIT = "KDF_INIT",
  RECOVERY_KEY_GENERATE = "RECOVERY_KEY_GENERATE",
  RECOVERY_KEY_DISABLE = "RECOVERY_KEY_DISABLE",

  // Admin
  ADMIN_ROLE_CHANGE = "ADMIN_ROLE_CHANGE",
  ADMIN_USER_DELETE = "ADMIN_USER_DELETE",
  ADMIN_STORAGE_ADJUST = "ADMIN_STORAGE_ADJUST",

  // Security
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  INVALID_TOKEN = "INVALID_TOKEN",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
}

/**
 * Extract safe client info from request
 */
function extractClientInfo(req: Request) {
  return {
    ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
    userAgent: req.headers["user-agent"] || "unknown",
  };
}

/**
 * Redact sensitive fields from metadata
 */
function redactMeta(meta?: any): any {
  if (!meta) return null;

  const redacted = { ...meta };

  // List of sensitive field patterns to remove
  const sensitivePatterns = [
    /url$/i, // presignedUrl, downloadUrl, uploadUrl
    /^url/i,
    /secret/i,
    /password/i,
    /token/i,
    /key$/i, // DEK, KEK, recoveryKey
    /^key/i,
    /iv$/i, // Initialization vectors
    /salt/i,
    /hash/i,
  ];

  Object.keys(redacted).forEach((key) => {
    const shouldRedact = sensitivePatterns.some((pattern) => pattern.test(key));
    if (shouldRedact) {
      redacted[key] = "[REDACTED]";
    }
  });

  return redacted;
}

/**
 * Log audit event
 */
export async function logAudit(params: {
  req: Request;
  action: AuditAction;
  actorUserId?: string;
  targetType?: "file" | "user" | "system" | "folder";
  targetId?: string;
  meta?: any;
}) {
  try {
    const { ip, userAgent } = extractClientInfo(params.req);

    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId || null,
        actorIp: ip as string,
        userAgent: userAgent as string,
        action: params.action,
        targetType: params.targetType || null,
        targetId: params.targetId || null,
        meta: redactMeta(params.meta),
      },
    });

    // Optional: emit to queue for async processing (implement later with BullMQ)
  } catch (error) {
    // Don't crash the app if audit logging fails
    console.error("⚠️  Audit log error:", error);
  }
}

/**
 * Log security event (suspicious activity)
 */
export async function logSecurityEvent(params: {
  eventType: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  actorIp?: string;
  actorUserId?: string;
  description?: string;
  meta?: any;
}) {
  try {
    await prisma.securityEvent.create({
      data: {
        eventType: params.eventType,
        severity: params.severity,
        actorIp: params.actorIp || null,
        actorUserId: params.actorUserId || null,
        description: params.description || null,
        meta: redactMeta(params.meta),
      },
    });
  } catch (error) {
    console.error("⚠️  Security event log error:", error);
  }
}

/**
 * Suspicious activity detection
 * Check for mass failures, brute force, excessive API calls
 */
export async function detectSuspiciousActivity() {
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  try {
    // 1. Mass login failures (50+ failed logins from same IP in 10 min)
    const loginFailures = await prisma.auditLog.groupBy({
      by: ["actorIp"],
      where: {
        action: AuditAction.LOGIN_FAIL,
        createdAt: { gte: tenMinutesAgo },
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: 50 } },
      },
    });

    for (const failure of loginFailures) {
      await logSecurityEvent({
        eventType: "MASS_LOGIN_FAIL",
        severity: "HIGH",
        actorIp: failure.actorIp || "unknown",
        description: `${failure._count.id} failed login attempts in 10 minutes`,
        meta: { count: failure._count.id },
      });
    }

    // 2. Mass presign requests (200+ presign calls from same user in 10 min)
    const presignRequests = await prisma.auditLog.groupBy({
      by: ["actorUserId"],
      where: {
        action: {
          in: [AuditAction.PRESIGN_UPLOAD, AuditAction.PRESIGN_DOWNLOAD],
        },
        createdAt: { gte: tenMinutesAgo },
        actorUserId: { not: null },
      },
      _count: { id: true },
      having: {
        id: { _count: { gte: 200 } },
      },
    });

    for (const req of presignRequests) {
      await logSecurityEvent({
        eventType: "MASS_PRESIGN",
        severity: "MEDIUM",
        actorUserId: req.actorUserId || undefined,
        description: `${req._count.id} presign requests in 10 minutes`,
        meta: { count: req._count.id },
      });
    }

    // 3. Rate limit violations (tracked separately via rate limiter middleware)
    // This is just an example - actual tracking happens in rateLimiter.ts

  } catch (error) {
    console.error("⚠️  Suspicious activity detection error:", error);
  }
}
