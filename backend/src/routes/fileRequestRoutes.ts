// backend/src/routes/fileRequestRoutes.ts
// Dosya İstekleri (File Requests) - Dış kullanıcılardan dosya alma

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { randomBytes, randomUUID } from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { recalculateUserStorage } from "../utils/storage";
import { createActivity } from "../controllers/activityController";

const router = Router();

// R2 yapılandırması kontrol - geçerli bir endpoint varsa R2 kullan
const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_CONFIGURED = R2_ENDPOINT && 
  !R2_ENDPOINT.includes("<account_id>") && 
  R2_ENDPOINT.startsWith("https://");

// R2 Client (sadece yapılandırılmışsa kullan)
const r2 = R2_CONFIGURED ? new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
}) : null;

const R2_BUCKET = process.env.R2_BUCKET || "onecloude";

// Local uploads klasörü
const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer ayarları (memory storage - dosyalar R2'ye gidecek)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB varsayılan limit
  },
});

// Token üretici (güvenli, benzersiz)
function generateRequestToken(): string {
  return randomBytes(24).toString("base64url");
}

// ============================================================================
// AUTH GEREKTİREN ROTALAR (Kullanıcının kendi isteklerini yönetmesi)
// ============================================================================

// GET /file-requests - Kullanıcının tüm dosya isteklerini listele
router.get("/", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const requests = await prisma.fileRequest.findMany({
      where: { userId },
      include: {
        Folder: {
          select: { id: true, name: true }
        },
        _count: {
          select: { FileRequestUpload: true }
        },
        FileRequestUpload: {
          select: { 
            id: true,
            uploaderEmail: true, 
            uploaderName: true,
            fileId: true,
            filename: true,
            originalName: true,
            sizeBytes: true,
            mimeType: true,
            storageKey: true,
            createdAt: true,
          },
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // Tüm fileId'leri topla
    const fileIds = requests
      .flatMap(r => r.FileRequestUpload.filter(u => u.fileId).map(u => u.fileId))
      .filter(Boolean) as string[];
    
    const files = fileIds.length > 0 
      ? await prisma.file.findMany({
          where: { id: { in: fileIds } },
          select: { id: true, filename: true }
        })
      : [];
    const fileMap = new Map(files.map(f => [f.id, f]));


    return res.json({
      requests: requests.map(r => {
        // Benzersiz yükleyicileri bul
        const uniqueUploaders = new Map();
        
        // Toplam yükleme sayısını hesapla
        let totalUploads = r.FileRequestUpload.length;
        
        r.FileRequestUpload.forEach(u => {
          if (u.uploaderEmail && !uniqueUploaders.has(u.uploaderEmail)) {
            uniqueUploaders.set(u.uploaderEmail, { email: u.uploaderEmail, name: u.uploaderName });
          }
        });
        
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          token: r.token,
          folderId: r.folderId,
          folderName: r.Folder?.name || null,
          isActive: r.isActive,
          expiresAt: r.expiresAt,
          maxFileSize: r.maxFileSize ? Number(r.maxFileSize) : null,
          allowedTypes: r.allowedTypes,
          uploadCount: r.uploadCount,
          totalUploads: totalUploads,
          lastUploadAt: r.lastUploadAt,
          createdAt: r.createdAt,
          uploaders: Array.from(uniqueUploaders.values()),
          uploaderCount: uniqueUploaders.size,
          uploadedFiles: r.FileRequestUpload.map(u => {
            const file = u.fileId ? fileMap.get(u.fileId) : null;
            return { 
              id: u.id,  // Upload ID
              fileId: u.fileId,
              filename: u.filename || file?.filename || u.originalName || 'Bilinmeyen',
              sizeBytes: u.sizeBytes ? Number(u.sizeBytes) : null,
              mimeType: u.mimeType,
              uploaderName: u.uploaderName || 'Anonim',
              uploaderEmail: u.uploaderEmail || null,
              uploadedAt: u.createdAt,
            };
          })
        };
      })
    });
  } catch (err) {
    console.error("File requests list error:", err);
    return res.status(500).json({ message: "Dosya istekleri alınırken hata oluştu." });
  }
});

// POST /file-requests - Yeni dosya isteği oluştur
router.post("/", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const { title, description, folderId, expiresAt, maxFileSize, allowedTypes } = req.body;

    console.log('📥 File request create:', { title, description, folderId, expiresAt, maxFileSize, allowedTypes });

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ message: "Başlık gereklidir." });
    }

    // Klasör kontrolü (varsa ve kullanıcıya aitse)
    if (folderId && folderId !== null && folderId !== '') {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.userId !== userId) {
        return res.status(400).json({ message: "Geçersiz klasör." });
      }
    }

    const token = generateRequestToken();

    const request = await prisma.fileRequest.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        token,
        userId,
        folderId: (folderId && folderId !== null && folderId !== '') ? folderId : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxFileSize: maxFileSize ? BigInt(maxFileSize) : null,
        allowedTypes: allowedTypes?.trim() || null,
      },
      include: {
        Folder: { select: { id: true, name: true } }
      }
    });

    // Etkinlik kaydı oluştur
    await createActivity({
      userId,
      type: 'FILE_REQUEST_CREATED',
      fileName: title.trim(),
      metadata: {
        requestId: request.id,
        expiresAt: request.expiresAt?.toISOString() || null,
        folderName: request.Folder?.name || null
      }
    });

    return res.status(201).json({
      message: "Dosya isteği oluşturuldu.",
      request: {
        id: request.id,
        title: request.title,
        description: request.description,
        token: request.token,
        folderId: request.folderId,
        folderName: request.Folder?.name || null,
        isActive: request.isActive,
        expiresAt: request.expiresAt,
        maxFileSize: request.maxFileSize ? Number(request.maxFileSize) : null,
        allowedTypes: request.allowedTypes,
        uploadCount: request.uploadCount,
        createdAt: request.createdAt
      }
    });
  } catch (err) {
    console.error("File request create error:", err);
    return res.status(500).json({ message: "Dosya isteği oluşturulurken hata oluştu." });
  }
});

