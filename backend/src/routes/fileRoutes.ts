import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import { deleteFromR2 } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";

const NODE_ENV = process.env.NODE_ENV || "development";

// File işlemleri (yükleme, listeleme, indirme, silme, güncelleme, paylaşım)
import {
  uploadFile,
  listFiles,
  downloadFile,
  viewFile,
  streamFile,
  downloadStreamFile,
  deleteFile,
  updateFile,
  shareFile,
  updateShare,
  getShareStats,
  unshareFile,
  publicDownload,
  getShareInfo,
  downloadEncryptedShare,
  listSharedFiles,
  listTrash,
  restoreFile,
  permanentDeleteFile,
  listVersions,
  restoreVersion,
  deleteFileVersion,
  listFavorites,
  toggleFavoriteFile,
  listTags,
  createTag,
  updateFileTags,
  toggleFileHidden,
  listHiddenFiles,
  quickTransfer,
  downloadQuickTransfer,
  downloadQuickTransferFile,
  getQuickTransferInfo,
  listUserTransfers,
  deleteTransfer,
  deleteExpiredTransfers,
  saveTransferToAccount,
} from "../controllers/fileController";
import { checkStorageQuota } from "../middleware/storageQuota";
import { prisma } from "../utils/prisma";
import { recalculateUserStorage } from "../utils/storage";
import { createFolder, updateFolder, deleteFolder, toggleFolderHidden, toggleFolderFavorite, restoreFolder, permanentDeleteFolder, shareFolder } from "../controllers/folderController";

const router = Router();

// Use memory storage for uploads (avoid writing to local disk)
const upload = multer({ storage: multer.memoryStorage() });

// Dosya yükleme (tek dosya)
router.post("/upload", requireAuth, upload.single("file"), checkStorageQuota, uploadFile);

