// backend/src/utils/auditLogger.ts
import { prisma } from "./prisma";

/**
 * Audit Log Types
 */
export enum AuditEventType {
  // Authentication Events
  USER_LOGIN = "USER_LOGIN",
  USER_LOGOUT = "USER_LOGOUT",
  USER_REGISTER = "USER_REGISTER",
  PASSWORD_RESET = "PASSWORD_RESET",
  PASSWORD_CHANGE = "PASSWORD_CHANGE",
  TWO_FA_ENABLED = "TWO_FA_ENABLED",
  TWO_FA_DISABLED = "TWO_FA_DISABLED",
  TWO_FA_VERIFIED = "TWO_FA_VERIFIED",

  // File Operations
  FILE_UPLOAD = "FILE_UPLOAD",
  FILE_DOWNLOAD = "FILE_DOWNLOAD",
  FILE_DELETE = "FILE_DELETE",
  FILE_SHARE = "FILE_SHARE",
  FILE_UNSHARE = "FILE_UNSHARE",

  // Admin Actions
  ADMIN_ACCESS = "ADMIN_ACCESS",
  ADMIN_USER_DELETE = "ADMIN_USER_DELETE",
  ADMIN_SESSION_REVOKE = "ADMIN_SESSION_REVOKE",
  ADMIN_ROLE_CHANGE = "ADMIN_ROLE_CHANGE",

  // Security Events
  FAILED_LOGIN = "FAILED_LOGIN",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
  ADMIN_IP_BLOCKED = "ADMIN_IP_BLOCKED",
  ADMIN_2FA_MISSING = "ADMIN_2FA_MISSING",
  SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY",
  CSP_VIOLATION = "CSP_VIOLATION",

  // Data Migration
  MIGRATION_STARTED = "MIGRATION_STARTED",
  MIGRATION_COMPLETED = "MIGRATION_COMPLETED",
  MIGRATION_FAILED = "MIGRATION_FAILED",
}

/**
 * Audit Log Severity Levels
 */
export enum AuditSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

/**
 * Audit Log Entry Interface
 */
interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  severity?: AuditSeverity;
  metadata?: Record<string, any>;
  message?: string;
}

/**
 * Log audit event to database
 */
export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  // Skip if audit logging is disabled
  if (process.env.AUDIT_LOG_ENABLED !== "true") {
    return;
  }

  try {
    await prisma.securityEvent.create({
      data: {
        eventType: entry.eventType,
        userId: entry.userId || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        path: entry.path || null,
        method: entry.method || null,
        statusCode: entry.statusCode || null,
        severity: entry.severity || AuditSeverity.INFO,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        message: entry.message || null,
        timestamp: new Date(),
      },
    });

    // Also log to console in development
    if (process.env.NODE_ENV !== "production") {
      console.log(`[AUDIT] ${entry.eventType}:`, {
        userId: entry.userId,
        ip: entry.ipAddress,
        message: entry.message,
      });
    }

    // Send to external monitoring (Sentry, Datadog, etc.)
    if (entry.severity === AuditSeverity.CRITICAL || entry.severity === AuditSeverity.ERROR) {
      await sendToMonitoring(entry);
    }
  } catch (error) {
    // Never fail the main request due to audit logging errors
    console.error("Failed to log audit event:", error);
  }
}

/**
 * Log successful login
 */
export async function logSuccessfulLogin(userId: string, ip: string, userAgent: string): Promise<void> {
  await logAuditEvent({
    eventType: AuditEventType.USER_LOGIN,
    userId,
    ipAddress: ip,
    userAgent,
    severity: AuditSeverity.INFO,
    message: "User logged in successfully",
  });
}

/**
 * Log failed login attempt
 */
export async function logFailedLogin(email: string, ip: string, reason: string): Promise<void> {
  await logAuditEvent({
    eventType: AuditEventType.FAILED_LOGIN,
    ipAddress: ip,
    severity: AuditSeverity.WARNING,
    message: `Failed login attempt: ${reason}`,
    metadata: { email },
  });
}

/**
 * Log file operations
 */
export async function logFileOperation(
  operation: AuditEventType,
  userId: string,
  fileId: string,
  fileName: string,
  ip: string
): Promise<void> {
  await logAuditEvent({
    eventType: operation,
    userId,
    ipAddress: ip,
    severity: AuditSeverity.INFO,
    message: `File ${operation.toLowerCase().replace("FILE_", "")}`,
    metadata: { fileId, fileName },
  });
}

/**
 * Log admin actions
 */
export async function logAdminAction(
  action: AuditEventType,
  adminUserId: string,
  targetUserId: string | null,
  ip: string,
  details?: Record<string, any>
): Promise<void> {
  await logAuditEvent({
    eventType: action,
    userId: adminUserId,
    ipAddress: ip,
    severity: AuditSeverity.WARNING,
    message: `Admin action: ${action}`,
    metadata: {
      targetUserId,
      ...details,
    },
  });
}

/**
 * Log security incidents
 */
export async function logSecurityIncident(
  eventType: AuditEventType,
  severity: AuditSeverity,
  message: string,
  details: {
    userId?: string;
    ip?: string;
    path?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  await logAuditEvent({
    eventType,
    userId: details.userId,
    ipAddress: details.ip,
    path: details.path,
    severity,
    message,
    metadata: details.metadata,
  });
}

/**
 * Send critical events to external monitoring
 */
async function sendToMonitoring(entry: AuditLogEntry): Promise<void> {
  // Integrate with Sentry, Datadog, or other monitoring services
  const sentryDsn = process.env.SENTRY_DSN;

  if (!sentryDsn) {
    return;
  }

  try {
    // TODO: Implement Sentry integration
    // const Sentry = require("@sentry/node");
    // Sentry.captureMessage(`[AUDIT] ${entry.eventType}: ${entry.message}`, {
    //   level: entry.severity === AuditSeverity.CRITICAL ? "fatal" : "error",
    //   extra: entry.metadata,
    //   user: { id: entry.userId },
    // });
    
    console.warn("⚠️  Critical audit event (monitoring not configured):", entry);
  } catch (error) {
    console.error("Failed to send audit event to monitoring:", error);
  }
}

/**
 * Query audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const logs = await prisma.securityEvent.findMany({
      where: { userId },
      orderBy: { timestamp: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        ipAddress: true,
        path: true,
        severity: true,
        message: true,
        timestamp: true,
      },
    });

    return logs;
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return [];
  }
}

/**
 * Get recent security incidents
 */
export async function getRecentSecurityIncidents(hours: number = 24): Promise<any[]> {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const incidents = await prisma.securityEvent.findMany({
      where: {
        timestamp: { gte: since },
        severity: {
          in: [AuditSeverity.WARNING, AuditSeverity.ERROR, AuditSeverity.CRITICAL],
        },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    return incidents;
  } catch (error) {
    console.error("Failed to fetch security incidents:", error);
    return [];
  }
}