// GET /file-requests/:id - Tek bir dosya isteğini getir
router.get("/:id", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const request = await prisma.fileRequest.findUnique({
      where: { id },
      include: {
        Folder: { select: { id: true, name: true } },
        FileRequestUpload: {
          orderBy: { createdAt: "desc" },
          take: 50
        }
      }
    });

    if (!request || request.userId !== userId) {
      return res.status(404).json({ message: "Dosya isteği bulunamadı." });
    }

    return res.json({
      request: {
        id: request.id,
        title: request.title,
        description: request.description,
        token: request.token,
        folderId: request.folderId,
        folderName: request.Folder?.name || null,
        isActive: request.isActive,
        expiresAt: request.expiresAt,
        maxFileSize: request.maxFileSize ? Number(request.maxFileSize) : null,
        allowedTypes: request.allowedTypes,
        uploadCount: request.uploadCount,
        lastUploadAt: request.lastUploadAt,
        createdAt: request.createdAt,
        uploads: request.FileRequestUpload.map(u => ({
          id: u.id,
          fileId: u.fileId,
          uploaderName: u.uploaderName,
          uploaderEmail: u.uploaderEmail,
          uploadedAt: u.createdAt
        }))
      }
    });
  } catch (err) {
    console.error("File request get error:", err);
    return res.status(500).json({ message: "Dosya isteği alınırken hata oluştu." });
  }
});