// Listeleme
router.get("/", requireAuth, listFiles);
// Çöp kutusu listeleme
router.get("/trash", requireAuth, listTrash);
// Çöp kutusunu boşalt
router.delete("/trash", requireAuth, async (req: any, res) => {
  const startTs = Date.now();
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    console.log("[TrashEmpty] Started", { userId: req.userId });
    
    // R2 yapılandırmasını kontrol et
    if (!process.env.R2_BUCKET_NAME) {
      console.error("[TrashEmpty] R2_BUCKET_NAME not configured");
      return res.status(500).json({ message: "R2 depolama yapılandırılmamış. Lütfen sistem yöneticisine bildirin.", code: "R2_NOT_CONFIGURED" });
    }
    
    // Kullanıcının çöp kutusundaki dosyaları ve versiyonlarını al
    const trashFiles = await prisma.file.findMany({
      where: { userId: req.userId, isDeleted: true },
      include: { FileVersion: true },
    });
    
    // Kullanıcının çöp kutusundaki klasörleri al
    const trashFolders = await prisma.folder.findMany({
      where: { userId: req.userId, isDeleted: true },
    });
    
    console.log("[TrashEmpty] FilesFound", { fileCount: trashFiles.length, folderCount: trashFolders.length });
    
    if (!trashFiles.length && !trashFolders.length) {
      const userEmpty = await recalculateUserStorage(req.userId);
      console.log("[TrashEmpty] NothingToDo", { durationMs: Date.now() - startTs });
      return res.json({ message: "Çöp kutusu zaten boş.", usage: {
        usedStorageBytes: Number(userEmpty.usedStorageBytes ?? BigInt(0)),
        storageLimitBytes: Number(userEmpty.storageLimitBytes ?? BigInt(0)),
        trashStorageBytes: Number(userEmpty.trashStorageBytes ?? BigInt(0)),
        trashLimitBytes: Number(userEmpty.trashLimitBytes ?? BigInt(0)),
        plan: userEmpty.plan
      } });
    }
    
    // Remove objects from R2 (best effort - don't fail if R2 fails)
    if (process.env.R2_BUCKET_NAME) {
      for (const f of trashFiles) {
        const key = (f as any).storageKey || f.storagePath;
        if (key) {
          try { 
            await deleteFromR2(key); 
            console.log("[TrashEmpty] R2 delete OK", { fileId: f.id, key }); 
          } catch (e) { 
            console.warn("[TrashEmpty] R2 delete failed (continuing)", { key, error: (e as any)?.message }); 
          }
        }
        for (const v of f.FileVersion) {
          const vkey = (v as any).storageKey || v.storagePath;
          if (vkey) {
            try { 
              await deleteFromR2(vkey); 
              console.log("[TrashEmpty] R2 version delete OK", { vkey }); 
            } catch (e) { 
              console.warn("[TrashEmpty] R2 version delete failed (continuing)", { vkey, error: (e as any)?.message }); 
            }
          }
        }
      }
    } else {
      console.warn("[TrashEmpty] R2_BUCKET_NAME not set, skipping R2 cleanup");
    }
    
    const fileIds = trashFiles.map(f => f.id);
    const folderIds = trashFolders.map(f => f.id);
    
    try {
      await prisma.$transaction([
        prisma.fileVersion.deleteMany({ where: { fileId: { in: fileIds } } }),
        prisma.file.deleteMany({ where: { id: { in: fileIds } } }),
        prisma.folder.deleteMany({ where: { id: { in: folderIds } } }),
      ]);
      console.log("[TrashEmpty] DB rows deleted", { fileIds: fileIds.length, folderIds: folderIds.length });
    } catch (txErr: any) {
      console.error("[TrashEmpty] Transaction error", txErr?.message || txErr);
      return res.status(500).json({ message: "Çöp kutusu temizlenirken veritabanı hatası oluştu.", code: "TRASH_TX_ERROR" });
    }
    let user;
    try {
      user = await recalculateUserStorage(req.userId);
    } catch (calcErr: any) {
      console.error("[TrashEmpty] Recalculate error", calcErr?.message || calcErr);
      return res.status(500).json({ message: "Kullanıcı depolama bilgisi güncellenemedi.", code: "TRASH_RECALC_ERROR" });
    }
    console.log("[TrashEmpty] Completed", { durationMs: Date.now() - startTs });
    return res.json({ message: "Çöp kutusu boşaltıldı.", usage: {
      usedStorageBytes: Number(user.usedStorageBytes ?? BigInt(0)),
      storageLimitBytes: Number(user.storageLimitBytes ?? BigInt(0)),
      trashStorageBytes: Number(user.trashStorageBytes ?? BigInt(0)),
      trashLimitBytes: Number(user.trashLimitBytes ?? BigInt(0)),
      plan: user.plan
    } });
  } catch (err: any) {
    console.error("[TrashEmpty] Unhandled error", { 
      message: err?.message, 
      stack: err?.stack,
      code: err?.code,
      name: err?.name 
    });
    return res.status(500).json({ 
      message: err?.message || "Çöp kutusu boşaltılırken beklenmeyen hata.", 
      code: "TRASH_UNKNOWN_ERROR",
      detail: NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
});
// Favoriler listeleme
router.get("/favorites", requireAuth, listFavorites);
// Etiketler
router.get("/tags", requireAuth, listTags);
router.post("/tags", requireAuth, createTag);

// İndirme ve görüntüleme (yetkili kullanıcı)
router.get("/:id/download", requireAuth, downloadFile);
router.get("/:id/download-url", requireAuth, downloadFile); // Alias for mobile app
router.get("/:id/view", requireAuth, viewFile);
router.get("/:id/stream", streamFile); // Stream dosyayı kendi içinde doğrular
router.get("/:id/download-stream", downloadStreamFile); // Download stream dosyayı kendi içinde doğrular

// Silme
router.delete("/:id", requireAuth, deleteFile);
// Geri yükleme (soft deleted)
router.post("/:id/restore", requireAuth, restoreFile);
// Kalıcı silme (soft deleted)
router.delete("/:id/permanent", requireAuth, permanentDeleteFile);
// Favori toggle
router.post("/:id/favorite", requireAuth, toggleFavoriteFile);
// Dosya etiketlerini güncelle
router.post("/:id/tags", requireAuth, updateFileTags);

// Güncelleme (rename / move) - PUT veya PATCH ile
router.put("/:id", requireAuth, updateFile);
router.patch("/:id", requireAuth, updateFile);

// Paylaşım linki
router.post("/:id/share", requireAuth, shareFile);
// Paylaşım güncelle (izin/süre değişikliği)
router.put("/:id/share", requireAuth, updateShare);
// Paylaşımı kapat
router.post("/:id/unshare", requireAuth, unshareFile);
// Paylaşım istatistikleri (sahibi için)
router.get("/:id/share-stats", requireAuth, getShareStats);
// Versiyonlar
router.get("/:id/versions", requireAuth, listVersions);
router.post("/:id/restore-version", requireAuth, restoreVersion);
router.delete("/:id/versions/:versionId", requireAuth, deleteFileVersion);

// Gizli dosyalar
router.get("/hidden", requireAuth, listHiddenFiles);
router.post("/:id/toggle-hidden", requireAuth, toggleFileHidden);

// Hızlı Transfer endpoints
router.post("/quick-transfer", requireAuth, upload.single("file"), quickTransfer);
router.get("/quick-transfer/history", requireAuth, listUserTransfers);
router.delete("/quick-transfer/expired", requireAuth, deleteExpiredTransfers);
router.delete("/quick-transfer/:id", requireAuth, deleteTransfer);
router.get("/quick-transfer/:token", getQuickTransferInfo);
router.get("/quick-transfer/:token/download", downloadQuickTransfer);
router.get("/quick-transfer/:token/file", downloadQuickTransferFile);
router.post("/quick-transfer/:token/save", requireAuth, saveTransferToAccount);

// Folder endpoints
router.post("/folders", requireAuth, createFolder);
router.get("/folders/:id", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    
    const folder = await prisma.folder.findFirst({
      where: { id, userId }
    });
    
    if (!folder) {
      return res.status(404).json({ message: "Klasör bulunamadı" });
    }
    
    return res.json({ folder });
  } catch (err) {
    console.error("Get folder error:", err);
    return res.status(500).json({ message: "Klasör bilgisi alınamadı" });
  }
});
router.put("/folders/:id", requireAuth, updateFolder);
router.delete("/folders/:id", requireAuth, deleteFolder);
router.post("/folders/:id/restore", requireAuth, restoreFolder);
router.delete("/folders/:id/permanent", requireAuth, permanentDeleteFolder);
router.post("/folders/:id/toggle-hidden", requireAuth, toggleFolderHidden);
router.post("/folders/:id/toggle-favorite", requireAuth, toggleFolderFavorite);
router.post("/folders/:id/share", requireAuth, shareFolder);

// Public share route: /share/:token (delegate to controller)
router.get("/share/:token", publicDownload as any);
// Paylaşım bilgisi (public - şifreli dosyalar için)
router.get("/share/:token/info", getShareInfo as any);
// Şifreli dosya indirme (public - client decrypt edecek)
router.get("/share/:token/download-encrypted", downloadEncryptedShare as any);

// Paylaşımı kapat (alias: stop-share)
router.post("/:id/stop-share", requireAuth, unshareFile);
// Paylaşılan dosyalar
router.get("/shared", requireAuth, listSharedFiles);
export default router;
