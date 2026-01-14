/**
 * Crypto Controller - Zero-Knowledge Encryption
 * FAZ 3: KDF initialization and crypto parameters
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import crypto from "crypto";

/**
 * Default PBKDF2-SHA256 parameters
 * Based on OWASP recommendations (2024)
 * 
 * Note: Using PBKDF2 instead of Argon2id because:
 * - Web Crypto API native support (all browsers)
 * - React Native / Expo compatibility
 * - No WASM dependencies
 */
const DEFAULT_KDF_PARAMS = {
  iterations: 100000, // Düşürüldü: Mobil performans için (hala güvenli)
  hashLength: 32,     // 256 bits
  algorithm: "pbkdf2-sha256",
};

/**
 * POST /api/crypto/init
 * Initialize or retrieve user's KDF parameters
 * 
 * This endpoint is idempotent - can be called multiple times safely
 */
export async function initCrypto(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    // Get current user
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        kdfSalt: true,
        kdfParams: true,
        cryptoVersion: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }

    // If KDF salt doesn't exist, generate it
    if (!user.kdfSalt) {
      // Generate 32-byte random salt
      const saltBytes = crypto.randomBytes(32);
      const kdfSalt = saltBytes.toString("base64");

      // Update user with KDF parameters
      user = await prisma.user.update({
        where: { id: userId },
        data: {
          kdfSalt,
          kdfParams: JSON.stringify(DEFAULT_KDF_PARAMS),
          cryptoVersion: 1,
        },
        select: {
          id: true,
          kdfSalt: true,
          kdfParams: true,
          cryptoVersion: true,
        },
      });

      console.log("✅ KDF initialized for user:", userId);
    }

    return res.json({
      kdfSalt: user.kdfSalt,
      kdfParams: user.kdfParams,
      cryptoVersion: user.cryptoVersion,
    });
  } catch (error) {
    console.error("❌ Crypto init error:", error);
    return res.status(500).json({ message: "Kripto parametreleri alınamadı" });
  }
}

/**
 * POST /api/crypto/files/:fileId/metadata
 * Save encryption metadata for a file
 * 
 * Body:
 * {
 *   cryptoVersion: 1,
 *   wrappedDek: "base64",      // maps to edek
 *   wrapIv: "base64",          // maps to edekIv
 *   encMeta: {...},            // chunk metadata
 *   originalNameEnc: "base64", // maps to metaNameEnc
 *   originalNameIv: "base64",  // maps to metaNameIv
 *   mimeEnc?: "base64"
 * }
 */
export async function saveFileMetadata(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const {
      cryptoVersion,
      wrappedDek,
      wrapIv,
      encMeta,
      originalNameEnc,
      originalNameIv,
      mimeEnc,
    } = req.body;

    // Validation
    if (!cryptoVersion || !wrappedDek || !wrapIv || !originalNameEnc) {
      return res.status(400).json({
        message: "Missing required fields: cryptoVersion, wrappedDek, wrapIv, originalNameEnc",
      });
    }

    // Check file ownership
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { userId: true, status: true },
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // File must be at least PENDING
    if (file.status !== "PENDING" && file.status !== "ACTIVE") {
      return res.status(400).json({ message: "Invalid file status" });
    }

    // Update metadata
    await prisma.file.update({
      where: { id: fileId },
      data: {
        cryptoVersion,
        edek: wrappedDek,
        edekIv: wrapIv,
        encMeta: encMeta || {},
        metaNameEnc: originalNameEnc,
        metaNameIv: originalNameIv,
        mimeEnc: mimeEnc || null,
        isEncrypted: true,
      },
    });

    console.log("✅ Encryption metadata saved for file:", fileId);

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Save file metadata error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}