// PUT /file-requests/:id - Dosya isteğini güncelle
router.put("/:id", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const existing = await prisma.fileRequest.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Dosya isteği bulunamadı." });
    }

    const { title, description, folderId, expiresAt, maxFileSize, allowedTypes, isActive } = req.body;

    // Klasör kontrolü
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.userId !== userId) {
        return res.status(400).json({ message: "Geçersiz klasör." });
      }
    }

    const updated = await prisma.fileRequest.update({
      where: { id },
      data: {
        title: title?.trim() || existing.title,
        description: description !== undefined ? (description?.trim() || null) : existing.description,
        folderId: folderId !== undefined ? (folderId || null) : existing.folderId,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : existing.expiresAt,
        maxFileSize: maxFileSize !== undefined ? (maxFileSize ? BigInt(maxFileSize) : null) : existing.maxFileSize,
        allowedTypes: allowedTypes !== undefined ? (allowedTypes?.trim() || null) : existing.allowedTypes,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
      include: {
        Folder: { select: { id: true, name: true } }
      }
    });

    return res.json({
      message: "Dosya isteği güncellendi.",
      request: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        token: updated.token,
        folderId: updated.folderId,
        folderName: updated.Folder?.name || null,
        isActive: updated.isActive,
        expiresAt: updated.expiresAt,
        maxFileSize: updated.maxFileSize ? Number(updated.maxFileSize) : null,
        allowedTypes: updated.allowedTypes,
        uploadCount: updated.uploadCount,
        createdAt: updated.createdAt
      }
    });
  } catch (err) {
    console.error("File request update error:", err);
    return res.status(500).json({ message: "Dosya isteği güncellenirken hata oluştu." });
  }
});

// DELETE /file-requests/:id - Dosya isteğini sil
router.delete("/:id", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const existing = await prisma.fileRequest.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Dosya isteği bulunamadı." });
    }

    await prisma.fileRequest.delete({ where: { id } });

    return res.json({ message: "Dosya isteği silindi." });
  } catch (err) {
    console.error("File request delete error:", err);
    return res.status(500).json({ message: "Dosya isteği silinirken hata oluştu." });
  }
});

// POST /file-requests/:id/toggle - İsteği aktif/pasif yap
router.post("/:id/toggle", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const existing = await prisma.fileRequest.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Dosya isteği bulunamadı." });
    }

    const updated = await prisma.fileRequest.update({
      where: { id },
      data: { isActive: !existing.isActive }
    });

    return res.json({
      message: updated.isActive ? "Dosya isteği aktifleştirildi." : "Dosya isteği durduruldu.",
      isActive: updated.isActive
    });
  } catch (err) {
    console.error("File request toggle error:", err);
    return res.status(500).json({ message: "İşlem sırasında hata oluştu." });
  }
});

