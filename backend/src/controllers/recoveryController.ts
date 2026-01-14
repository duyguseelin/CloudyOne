/**
 * Recovery Controller - FAZ 4
 * Recovery key generation and management for zero-knowledge encryption
 * 
 * Security Model:
 * - Recovery key is 32 random bytes
 * - Encrypted with user's KEK before storage
 * - Server never sees plaintext recovery key
 * - User must download and store recovery key securely
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";

/**
 * GET /api/crypto/recovery/status
 * Check if recovery key is enabled for user
 */
export async function getRecoveryStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        recoveryEnabled: true,
        recoveryKeyEnc: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      enabled: user.recoveryEnabled,
      hasKey: !!user.recoveryKeyEnc,
    });
  } catch (error) {
    console.error("❌ Get recovery status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /api/crypto/recovery/generate
 * Save encrypted recovery key
 * 
 * Body:
 * {
 *   recoveryKeyEnc: "base64",  // Encrypted with user's KEK
 *   recoveryKeySalt: "base64"  // Salt used for encryption (can reuse kdfSalt)
 * }
 * 
 * Security: This endpoint ONLY accepts encrypted payload.
 * Server never sees plaintext recovery key.
 */
export async function generateRecoveryKey(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { recoveryKeyEnc, recoveryKeySalt } = req.body;

    // Validation
    if (!recoveryKeyEnc || !recoveryKeySalt) {
      return res.status(400).json({
        message: "Missing required fields: recoveryKeyEnc, recoveryKeySalt",
      });
    }

    // Check if recovery already enabled
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryEnabled: true },
    });

    if (user?.recoveryEnabled) {
      return res.status(409).json({
        message: "Recovery key already exists. Disable first to regenerate.",
      });
    }

    // Save encrypted recovery key
    await prisma.user.update({
      where: { id: userId },
      data: {
        recoveryKeyEnc,
        recoveryKeySalt,
        recoveryEnabled: true,
      },
    });

    console.log(`✅ Recovery key generated for user: ${userId}`);
    console.log(`   (encrypted payload saved to database)`);

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Generate recovery key error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /api/crypto/recovery/disable
 * Disable recovery key (delete from database)
 */
export async function disableRecoveryKey(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    await prisma.user.update({
      where: { id: userId },
      data: {
        recoveryKeyEnc: null,
        recoveryKeySalt: null,
        recoveryEnabled: false,
      },
    });

    console.log(`⚠️  Recovery key disabled for user: ${userId}`);

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Disable recovery key error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * GET /api/crypto/recovery/download
 * Retrieve encrypted recovery key for download
 * (User will decrypt client-side with password)
 */
export async function downloadRecoveryKey(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        recoveryKeyEnc: true,
        recoveryKeySalt: true,
        recoveryEnabled: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.recoveryEnabled || !user.recoveryKeyEnc) {
      return res.status(404).json({ message: "No recovery key found" });
    }

    return res.json({
      recoveryKeyEnc: user.recoveryKeyEnc,
      recoveryKeySalt: user.recoveryKeySalt,
    });
  } catch (error) {
    console.error("❌ Download recovery key error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}
