/**
 * File Controller V2 - Presigned URL Implementation
 * FAZ 2: R2 Private Bucket + Presigned URLs + Ownership Control
 */

import { Response } from "express";
import crypto from "crypto";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { FileStatus } from "@prisma/client";
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  generateR2Key,
  checkObjectExists,
  deleteObject,
  isContentTypeAllowed,
  getMaxFileSize,
} from "../lib/r2";
import { createActivity } from "./activityController";

/**
 * POST /api/files/presign-upload
 * Generate presigned URL for file upload
 */
export async function presignUpload(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { originalName, contentType, sizeBytes } = req.body;

    // Validation
    if (!originalName || !contentType || !sizeBytes) {
      return res.status(400).json({
        message: "originalName, contentType ve sizeBytes gerekli",
      });
    }

    // Content type whitelist check
    if (!isContentTypeAllowed(contentType)) {
      return res.status(400).json({
        message: "Bu dosya tipi desteklenmiyor",
        allowedTypes: "image/*, application/pdf, video/mp4, vb.",
      });
    }

    // Size limit check
    const maxSize = getMaxFileSize();
    if (sizeBytes > maxSize) {
      return res.status(400).json({
        message: `Dosya boyutu çok büyük. Maksimum: ${Math.floor(maxSize / 1024 / 1024)} MB`,
        maxSizeBytes: maxSize,
      });
    }

    // Check user storage quota
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { usedStorageBytes: true, storageLimitBytes: true },
    });

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }

    if (user.usedStorageBytes + BigInt(sizeBytes) > user.storageLimitBytes) {
      return res.status(403).json({
        message: "Depolama kotanız doldu",
        used: Number(user.usedStorageBytes),
        limit: Number(user.storageLimitBytes),
      });
    }

    // Create pending file record
    const file = await prisma.file.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        originalName,
        filename: originalName, // Legacy field
        sizeBytes: BigInt(sizeBytes),
        mimeType: contentType,
        storageProvider: "R2",
        storageKey: "", // Will be set after generating fileId
        storagePath: "", // Legacy field
        status: "PENDING",
        updatedAt: new Date(),
      },
    });

    // Generate R2 key: u/<userId>/<fileId>
    const r2Key = generateR2Key(userId, file.id);

    // Update file record with R2 key
    await prisma.file.update({
      where: { id: file.id },
      data: { storageKey: r2Key },
    });

    // Generate presigned upload URL
    const uploadUrl = await generatePresignedUploadUrl(r2Key, contentType);

    return res.json({
      fileId: file.id,
      r2Key,
      uploadUrl,
      expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || "600", 10),
    });
  } catch (error) {
    console.error("❌ Presign upload error:", error);
    return res.status(500).json({ message: "Upload URL oluşturulamadı" });
  }
}

/**
 * POST /api/files/:fileId/complete
 * Mark upload as complete and activate file
 */
export async function uploadComplete(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const { etag, sizeBytes } = req.body;

    // Get file record
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        userId: true,
        status: true,
        storageKey: true,
        sizeBytes: true,
        filename: true,
        folderId: true,
      },
    });

    // Ownership check
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ message: "Bu dosyaya erişim yetkiniz yok" });
    }

    // Status check
    if (file.status !== "PENDING") {
      return res.status(400).json({
        message: "Dosya zaten aktif veya silinmiş",
        status: file.status,
      });
    }

    // Verify file exists in R2
    if (file.storageKey) {
      const exists = await checkObjectExists(file.storageKey);
      if (!exists) {
        return res.status(400).json({
          message: "Dosya R2'ye yüklenemedi. Lütfen tekrar deneyin.",
        });
      }

      // Optional: Verify size matches
      if (sizeBytes && Math.abs(exists.size - sizeBytes) > 1024) {
        console.warn("⚠️  Size mismatch:", {
          fileId,
          expected: sizeBytes,
          actual: exists.size,
        });
      }
    }

    // Activate file
    await prisma.file.update({
      where: { id: fileId },
      data: { status: FileStatus.ACTIVE },
    });

    // Update user storage
    await prisma.user.update({
      where: { id: userId },
      data: {
        usedStorageBytes: { increment: file.sizeBytes },
      },
    });

    // Create activity record for file upload
    await createActivity({
      userId,
      type: 'FILE_UPLOAD',
      fileId: file.id,
      fileName: file.filename,
      folderId: file.folderId || undefined,
      metadata: { sizeBytes: file.sizeBytes },
    });

    return res.json({ ok: true, fileId });
  } catch (error) {
    console.error("❌ Upload complete error:", error);
    return res.status(500).json({ message: "Dosya aktifleştirilemedi" });
  }
}