// POST /file-requests/uploads/:uploadId/save - Bekleyen dosyayı dosyalarıma kaydet
router.post("/uploads/:uploadId/save", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { uploadId } = req.params;
    const { folderId } = req.body; // Opsiyonel: farklı klasöre kaydet
    
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    // Upload kaydını bul
    const upload = await prisma.fileRequestUpload.findUnique({
      where: { id: uploadId },
      include: {
        FileRequest: {
          include: { User: true }
        }
      }
    });

    if (!upload) {
      return res.status(404).json({ message: "Yükleme kaydı bulunamadı." });
    }

    // Sahiplik kontrolü
    if (upload.FileRequest.userId !== userId) {
      return res.status(403).json({ message: "Bu dosyaya erişim yetkiniz yok." });
    }

    // Zaten kaydedilmiş mi?
    if (upload.savedToFiles) {
      return res.status(400).json({ message: "Bu dosya zaten kaydedilmiş." });
    }

    // Dosya bilgileri var mı?
    if (!upload.storageKey || !upload.filename) {
      return res.status(400).json({ message: "Dosya bilgileri eksik." });
    }

    // Hedef klasör kontrolü
    const targetFolderId = folderId || upload.FileRequest.folderId;
    if (targetFolderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: targetFolderId, userId }
      });
      if (!folder) {
        return res.status(404).json({ message: "Hedef klasör bulunamadı." });
      }
    }

    // Yeni dosya ID'si oluştur
    const fileId = randomUUID();
    
    // Dosyayı requests/ klasöründen kullanıcı klasörüne taşı/kopyala
    const ext = upload.extension ? `.${upload.extension}` : '';
    const newStorageKey = `${userId}/${fileId}${ext}`;
    
    // R2 veya local storage'da dosyayı taşı
    const R2_CONFIGURED_CHECK = process.env.R2_BUCKET_NAME && 
      process.env.R2_ACCESS_KEY_ID && 
      !process.env.R2_ACCESS_KEY_ID.includes('your_');
    
    if (R2_CONFIGURED_CHECK && upload.storageProvider === 'r2') {
      // R2'de dosyayı kopyala
      try {
        const { CopyObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        const { r2 } = await import("../lib/objectStorage");
        
        await r2.send(new CopyObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          CopySource: `${process.env.R2_BUCKET_NAME}/${upload.storageKey}`,
          Key: newStorageKey,
        }));
        
        // Eski dosyayı sil
        await r2.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: upload.storageKey,
        }));
        
        console.log("✅ R2'de dosya taşındı:", upload.storageKey, "->", newStorageKey);
      } catch (r2Error) {
        console.error("R2 taşıma hatası:", r2Error);
        return res.status(500).json({ message: "Dosya taşınırken hata oluştu." });
      }
    } else {
      // Local storage'da dosyayı taşı
      const oldPath = path.join(UPLOADS_DIR, upload.storageKey.replace('requests/', 'requests/'));
      const newDir = path.join(UPLOADS_DIR, userId);
      const newPath = path.join(newDir, `${fileId}${ext}`);
      
      if (!fs.existsSync(newDir)) {
        fs.mkdirSync(newDir, { recursive: true });
      }
      
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        console.log("✅ Local dosya taşındı:", oldPath, "->", newPath);
      } else {
        console.error("Kaynak dosya bulunamadı:", oldPath);
        return res.status(404).json({ message: "Kaynak dosya bulunamadı." });
      }
    }

    // File tablosuna kaydet
    const newFile = await prisma.file.create({
      data: {
        id: fileId,
        filename: upload.filename,
        sizeBytes: upload.sizeBytes || BigInt(0),
        mimeType: upload.mimeType,
        storagePath: newStorageKey,
        storageKey: newStorageKey,
        storageProvider: upload.storageProvider || 'local',
        userId: userId,
        folderId: targetFolderId || null,
        extension: upload.extension,
        updatedAt: new Date(),
        // Gönderen bilgileri
        receivedFromName: upload.uploaderName,
        receivedFromEmail: upload.uploaderEmail,
        receivedAt: upload.createdAt,
      }
    });

    // Upload kaydını güncelle
    await prisma.fileRequestUpload.update({
      where: { id: uploadId },
      data: {
        fileId: newFile.id,
        savedToFiles: true,
        savedAt: new Date(),
      }
    });

    // Kullanıcının depolama kullanımını güncelle
    await recalculateUserStorage(userId);

    console.log(`✅ Dosya kaydedildi: ${upload.filename} -> ${newFile.id}`);

    return res.json({
      message: "Dosya başarıyla kaydedildi.",
      file: {
        id: newFile.id,
        filename: newFile.filename,
        sizeBytes: Number(newFile.sizeBytes),
        mimeType: newFile.mimeType,
      }
    });
  } catch (err) {
    console.error("Save upload to files error:", err);
    return res.status(500).json({ message: "Dosya kaydedilirken hata oluştu." });
  }
});

// POST /file-requests/uploads/:uploadId/delete - Bekleyen dosyayı sil (kaydetmeden)
router.delete("/uploads/:uploadId", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { uploadId } = req.params;
    
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    // Upload kaydını bul
    const upload = await prisma.fileRequestUpload.findUnique({
      where: { id: uploadId },
      include: {
        FileRequest: true
      }
    });

    if (!upload) {
      return res.status(404).json({ message: "Yükleme kaydı bulunamadı." });
    }

    // Sahiplik kontrolü
    if (upload.FileRequest.userId !== userId) {
      return res.status(403).json({ message: "Bu dosyaya erişim yetkiniz yok." });
    }

    // Zaten kaydedilmiş ise silme
    if (upload.savedToFiles) {
      return res.status(400).json({ message: "Kaydedilmiş dosyalar bu şekilde silinemez." });
    }

    // Fiziksel dosyayı sil
    if (upload.storageKey) {
      const R2_CONFIGURED_CHECK = process.env.R2_BUCKET_NAME && 
        process.env.R2_ACCESS_KEY_ID && 
        !process.env.R2_ACCESS_KEY_ID.includes('your_');
      
      if (R2_CONFIGURED_CHECK && upload.storageProvider === 'r2') {
        try {
          const { deleteFromR2 } = await import("../lib/objectStorage");
          await deleteFromR2(upload.storageKey);
          console.log("✅ R2'den dosya silindi:", upload.storageKey);
        } catch (e) {
          console.error("R2 silme hatası:", e);
        }
      } else {
        const filePath = path.join(UPLOADS_DIR, upload.storageKey.replace('requests/', 'requests/'));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("✅ Local dosya silindi:", filePath);
        }
      }
    }

    // Upload kaydını sil
    await prisma.fileRequestUpload.delete({
      where: { id: uploadId }
    });

    // uploadCount'u güncelle
    await prisma.fileRequest.update({
      where: { id: upload.requestId },
      data: { uploadCount: { decrement: 1 } }
    });

    return res.json({ message: "Dosya başarıyla silindi." });
  } catch (err) {
    console.error("Delete upload error:", err);
    return res.status(500).json({ message: "Dosya silinirken hata oluştu." });
  }
});

