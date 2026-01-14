/**
 * File Controller V3 - Zero-Knowledge Encryption
 * FAZ 3: Client-side encrypted files with presigned URLs
 * 
 * Security Model:
 * - Files encrypted client-side before upload (AES-256-GCM)
 * - R2 stores only ciphertext (application/octet-stream)
 * - Metadata (filename) also encrypted
 * - Backend/Cloudflare never see plaintext
 * - Decrypt only possible with user password-derived key
 */

import crypto from "crypto";
import path from "path";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { FileStatus } from "@prisma/client";
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  generateR2Key,
  checkObjectExists,
  deleteObject,
  getMaxFileSize,
  getObjectContent,
} from "../lib/r2";

/**
 * POST /api/files/v3/presign-upload
 * Generate presigned URL for encrypted file upload
 * 
 * Client must encrypt file before calling this endpoint
 */
export async function presignUploadV3(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { cipherSizeBytes, declaredTypeEnc, declaredTypeIv, folderId, originalFilename, isHidden } = req.body;

    console.log("🔐 [V3 Presign] İstek alındı:", {
      userId,
      folderId,
      isHidden,
      cipherSizeBytes,
      originalFilename,
      bodyKeys: Object.keys(req.body)
    });

    // Validation
    if (!cipherSizeBytes || typeof cipherSizeBytes !== "number") {
      return res.status(400).json({
        message: "cipherSizeBytes gerekli (number)",
      });
    }

    // FolderId validation (if provided)
    if (folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: { userId: true, isHidden: true }
      });
      console.log("📂 [V3 Presign] Klasör kontrolü:", {
        folderId,
        folderFound: !!folder,
        folderIsHidden: folder?.isHidden,
        userMatch: folder?.userId === userId
      });
      if (!folder || folder.userId !== userId) {
        return res.status(400).json({ message: "Geçersiz klasör" });
      }
    }

    // Size limit check (on encrypted data)
    const maxSize = getMaxFileSize();
    if (cipherSizeBytes > maxSize) {
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

    if (user.usedStorageBytes + BigInt(cipherSizeBytes) > user.storageLimitBytes) {
      return res.status(403).json({
        message: "Depolama kotanız doldu",
        used: Number(user.usedStorageBytes),
        limit: Number(user.storageLimitBytes),
      });
    }

    // Create pending file record (NOT encrypted yet)
    // Extract extension from originalFilename for media filtering
    let extension = null;
    let originalName = originalFilename || "encrypted";
    if (originalFilename) {
      const ext = path.extname(originalFilename).toLowerCase().replace(/^\./, "");
      if (ext) {
        extension = ext;
      }
    }

    const file = await prisma.file.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        filename: originalName, // Orijinal dosya adı (görüntüleme için)
        originalName: originalName, // Orijinal dosya adı
        extension: extension, // Dosya uzantısı (png, jpg, pdf, etc)
        folderId: folderId || null, // Klasör ID'si
        sizeBytes: BigInt(cipherSizeBytes),
        mimeType: "application/octet-stream", // Always octet-stream for encrypted files
        storageProvider: "R2",
        storageKey: "", // Will be set after generating fileId
        storagePath: "", // Legacy field
        status: "PENDING",
        isEncrypted: false, // Will be true after complete
        cryptoVersion: "1",
        isHidden: isHidden === true, // Gizli dosya olarak oluştur
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

    // Generate presigned upload URL (always octet-stream)
    const uploadUrl = await generatePresignedUploadUrl(
      r2Key,
      "application/octet-stream"
    );

    return res.json({
      fileId: file.id,
      r2Key,
      uploadUrl,
      expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || "600", 10),
    });
  } catch (error) {
    console.error("❌ Presign upload V3 error:", error);
    return res.status(500).json({ message: "Upload URL oluşturulamadı" });
  }
}

/**
 * POST /api/files/v3/:fileId/complete
 * Save encryption artifacts and activate encrypted file
 * 
 * Required: All encryption metadata from client
 */
export async function uploadCompleteV3(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.params;
    const { cipherIv, edek, edekIv, metaNameEnc, metaNameIv } = req.body;

    // Validation: All encryption artifacts required
    if (!cipherIv || !edek || !edekIv || !metaNameEnc || !metaNameIv) {
      return res.status(400).json({
        message: "Tüm encryption artifact'ları gerekli: cipherIv, edek, edekIv, metaNameEnc, metaNameIv",
      });
    }

    // Get file record
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        userId: true,
        status: true,
        storageKey: true,
        sizeBytes: true,
        isEncrypted: true,
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
    }

    // Save encryption artifacts and activate
    await prisma.file.update({
      where: { id: fileId },
      data: {
        status: FileStatus.ACTIVE,
        isEncrypted: true,
        filename: 'encrypted', // Web ile uyumlu: şifreli dosyalar "encrypted" olarak gösterilir
        cipherIv,
        edek,
        edekIv,
        metaNameEnc,
        metaNameIv,
      },
    });

    // Update user storage
    await prisma.user.update({
      where: { id: userId },
      data: {
        usedStorageBytes: { increment: file.sizeBytes },
      },
    });

    return res.json({ ok: true, fileId });
  } catch (error) {
    console.error("❌ Upload complete V3 error:", error);
    return res.status(500).json({ message: "Dosya aktifleştirilemedi" });
  }
}