/**
 * POST /api/files/presign-download
 * Generate presigned URL for file download
 */
export async function presignDownload(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ message: "fileId gerekli" });
    }

    // Get file record
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        userId: true,
        status: true,
        storageKey: true,
        originalName: true,
      },
    });

    // Ownership check
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı" });
    }

    if (file.userId !== userId) {
      return res.status(404).json({ message: "Dosya bulunamadı" }); // Don't leak existence
    }

    // Status check
    if (file.status !== "ACTIVE") {
      return res.status(400).json({
        message: "Dosya aktif değil",
      });
    }

    if (!file.storageKey) {
      return res.status(400).json({
        message: "Dosya storage key'i eksik",
      });
    }

    // Generate presigned download URL
    const downloadUrl = await generatePresignedDownloadUrl(file.storageKey);

    return res.json({
      downloadUrl,
      expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || "600", 10),
      originalName: file.originalName,
    });
  } catch (error) {
    console.error("❌ Presign download error:", error);
    return res.status(500).json({ message: "Download URL oluşturulamadı" });
  }
}

/**
 * GET /api/files/v2/list
 * List user's active files
 */
export async function listFilesV2(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    const files = await prisma.file.findMany({
      where: {
        userId,
        status: "ACTIVE",
        teamId: null, // Ekip dosyalarını hariç tut
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      files: files.map((f) => ({
        ...f,
        sizeBytes: Number(f.sizeBytes),
      })),
      count: files.length,
    });
  } catch (error) {
    console.error("❌ List files error:", error);
    return res.status(500).json({ message: "Dosyalar listelenemedi" });
  }
}

/**
 * DELETE /api/files/:fileId
 * Soft delete + R2 delete
 */
export async function deleteFileV2(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;

    // Get file record
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        userId: true,
        status: true,
        storageKey: true,
        sizeBytes: true,
        filename: true,
        folderId: true,
      },
    });

    // Ownership check
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı" });
    }

    if (file.userId !== userId) {
      return res.status(404).json({ message: "Dosya bulunamadı" }); // Don't leak existence
    }

    // Already deleted check
    if (file.status === "DELETED") {
      return res.status(400).json({ message: "Dosya zaten silinmiş" });
    }

    // Delete from R2
    if (file.storageKey) {
      try {
        await deleteObject(file.storageKey);
        console.log("✅ R2 delete success:", file.storageKey);
      } catch (error) {
        console.error("⚠️  R2 delete failed (continuing):", error);
        // Continue even if R2 delete fails
      }
    }

    // Soft delete in DB
    await prisma.file.update({
      where: { id: fileId },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
      },
    });

    // Update user storage
    await prisma.user.update({
      where: { id: userId },
      data: {
        usedStorageBytes: { decrement: file.sizeBytes },
      },
    });

    // Create activity record for file delete
    await createActivity({
      userId,
      type: 'FILE_DELETE',
      fileId: file.id,
      fileName: file.filename,
      folderId: file.folderId || undefined,
    });

    return res.json({ ok: true, message: "Dosya silindi" });
  } catch (error) {
    console.error("❌ Delete file error:", error);
    return res.status(500).json({ message: "Dosya silinemedi" });
  }
}