// DELETE /file-requests/:id/deleted-uploads - Silinmiş dosya kayıtlarını temizle
router.delete("/:id/deleted-uploads", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    // Dosya isteğini ve sahipliğini kontrol et
    const request = await prisma.fileRequest.findUnique({ where: { id } });
    if (!request || request.userId !== userId) {
      return res.status(404).json({ message: "Dosya isteği bulunamadı." });
    }

    // Silinmiş dosyaları bul (dosyası olmayan upload kayıtları)
    const deletedUploads = await prisma.fileRequestUpload.findMany({
      where: {
        requestId: id,
        fileId: null as any
      }
    });

    // Ayrıca dosyası silinmiş olanları da bul
    const uploadsWithFiles = await prisma.fileRequestUpload.findMany({
      where: {
        requestId: id,
        fileId: { not: null }
      }
    });

    // Her upload için dosyanın var olup olmadığını kontrol et
    const orphanedUploads: typeof uploadsWithFiles = [];
    for (const upload of uploadsWithFiles) {
      const file = await prisma.file.findFirst({ where: { id: upload.fileId } });
      if (!file) {
        orphanedUploads.push(upload);
      }
    }
    const allDeletedIds = [...deletedUploads.map(u => u.id), ...orphanedUploads.map(u => u.id)];
    
    // Tekil ID'ler
    const uniqueIds = [...new Set(allDeletedIds)];

    if (uniqueIds.length === 0) {
      return res.json({ message: "Silinecek kayıt bulunamadı.", deletedCount: 0 });
    }

    // Upload kayıtlarını sil
    await prisma.fileRequestUpload.deleteMany({
      where: { id: { in: uniqueIds } }
    });

    // uploadCount'u güncelle
    const remainingCount = await prisma.fileRequestUpload.count({
      where: { requestId: id }
    });

    await prisma.fileRequest.update({
      where: { id },
      data: { uploadCount: remainingCount }
    });

    console.log(`✅ ${uniqueIds.length} silinmiş dosya kaydı temizlendi (request: ${id})`);

    return res.json({ 
      message: `${uniqueIds.length} silinmiş dosya kaydı temizlendi.`,
      deletedCount: uniqueIds.length
    });
  } catch (err) {
    console.error("Clean deleted uploads error:", err);
    return res.status(500).json({ message: "Kayıtlar temizlenirken hata oluştu." });
  }
});

// ============================================================================
// PUBLIC ROTALAR (Giriş gerektirmez - Dış kullanıcıların dosya yüklemesi)
// ============================================================================