/**
 * POST /api/files/v3/presign-download
 * Generate presigned URL and return encryption artifacts for decryption
 */
export async function presignDownloadV3(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ message: "fileId gerekli" });
    }

    // Get file record with all encryption artifacts
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        userId: true,
        status: true,
        storageKey: true,
        isEncrypted: true,
        cipherIv: true,
        edek: true,
        edekIv: true,
        metaNameEnc: true,
        metaNameIv: true,
        cryptoVersion: true,
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

    // Encryption check
    if (!file.isEncrypted) {
      return res.status(400).json({
        message: "Dosya şifreli değil. V2 endpoint kullanın.",
      });
    }

    if (!file.storageKey || !file.cipherIv || !file.edek || !file.edekIv) {
      return res.status(500).json({
        message: "Dosya encryption artifact'ları eksik",
      });
    }

    // Generate presigned download URL
    const downloadUrl = await generatePresignedDownloadUrl(file.storageKey);

    return res.json({
      downloadUrl,
      expiresIn: parseInt(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || "600", 10),
      cipherIv: file.cipherIv,
      edek: file.edek,
      edekIv: file.edekIv,
      metaNameEnc: file.metaNameEnc,
      metaNameIv: file.metaNameIv,
      cryptoVersion: file.cryptoVersion,
    });
  } catch (error) {
    console.error("❌ Presign download V3 error:", error);
    return res.status(500).json({ message: "Download URL oluşturulamadı" });
  }
}

/**
 * GET /api/files/v3/:fileId/download
 * Download encrypted file content directly (proxy through backend to avoid CORS)
 */
export async function downloadEncryptedFile(req: AuthRequest, res: Response) {
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
        isEncrypted: true,
        cipherIv: true,
        edek: true,
        edekIv: true,
        metaNameEnc: true,
        metaNameIv: true,
        sizeBytes: true,
      },
    });

    // Ownership check
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı" });
    }

    if (file.userId !== userId) {
      return res.status(404).json({ message: "Dosya bulunamadı" });
    }

    // Status check
    if (file.status !== "ACTIVE") {
      return res.status(400).json({ message: "Dosya aktif değil" });
    }

    if (!file.storageKey) {
      return res.status(500).json({ message: "Dosya storage key bulunamadı" });
    }

    // Get file content from R2
    console.log("📥 Downloading from R2:", file.storageKey);
    const content = await getObjectContent(file.storageKey);
    console.log("📥 Downloaded content length:", content.length);

    // Set headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', content.length);
    res.setHeader('X-Cipher-Iv', file.cipherIv || '');
    res.setHeader('X-Edek', file.edek || '');
    res.setHeader('X-Edek-Iv', file.edekIv || '');
    res.setHeader('X-Meta-Name-Enc', file.metaNameEnc || '');
    res.setHeader('X-Meta-Name-Iv', file.metaNameIv || '');
    res.setHeader('Access-Control-Expose-Headers', 'X-Cipher-Iv, X-Edek, X-Edek-Iv, X-Meta-Name-Enc, X-Meta-Name-Iv');

    return res.send(content);
  } catch (error) {
    console.error("❌ Download encrypted file error:", error);
    return res.status(500).json({ message: "Dosya indirilemedi" });
  }
}

/**
 * GET /api/files/v3/list
 * List user's active encrypted files (with encrypted metadata)
 */
export async function listFilesV3(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;

    const files = await prisma.file.findMany({
      where: {
        userId,
        status: "ACTIVE",
        isEncrypted: true, // Only v3 encrypted files
        teamId: null, // Ekip dosyalarını hariç tut
      },
      select: {
        id: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
        metaNameEnc: true,
        metaNameIv: true,
        cryptoVersion: true,
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
    console.error("❌ List files V3 error:", error);
    return res.status(500).json({ message: "Dosyalar listelenemedi" });
  }
}

/**
 * DELETE /api/files/v3/:fileId
 * Delete encrypted file (soft delete + R2 delete)
 */
export async function deleteFileV3(req: AuthRequest, res: Response) {
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
        isEncrypted: true,
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
        console.log("✅ R2 delete success (V3):", file.storageKey);
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

    return res.json({ ok: true, message: "Dosya silindi" });
  } catch (error) {
    console.error("❌ Delete file V3 error:", error);
    return res.status(500).json({ message: "Dosya silinemedi" });
  }
}
