/**
 * Migration Controller - FAZ 4
 * Plaintext to Encrypted file migration
 * 
 * State Machine:
 * PLAINTEXT → MIGRATING → ENCRYPTED (success)
 *           → MIGRATION_FAILED (error, can retry)
 */

import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { EncryptionState } from "@prisma/client";
import { checkObjectExists, deleteObject } from "../lib/r2";

/**
 * GET /api/migration/files
 * List user's files by encryption state
 */
export async function listMigrationStatus(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    const files = await prisma.file.findMany({
      where: {
        userId,
        isDeleted: false,
        status: "ACTIVE",
      },
      select: {
        id: true,
        filename: true,
        sizeBytes: true,
        encryptionState: true,
        isEncrypted: true,
        migratedAt: true,
        migrationError: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by encryption state
    const plaintext = files.filter((f) => f.encryptionState === "PLAINTEXT");
    const encrypted = files.filter((f) => f.encryptionState === "ENCRYPTED");
    const migrating = files.filter((f) => f.encryptionState === "MIGRATING");
    const failed = files.filter((f) => f.encryptionState === "MIGRATION_FAILED");

    return res.json({
      summary: {
        total: files.length,
        plaintext: plaintext.length,
        encrypted: encrypted.length,
        migrating: migrating.length,
        failed: failed.length,
      },
      files: {
        plaintext,
        encrypted,
        migrating,
        failed,
      },
    });
  } catch (error) {
    console.error("❌ List migration status error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /api/migration/files/:fileId/start
 * Mark file as MIGRATING (preparation step)
 */
export async function startMigration(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;

    // Check file ownership and current state
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        userId: true,
        encryptionState: true,
        status: true,
      },
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (file.status !== "ACTIVE") {
      return res.status(400).json({ message: "File is not active" });
    }

    if (file.encryptionState === "ENCRYPTED") {
      return res.status(409).json({ message: "File already encrypted" });
    }

    if (file.encryptionState === "MIGRATING") {
      return res.status(409).json({ message: "Migration already in progress" });
    }

    // Mark as MIGRATING
    await prisma.file.update({
      where: { id: fileId },
      data: {
        encryptionState: EncryptionState.MIGRATING,
        migrationError: null,
      },
    });

    console.log(`✅ Migration started for file: ${fileId}`);

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Start migration error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /api/migration/files/:fileId/commit
 * Complete migration: save encrypted metadata
 * 
 * Body:
 * {
 *   newStorageKey: "u/<userId>/<fileId>",
 *   wrappedDek: "base64",
 *   wrapIv: "base64",
 *   encMeta: {...},
 *   originalNameEnc: "base64",
 *   originalNameIv: "base64",
 *   mimeEnc?: "base64",
 *   contentSha256?: "hex"
 * }
 */
export async function commitMigration(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const {
      newStorageKey,
      wrappedDek,
      wrapIv,
      encMeta,
      originalNameEnc,
      originalNameIv,
      mimeEnc,
      contentSha256,
    } = req.body;

    // Validation
    if (!newStorageKey || !wrappedDek || !wrapIv || !originalNameEnc) {
      return res.status(400).json({
        message: "Missing required fields: newStorageKey, wrappedDek, wrapIv, originalNameEnc",
      });
    }

    // Check file ownership and state
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        userId: true,
        encryptionState: true,
        storageKey: true,
      },
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (file.encryptionState !== "MIGRATING") {
      return res.status(409).json({
        message: `Invalid state: ${file.encryptionState}. Must be MIGRATING.`,
      });
    }

    // Verify new ciphertext exists in R2
    const exists = await checkObjectExists(newStorageKey);
    if (!exists) {
      return res.status(400).json({
        message: "New ciphertext not found in R2. Upload failed.",
      });
    }

    // Save old key for cleanup
    const legacyStorageKey = file.storageKey || null;

    // Update file with encryption metadata
    await prisma.file.update({
      where: { id: fileId },
      data: {
        // Encryption fields
        cryptoVersion: "1",
        edek: wrappedDek,
        edekIv: wrapIv,
        encMeta: encMeta ? JSON.stringify(encMeta) : null,
        metaNameEnc: originalNameEnc,
        metaNameIv: originalNameIv,
        mimeEnc: mimeEnc || null,
        isEncrypted: true,
        
        // Migration tracking
        encryptionState: EncryptionState.ENCRYPTED,
        migratedAt: new Date(),
        migrationError: null,
        legacyStorageKey,
        contentSha256: contentSha256 || null,
        
        // Update storage key to new encrypted location
        storageKey: newStorageKey,
      },
    });

    console.log(`✅ Migration committed for file: ${fileId}`);
    console.log(`   Legacy key: ${legacyStorageKey}`);
    console.log(`   New key: ${newStorageKey}`);

    return res.json({ ok: true, legacyStorageKey });
  } catch (error) {
    console.error("❌ Commit migration error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /api/migration/files/:fileId/fail
 * Mark migration as failed
 * 
 * Body: { error: "..." }
 */
export async function failMigration(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const { error } = req.body;

    // Check file ownership
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { userId: true, encryptionState: true },
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    // Mark as failed
    await prisma.file.update({
      where: { id: fileId },
      data: {
        encryptionState: EncryptionState.MIGRATION_FAILED,
        migrationError: error || "Unknown error",
      },
    });

    console.log(`⚠️  Migration failed for file: ${fileId}`);
    console.log(`   Error: ${error}`);

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Fail migration error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

/**
 * POST /api/migration/files/:fileId/cleanup
 * Delete legacy plaintext file from R2 after successful migration
 */
export async function cleanupLegacy(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;

    // Check file ownership and state
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        userId: true,
        encryptionState: true,
        legacyStorageKey: true,
      },
    });

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    if (file.encryptionState !== "ENCRYPTED") {
      return res.status(400).json({
        message: "File must be ENCRYPTED to cleanup legacy",
      });
    }

    if (!file.legacyStorageKey) {
      return res.status(400).json({
        message: "No legacy storage key to cleanup",
      });
    }

    // Delete from R2
    await deleteObject(file.legacyStorageKey);

    // Clear legacy key
    await prisma.file.update({
      where: { id: fileId },
      data: { legacyStorageKey: null },
    });

    console.log(`🗑️  Legacy file cleaned up: ${file.legacyStorageKey}`);

    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Cleanup legacy error:", error);
    return res.status(500).json({ message: "Server error" });
  }
}