// GET /file-requests/public/:token - İstek bilgilerini al (sadece başlık, açıklama vb.)
router.get("/public/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    console.log('[FileRequest] Public request for token:', token);

    const request = await prisma.fileRequest.findUnique({
      where: { token },
      include: {
        User: { select: { name: true, email: true, id: true } },
        Folder: { select: { name: true } }
      }
    });

    console.log('[FileRequest] Found request:', request ? { id: request.id, isActive: request.isActive, expiresAt: request.expiresAt } : null);

    if (!request) {
      console.log('[FileRequest] Request not found for token:', token);
      return res.status(404).json({ message: "Dosya isteği bulunamadı." });
    }

    // Süre kontrolü
    if (request.expiresAt && new Date() > request.expiresAt) {
      console.log('[FileRequest] Request expired. ExpiresAt:', request.expiresAt, 'Now:', new Date());
      // Süre doldu - etkinlik kaydı oluştur (sadece bir kez)
      const existingExpiredActivity = await prisma.activity.findFirst({
        where: {
          userId: request.userId,
          type: 'FILE_REQUEST_EXPIRED',
          metadata: { contains: request.id }
        }
      });

      if (!existingExpiredActivity) {
        await createActivity({
          userId: request.userId,
          type: 'FILE_REQUEST_EXPIRED',
          fileName: request.title,
          metadata: {
            requestId: request.id,
            expiredAt: request.expiresAt?.toISOString()
          }
        });
      }

      return res.status(410).json({ message: "Bu dosya isteğinin süresi dolmuş." });
    }

    // Aktif kontrolü
    if (!request.isActive) {
      console.log('[FileRequest] Request is not active:', request.id);
      return res.status(410).json({ message: "Bu dosya isteği artık aktif değil." });
    }

    console.log('[FileRequest] Request is valid, returning info');
    // Güvenlik: Hassas bilgileri gizle
    return res.json({
      title: request.title,
      description: request.description,
      ownerName: request.User.name || "Bilinmiyor",
      folderName: request.Folder?.name || "Ana Klasör",
      maxFileSize: request.maxFileSize ? Number(request.maxFileSize) : null,
      allowedTypes: request.allowedTypes,
    });
  } catch (err) {
    console.error("Public file request get error:", err);
    return res.status(500).json({ message: "İstek bilgileri alınırken hata oluştu." });
  }
});

