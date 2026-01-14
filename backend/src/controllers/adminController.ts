/**
 * Admin Controller - FAZ 6: User Session Management
 * Admin-only endpoints for user management and security operations
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { revokeAllUserTokens } from "../utils/tokenService";
import { prisma } from "../utils/prisma";

/**
 * POST /api/admin/users/:userId/revoke-sessions
 * Revoke all refresh tokens for a user (force logout)
 * 
 * Use cases:
 * - Security incident (compromised account)
 * - Password reset
 * - Account suspension
 */
export async function revokeUserSessions(req: AuthRequest, res: Response) {
  try {
    const { userId } = req.params;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Revoke all active refresh tokens
    const revokedCount = await revokeAllUserTokens(userId);

    console.log(`🔒 Admin ${req.userId} revoked ${revokedCount} sessions for user ${user.email}`);

    return res.json({
      message: `Revoked ${revokedCount} active sessions for user ${user.email}`,
      userId: user.id,
      revokedCount,
    });
  } catch (error: any) {
    console.error("❌ Revoke sessions error:", error);
    return res.status(500).json({ message: "Failed to revoke sessions" });
  }
}

/**
 * GET /api/admin/users/:userId/active-sessions
 * List active refresh tokens for a user (debugging, security audit)
 */
export async function listUserActiveSessions(req: AuthRequest, res: Response) {
  try {
    const { userId } = req.params;

    const sessions = await prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      userId,
      activeSessionCount: sessions.length,
      sessions,
    });
  } catch (error: any) {
    console.error("❌ List sessions error:", error);
    return res.status(500).json({ message: "Failed to list sessions" });
  }
}