// Dosya yükleme handler'ı (hem public hem de direkt token ile çalışır)
const handleFileUpload = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { uploaderName, uploaderEmail, customFileName } = req.body;
    const file = req.file;

    console.log("📤 File upload request received:");
    console.log("  - Token:", token);
    console.log("  - File:", file?.originalname, file?.size);
    console.log("  - UploaderName:", uploaderName);
    console.log("  - UploaderEmail:", uploaderEmail);

    if (!file) {
      console.log("❌ No file provided");
      return res.status(400).json({ message: "Dosya seçilmedi." });
    }

    const request = await prisma.fileRequest.findUnique({
      where: { token },
      include: { User: true }
    });

    console.log("  - Request found:", !!request);
    if (request) {
      console.log("  - Request ID:", request.id);
      console.log("  - Request isActive:", request.isActive);
      console.log("  - Request expiresAt:", request.expiresAt);
    }

    if (!request) {
      return res.status(404).json({ message: "Dosya isteği bulunamadı." });
    }

    // Süre kontrolü
    if (request.expiresAt && new Date() > request.expiresAt) {
      return res.status(410).json({ message: "Bu dosya isteğinin süresi dolmuş." });
    }

    // Aktif kontrolü
    if (!request.isActive) {
      return res.status(410).json({ message: "Bu dosya isteği artık aktif değil." });
    }

    // Dosya boyutu kontrolü
    if (request.maxFileSize && BigInt(file.size) > request.maxFileSize) {
      const maxSizeMB = Number(request.maxFileSize) / (1024 * 1024);
      return res.status(400).json({ 
        message: `Dosya boyutu çok büyük. Maksimum: ${maxSizeMB.toFixed(1)} MB` 
      });
    }

    // Dosya türü kontrolü
    if (request.allowedTypes) {
      const allowedList = request.allowedTypes.toLowerCase().split(",").map(t => t.trim());
      const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
      if (!allowedList.includes(ext)) {
        return res.status(400).json({ 
          message: `Bu dosya türü kabul edilmiyor. İzin verilen türler: ${request.allowedTypes}` 
        });
      }
    }

    // Kullanıcının depolama limitini kontrol et
    const owner = request.User;
    const currentUsage = Number(owner.usedStorageBytes || 0);
    const limit = Number(owner.storageLimitBytes || 0);
    
    if (limit > 0 && currentUsage + file.size > limit) {
      return res.status(400).json({ 
        message: "Dosya sahibinin depolama alanı dolu. Dosya yüklenemiyor." 
      });
    }

    // Dosyayı yükle (R2 veya local storage) - requests/ klasörüne
    const uploadId = randomUUID();
    const ext = path.extname(file.originalname);
    const storageKey = `requests/${request.userId}/${uploadId}${ext}`;
    let storageProvider = "local";

    if (R2_CONFIGURED && r2) {
      // R2'ye yükle
      try {
        await r2.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        }));
        storageProvider = "r2";
        console.log("✅ Dosya isteği R2'ye yüklendi:", storageKey);
      } catch (r2Error) {
        console.error("⚠️ R2 yükleme hatası, local storage'a fallback:", r2Error);
        // R2 hatası olursa local storage'a fallback
        const requestDir = path.join(UPLOADS_DIR, "requests", request.userId);
        if (!fs.existsSync(requestDir)) {
          fs.mkdirSync(requestDir, { recursive: true });
        }
        const localPath = path.join(requestDir, `${uploadId}${ext}`);
        fs.writeFileSync(localPath, file.buffer);
        storageProvider = "local";
        console.log("✅ Dosya isteği local storage'a yüklendi:", localPath);
      }
    } else {
      // Local storage'a yükle - requests/ alt klasörüne
      const requestDir = path.join(UPLOADS_DIR, "requests", request.userId);
      if (!fs.existsSync(requestDir)) {
        fs.mkdirSync(requestDir, { recursive: true });
      }
      const localPath = path.join(requestDir, `${uploadId}${ext}`);
      fs.writeFileSync(localPath, file.buffer);
      storageProvider = "local";
      console.log("✅ Dosya isteği local storage'a yüklendi:", localPath);
    }

    // Özel isim belirlenmiş mi kontrol et
    let finalFilename = file.originalname;
    if (customFileName && customFileName.trim()) {
      // Özel isim var, uzantıyı orijinal dosyadan al
      finalFilename = customFileName.trim() + ext;
    }

    // Yükleme kaydını oluştur (File tablosuna kaydetmeden)
    await prisma.fileRequestUpload.create({
      data: {
        id: uploadId,
        requestId: request.id,
        filename: finalFilename,
        originalName: file.originalname,
        sizeBytes: BigInt(file.size),
        mimeType: file.mimetype,
        storageKey: storageKey,
        storageProvider: storageProvider,
        extension: ext.replace(".", ""),
        uploaderName: uploaderName?.trim() || null,
        uploaderEmail: uploaderEmail?.trim() || null,
        ipAddress: req.ip || null,
        userAgent: req.get("user-agent") || null,
        savedToFiles: false,
      }
    });

    // İstek istatistiklerini güncelle
    await prisma.fileRequest.update({
      where: { id: request.id },
      data: {
        uploadCount: { increment: 1 },
        lastUploadAt: new Date()
      }
    });

    // Etkinlik kaydı oluştur - dosya isteğine yükleme yapıldı
    await createActivity({
      userId: request.userId,
      type: 'FILE_REQUEST_UPLOAD',
      fileName: finalFilename,
      metadata: {
        requestId: request.id,
        requestTitle: request.title,
        uploaderName: uploaderName?.trim() || 'Anonim',
        uploaderEmail: uploaderEmail?.trim() || null,
        fileSize: file.size
      }
    });

    return res.status(201).json({
      message: "Dosya başarıyla yüklendi. Dosya sahibi onayladıktan sonra kaydedilecek.",
      filename: finalFilename
    });
  } catch (err) {
    console.error("Public file upload error:", err);
    return res.status(500).json({ message: "Dosya yüklenirken hata oluştu." });
  }
};

// POST /file-requests/public/:token/upload - Dosya yükle (auth gerekmez)
router.post("/public/:token/upload", upload.single("file"), handleFileUpload);

// POST /file-requests/:token/upload - Alternatif URL (eski format uyumluluğu)
router.post("/:token/upload", upload.single("file"), handleFileUpload);

export default router;
