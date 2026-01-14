import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { prisma } from "../utils/prisma";
import { recalculateUserStorage, enforceTrashLimit, cleanupOldTrash } from "../utils/storage";
import { uploadToR2, deleteFromR2, getPublicUrlForKey, getSignedUrlFromR2, copyInR2 } from "../lib/objectStorage";
import { sendTransferEmail } from "../utils/email";
import { createActivity } from "./activityController";
import * as syncEvents from "../lib/syncEvents";
// Yardımcı: Prisma'dan gelen BigInt alanları frontend'e uygun Number'a dönüştür
function serializeFile(f: any) {
  const serialized = {
    ...f,
    sizeBytes: Number(f.sizeBytes),
    versions: f.FileVersion ? f.FileVersion.map((v: any) => ({ ...v, sizeBytes: Number(v.sizeBytes) })) : undefined,
    folder: f.Folder ? { id: f.Folder.id, name: f.Folder.name } : undefined,
    // Şifreli dosya metadata'sı (client-side decrypt için)
    isEncrypted: Boolean(f.isEncrypted),
    metaNameEnc: f.metaNameEnc || null,
    metaNameIv: f.metaNameIv || null,
    // DEK bilgileri (paylaşım linki oluşturmak için)
    edek: f.edek || null,
    edekIv: f.edekIv || null,
    cipherIv: f.cipherIv || null,
    extension: f.extension || null,
    originalName: f.originalName || f.filename,
    // Gönderen bilgileri (Quick Transfer'dan kaydedilen dosyalar için)
    receivedFromName: f.receivedFromName || null,
    receivedFromEmail: f.receivedFromEmail || null,
    receivedAt: f.receivedAt || null,
  };
  
  // Debug: Şifreli dosyalar için log
  if (f.isEncrypted) {
    console.log(`[serializeFile] Şifreli dosya: ${f.filename}, extension: ${serialized.extension}, isEncrypted: ${serialized.isEncrypted}`);
  }
  
  return serialized;
}
import type { AuthRequest } from "../middleware/auth";

// Soft delete temizliği (30 günden eski çöp dosyaları ve klasörleri kalıcı sil)
async function cleanupDeletedFiles(userId: string) {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // 1. Eski dosyaları temizle
  const oldDeleted = await prisma.file.findMany({
    where: { userId, isDeleted: true, deletedAt: { lt: threshold } },
    include: { FileVersion: true },
  });
  
  if (oldDeleted.length > 0) {
    let totalSizeToRemove = 0n;
    for (const f of oldDeleted) {
      totalSizeToRemove += f.sizeBytes;
      for (const v of f.FileVersion) totalSizeToRemove += v.sizeBytes;
      try {
        const key = (f as any).storageKey || f.storagePath;
        if (key) {
          try {
            await deleteFromR2(key);
            try { console.log("[R2] Delete success", { key, fileId: f.id }); } catch (e) {}
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
      const filePath = path.join(__dirname, "../../uploads", (f as any).storageKey || f.storagePath || "");
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
      for (const v of f.FileVersion) {
        try { await deleteFromR2((v as any).storageKey || v.storagePath); } catch {}
        const vPath = path.join(__dirname, "../../uploads", (v as any).storageKey || v.storagePath || "");
        if (fs.existsSync(vPath)) {
          try { fs.unlinkSync(vPath); } catch {}
        }
      }
    }
    await prisma.$transaction([
      prisma.fileVersion.deleteMany({ where: { fileId: { in: oldDeleted.map(f => f.id) } } }),
      prisma.file.deleteMany({ where: { id: { in: oldDeleted.map(f => f.id) } } }),
      prisma.user.update({ where: { id: userId }, data: { usedStorageBytes: { decrement: totalSizeToRemove }, usedBytes: { decrement: totalSizeToRemove } } }),
    ]);
    console.log("[Cleanup] Deleted old files", { userId, count: oldDeleted.length });
  }
  
  // 2. Eski boş klasörleri temizle (updatedAt 30 günden eski ve isDeleted=true)
  const oldDeletedFolders = await prisma.folder.findMany({
    where: { userId, isDeleted: true, updatedAt: { lt: threshold } },
  });
  
  if (oldDeletedFolders.length > 0) {
    // Klasör içinde dosya kalmış mı kontrol et
    const emptyFolderIds: string[] = [];
    for (const folder of oldDeletedFolders) {
      const filesInFolder = await prisma.file.count({
        where: { folderId: folder.id, userId }
      });
      if (filesInFolder === 0) {
        emptyFolderIds.push(folder.id);
      }
    }
    
    if (emptyFolderIds.length > 0) {
      await prisma.folder.deleteMany({ where: { id: { in: emptyFolderIds } } });
      console.log("[Cleanup] Deleted old empty folders", { userId, count: emptyFolderIds.length });
    }
  }
}

// POST /files/upload
// Tek dosya yükler, kota kontrolü yapar; folderId varsa ilişkilendirir.
export async function uploadFile(req: AuthRequest, res: Response) {
  console.log("[Upload] Request started", {
    userId: req.userId,
    hasFile: !!req.file,
    bodyFolderId: req.body?.folderId,
    body: req.body
  });

  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Yetkisiz erişim." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Herhangi bir dosya yüklenmedi." });
    }

    const file = req.file;

    // Kullanıcıyı al (kota kontrolü için)
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    // overwrite (versioning) senaryosunda eklenen boyut kadar artacak
    const folderId = (req.body && req.body.folderId) ? String(req.body.folderId) : undefined;
    console.log("[Upload] FolderId parsed:", folderId);

    // Aynı kullanıcı + aynı folder + aynı isimde (ve silinmemiş) dosya varsa versiyonlama
    const existing = await prisma.file.findFirst({
      where: {
        userId: req.userId,
        folderId: folderId || null,
        filename: file.originalname,
        isDeleted: false,
      },
      include: { FileVersion: true },
    });

    // Ek kullanım: yeni dosya boyutu (eski dosya da saklanacaksa onun boyutu ayrıca zaten usedBytes'ta mevcut)
    const newUsedBytes = BigInt(user.usedStorageBytes) + BigInt(file.size);

    if (newUsedBytes > BigInt(user.storageLimitBytes)) {
      // If multer stored on disk, remove; otherwise ignore
      try { if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
      return res.status(400).json({ message: "Depolama kotan dolu. Dosya yüklenemedi." });
    }
    // Uzantı çıkar (".pdf" -> "pdf"), yoksa mimetype'tan tahmin
    const originalName = file.originalname;
    let ext = path.extname(originalName).toLowerCase().replace(/^\./, "");
    if (!ext && file.mimetype) {
      const parts = file.mimetype.split("/");
      ext = parts[1] ? parts[1].toLowerCase() : parts[0];
    }

    let resultFile;
    // prepare file buffer from Multer memory storage
    let fileBuffer: Buffer;
    if ((file as any).buffer && Buffer.isBuffer((file as any).buffer)) {
      fileBuffer = (file as any).buffer;
    } else if (file.path && fs.existsSync(file.path)) {
      // fallback if configured otherwise
      fileBuffer = fs.readFileSync(file.path);
    } else {
      return res.status(500).json({ message: "Yüklenen dosya okunamadı." });
    }

    if (existing) {
      // Mevcut dosyayı versiyon tablosuna ekle
      const nextVersion = (existing.FileVersion.reduce((max, v) => v.version > max ? v.version : max, 0) || 0) + 1;
      const previousVersion = nextVersion; // Bu, eski sürüm numarası
      await prisma.fileVersion.create({
        data: {
          fileId: existing.id,
          version: nextVersion,
          filename: existing.filename,
          storagePath: existing.storagePath,
          storageKey: (existing as any).storageKey || null,
          sizeBytes: existing.sizeBytes,
          mimeType: existing.mimeType,
        },
      });
      // Ana kayıt güncelle (en güncel versiyon)
      // Upload to LOCAL storage
      const safeName = originalName.replace(/[^a-zA-Z0-9.\-_%]/g, "_");
      const storageKey = `${req.userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const localPath = path.join(__dirname, "../../uploads", storageKey);
      try {
        const dir = path.dirname(localPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(localPath, fileBuffer);
      } catch (e) {
        console.error("Local upload error:", e);
        return res.status(500).json({ message: "Dosya kaydedilirken hata oldu." });
      }
      resultFile = await prisma.file.update({
        where: { id: existing.id },
        data: {
          filename: file.originalname,
          sizeBytes: BigInt(file.size),
          mimeType: file.mimetype,
          storageProvider: "LOCAL",
          storageKey: storageKey,
          storagePath: storageKey,
          publicUrl: null,
          extension: ext || existing.extension,
        },
      });
      try { console.log("[R2] Upload success", { userId: req.userId, fileId: resultFile.id, key: storageKey }); } catch (e) {}
      
      // remove local temp file if exists
      try { if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
      await prisma.user.update({ where: { id: req.userId }, data: { usedStorageBytes: newUsedBytes, usedBytes: newUsedBytes } });
      
      // Recalculate storage counters (active/trash) and return unified usage object
      const updatedUser = await recalculateUserStorage(req.userId);
      return res.status(201).json({ 
        file: serializeFile(resultFile), 
        isNewVersion: true,
        previousVersion: previousVersion,
        message: `"${file.originalname}" zaten mevcut. Yeni sürüm (v${previousVersion + 1}) olarak kaydedildi.`,
        usage: {
          usedStorageBytes: Number(updatedUser.usedStorageBytes ?? BigInt(0)),
          storageLimitBytes: Number(updatedUser.storageLimitBytes ?? BigInt(0)),
          trashStorageBytes: Number(updatedUser.trashStorageBytes ?? BigInt(0)),
          trashLimitBytes: Number(updatedUser.trashLimitBytes ?? BigInt(0)),
          plan: updatedUser.plan
        } 
      });
    } else {
      // create record first to get id
      let isHidden = req.body && req.body.isHidden === 'true';
      
      // Eğer dosya bir klasöre yükleniyorsa, klasörün gizli olup olmadığını kontrol et
      if (folderId && !isHidden) {
        const parentFolder = await prisma.folder.findUnique({
          where: { id: folderId },
          select: { isHidden: true }
        });
        if (parentFolder?.isHidden) {
          isHidden = true; // Klasör gizliyse dosya da gizli olsun
        }
      }
      
      resultFile = await prisma.file.create({
        data: {
          id: crypto.randomUUID(),
          filename: file.originalname,
          sizeBytes: BigInt(file.size),
          mimeType: file.mimetype,
          storagePath: "", // will update after upload
          userId: req.userId,
          folderId: folderId || undefined,
          isHidden: isHidden, // Gizli bölümden yüklendiyse true
          extension: ext || null,
          updatedAt: new Date(),
        },
      });
      const safeName2 = originalName.replace(/[^a-zA-Z0-9.\-_%]/g, "_");
      const storageKey2 = `${req.userId}/${Date.now()}-${crypto.randomUUID()}-${safeName2}`;
      const localPath2 = path.join(__dirname, "../../uploads", storageKey2);
      try {
        const dir = path.dirname(localPath2);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(localPath2, fileBuffer);
      } catch (e) {
        console.error("Local upload error:", e);
        try { await prisma.file.delete({ where: { id: resultFile.id } }); } catch {}
        return res.status(500).json({ message: "Dosya kaydedilirken hata oldu." });
      }
      // update record with storage key
      resultFile = await prisma.file.update({ where: { id: resultFile.id }, data: { storageProvider: "LOCAL", storageKey: storageKey2, storagePath: storageKey2, publicUrl: null } });
      try { console.log("[R2] Upload success", { userId: req.userId, fileId: resultFile.id, key: storageKey2 }); } catch (e) {}
    }
    // remove local temp file if exists
    try { if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
    await prisma.user.update({ where: { id: req.userId }, data: { usedStorageBytes: newUsedBytes, usedBytes: newUsedBytes } });
    
    // Eğer dosya bir klasöre yüklendiyse, klasörün updatedAt'ini güncelle
    if (folderId) {
      await prisma.folder.update({
        where: { id: folderId },
        data: { updatedAt: new Date() }
      });
    }
    
    // WebSocket ile diğer cihazlara bildir
    syncEvents.notifyFileUploaded(req.userId, resultFile);
    
    // Recalculate storage counters (active/trash) and return unified usage object
    const updatedUser = await recalculateUserStorage(req.userId);
    
    // Depolama güncellemesini de bildir
    syncEvents.notifyStorageUpdated(req.userId, {
      usedStorageBytes: Number(updatedUser.usedStorageBytes ?? BigInt(0)),
      storageLimitBytes: Number(updatedUser.storageLimitBytes ?? BigInt(0)),
      trashStorageBytes: Number(updatedUser.trashStorageBytes ?? BigInt(0)),
      trashLimitBytes: Number(updatedUser.trashLimitBytes ?? BigInt(0)),
      plan: updatedUser.plan
    });
    
    return res.status(201).json({ file: serializeFile(resultFile), usage: {
      usedStorageBytes: Number(updatedUser.usedStorageBytes ?? BigInt(0)),
      storageLimitBytes: Number(updatedUser.storageLimitBytes ?? BigInt(0)),
      trashStorageBytes: Number(updatedUser.trashStorageBytes ?? BigInt(0)),
      trashLimitBytes: Number(updatedUser.trashLimitBytes ?? BigInt(0)),
      plan: updatedUser.plan
    } });
  } catch (err) {
    console.error("[Upload] ERROR:", err);
    if (err instanceof Error) {
      console.error(err.stack);
    }
    return res.status(500).json({ message: "Dosya yüklenirken bir hata oluştu." });
  }
}

// GET /files
// Belirli klasör (folderId query) altındaki dosya ve klasörleri listeler, kullanım bilgisi döner.
export async function listFiles(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Yetkisiz erişim." });
    }
    const folderId = req.query.folderId ? String(req.query.folderId) : null;
    const tagFilter = req.query.tag ? String(req.query.tag).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;
    const type = req.query.type ? String(req.query.type).trim() : null; // pdf,image,video,zip,other
    const sort = req.query.sort ? String(req.query.sort).trim() : null; // name,size,date
    const orderParam = req.query.order ? String(req.query.order).trim().toLowerCase() : "desc"; // asc/desc
    const order: "asc" | "desc" = orderParam === "asc" ? "asc" : "desc";
    const includeAll = req.query.includeAll === "true"; // Tüm dosyaları getir (klasör farkı gözetmeksizin)

    // Tip genişletmeleri
    const IMAGE_EXT = ["jpg","jpeg","png","gif","webp","svg"];
    const VIDEO_EXT = ["mp4","mov","avi","mkv","webm"];
    const ZIP_EXT = ["zip","rar","7z","tar","gz"];

    await cleanupDeletedFiles(req.userId);
  // Temizlik: eski (30+ gün) çöp dosyaları sil
  await cleanupOldTrash(req.userId);

    let files;
    // Temel where koşulu
    // Ana dizindeyken (folderId null) tüm dosyaları göster, alt klasördeyken sadece o klasördekileri
    const baseWhere: any = { 
      userId: req.userId, 
      isDeleted: false,
      isHidden: false, // Gizli dosyaları gösterme
      teamId: null // Ekip dosyalarını hariç tut - onlar ekip alanında görünmeli
    };
    
    // includeAll=true ise folderId filtresini ATLA (tüm dosyalar)
    if (folderId && !includeAll) {
      baseWhere.folderId = folderId;
    }
    
    // Paylaşılanlar filtresi
    const filter = req.query.filter ? String(req.query.filter).trim().toLowerCase() : null;
    if (filter === "shared") {
      // Sadece paylaşım token'ı olan dosyalar
      baseWhere.shareToken = { not: null } as any;
    }
    // Arama
    if (search) {
      baseWhere.filename = { contains: search, mode: "insensitive" };
    }
    // Type filtresi
    if (type) {
      if (type === "pdf") {
        baseWhere.extension = "pdf";
      } else if (type === "image") {
        baseWhere.extension = { in: IMAGE_EXT };
      } else if (type === "video") {
        baseWhere.extension = { in: VIDEO_EXT };
      } else if (type === "zip") {
        baseWhere.extension = { in: ZIP_EXT };
      } else if (type === "other") {
        baseWhere.OR = [
          { extension: null },
          { extension: { notIn: ["pdf", ...IMAGE_EXT, ...VIDEO_EXT, ...ZIP_EXT] } },
        ];
      }
    }

    // Sıralama
    let orderBy: any = { createdAt: order }; // varsayılan date
    if (sort === "name") orderBy = { filename: order };
    else if (sort === "size") orderBy = { sizeBytes: order };
    else if (sort === "date") orderBy = { createdAt: order };

    if (tagFilter) {
      const tag = await prisma.tag.findFirst({ where: { userId: req.userId, name: tagFilter } });
      if (!tag) {
        files = [];
      } else {
        const fileTags = await prisma.fileTag.findMany({ where: { tagId: tag.id }, select: { fileId: true } });
        const fileIds = fileTags.map(ft => ft.fileId);
        // Tag + diğer filtreleri harmanla (baseWhere üzerine id filtresi ekle)
        const tagWhere = { ...baseWhere, id: { in: fileIds } };
        files = await prisma.file.findMany({
          where: tagWhere,
          orderBy,
          include: { 
            FileTag: { include: { Tag: true } },
            Folder: true  // Klasör bilgisini de dahil et
          },
        });
      }
    } else {
      files = await prisma.file.findMany({
        where: baseWhere,
        orderBy,
        include: { 
          FileTag: { include: { Tag: true } },
          Folder: true  // Klasör bilgisini de dahil et
        },
      });
    }

    const folders = await prisma.folder.findMany({
      where: { userId: req.userId, parentFolderId: folderId, isHidden: false, isDeleted: false, teamId: null },
      orderBy: { createdAt: "desc" },
    });

    // Her klasör için dosya sayısı ve toplam boyutu hesapla
    const foldersWithStats = await Promise.all(
      folders.map(async (folder) => {
        const folderFiles = await prisma.file.findMany({
          where: { 
            userId: req.userId, 
            folderId: folder.id,
            isDeleted: false 
          },
          select: { sizeBytes: true }
        });
        
        const fileCount = folderFiles.length;
        const totalSize = folderFiles.reduce((sum, f) => sum + f.sizeBytes, BigInt(0));
        
        return {
          ...folder,
          fileCount,
          totalSize: Number(totalSize)
        };
      })
    );

    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    const serialized = files.map(serializeFile);
    return res.json({ files: serialized, folders: foldersWithStats, usage: user ? {
      usedStorageBytes: Number(user.usedStorageBytes ?? BigInt(0)),
      storageLimitBytes: Number(user.storageLimitBytes ?? BigInt(0)),
      trashStorageBytes: Number(user.trashStorageBytes ?? BigInt(0)),
      trashLimitBytes: Number(user.trashLimitBytes ?? BigInt(0)),
      plan: user.plan
    } : null });
  } catch (err) {
    console.error("❌ [listFiles] Hata detayları:", err);
    console.error("❌ [listFiles] Stack trace:", err instanceof Error ? err.stack : 'No stack');
    return res.status(500).json({ message: "Dosyalar alınırken bir hata oluştu." });
  }
}

// GET /files/:id/download
// Kullanıcının kendi dosyasını veya ekip dosyasını fiziksel sistemi üzerinden indirir.
export async function downloadFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Yetkisiz erişim. Token bulunamadı." });
    }
    const { id } = req.params;
    
    // Önce dosyayı bul (sahiplik veya ekip kontrolü ayrı yapılacak)
    const file = await prisma.file.findFirst({ 
      where: { id, isDeleted: false },
      include: { Team: true }
    });
    
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    // Yetki kontrolü: Dosya sahibi mi veya ekip üyesi mi?
    let hasAccess = file.userId === req.userId;
    
    if (!hasAccess && file.teamId) {
      // Ekip dosyası - üyelik ve indirme yetkisi kontrolü
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: file.teamId, userId: req.userId }
      });
      const isOwner = file.Team?.ownerId === req.userId;
      
      if (membership || isOwner) {
        // Yetki kontrolü: MEMBER, EDITOR, ADMIN, OWNER indirebilir
        const role = isOwner ? 'OWNER' : membership?.role;
        const downloadRoles = ['OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'MANAGER', 'DOWNLOADER']; // backwards compat
        hasAccess = role ? downloadRoles.includes(role) : false;
        
        if (!hasAccess) {
          return res.status(403).json({ message: "Bu dosyayı indirme yetkiniz yok." });
        }
      }
    }
    
    if (!hasAccess) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    const key = (file as any).storageKey || file.storagePath;
    
    // Önce local dosya kontrolü yap - stream endpoint URL'i döndür
    const possiblePaths = [
      path.join(__dirname, "../../uploads", key || ""),
      path.join(__dirname, "../../uploads", file.userId, key || ""),
      key ? path.resolve(key) : null
    ].filter(Boolean);
    
    let foundLocalPath: string | null = null;
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        foundLocalPath = p;
        break;
      }
    }
    
    if (foundLocalPath) {
      // Local dosya için download stream endpoint URL'i döndür
      const jwt = require("jsonwebtoken");
      const downloadToken = jwt.sign({ userId: req.userId, download: true }, process.env.JWT_SECRET, { expiresIn: "1h" });
      const baseUrl = process.env.FRONTEND_URL?.replace(':3000', ':5001') || `http://localhost:${process.env.PORT || 5001}`;
      return res.json({ url: `${baseUrl}/files/${id}/download-stream?token=${downloadToken}` });
    }
    
    // R2 signed URL => JSON döndür
    if (file.storageProvider === "R2" && key && process.env.R2_ACCOUNT_ID && !process.env.R2_ACCOUNT_ID.includes("your_")) {
      try {
        const signed = await getSignedUrlFromR2(key, 300);
        return res.json({ url: signed });
      } catch (e) {
        console.error("R2 signed URL error:", e);
        // R2 başarısız olursa devam et
      }
    }
    
    // Public URL fallback
    const publicUrl = file.publicUrl || getPublicUrlForKey(key);
    if (publicUrl) return res.json({ url: publicUrl });
    
    return res.status(404).json({ message: "Dosya fiziksel olarak bulunamadı." });
  } catch (err) {
    console.error("downloadFile error", err);
    return res.status(500).json({ message: "Dosya indirilirken sunucu hatası." });
  }
}

// GET /files/:id/view
// Dosyayı inline görüntüleme için aynı signed URL'e yönlendirir (PDF/image tarayıcıda açılır).
export async function viewFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Yetkisiz erişim. Token bulunamadı." });
    }
    const { id } = req.params;
    
    // Dosyayı bul (ekip bilgileriyle birlikte)
    const file = await prisma.file.findFirst({ 
      where: { id, isDeleted: false },
      include: { Team: true }
    });
    
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    // Yetki kontrolü: Dosya sahibi mi veya ekip üyesi mi?
    let hasAccess = file.userId === req.userId;
    
    if (!hasAccess && file.teamId) {
      // Ekip dosyası - üyelik kontrolü (tüm üyeler görüntüleyebilir)
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: file.teamId, userId: req.userId }
      });
      const isOwner = file.Team?.ownerId === req.userId;
      
      // Tüm ekip üyeleri (VIEWER dahil) görüntüleyebilir
      hasAccess = !!(membership || isOwner);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Bu dosyayı görüntüleme yetkiniz yok." });
      }
    }
    
    if (!hasAccess) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    const key = (file as any).storageKey || file.storagePath;
    
    console.log("[viewFile] Storage info:", {
      storageKey: (file as any).storageKey,
      storagePath: file.storagePath,
      storageProvider: file.storageProvider,
      key
    });
    
    // Önce local dosya kontrolü yap - local dosya varsa stream endpoint URL'i döndür
    // Dosya yolu doğrudan key olabilir veya uploads altında olabilir
    // key formatı: "userId/fileId.ext" veya sadece "fileId.ext"
    const possiblePaths = [
      path.join(__dirname, "../../uploads", key || ""),                         // uploads/userId/fileId.ext
      path.join(__dirname, "../../uploads", file.userId, path.basename(key || "")), // uploads/userId/fileId.ext (key'den userId çıkarılmış)
      path.join(__dirname, "../../uploads", path.basename(key || "")),          // uploads/fileId.ext
      key ? path.resolve(key) : null
    ].filter(Boolean);
    
    let foundLocalPath: string | null = null;
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        foundLocalPath = p;
        break;
      }
    }
    
    console.log("[viewFile] Local file check:", { possiblePaths, foundLocalPath });
    
    if (foundLocalPath) {
      // Local dosya için stream endpoint URL'i döndür (token ile)
      const jwt = require("jsonwebtoken");
      const streamToken = jwt.sign({ userId: req.userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
      // Request'ten gerçek host'u al (mobil cihazlar için)
      const protocol = req.protocol || 'http';
      const host = req.get('host') || `localhost:${process.env.PORT || 5001}`;
      const baseUrl = `${protocol}://${host}`;
      return res.json({ url: `${baseUrl}/files/${id}/stream?token=${streamToken}` });
    }
    
    // R2'den dene (sadece R2 yapılandırılmışsa)
    if (file.storageProvider === "R2" && key) {
      // R2 yapılandırması kontrol
      const r2Configured = process.env.R2_ACCOUNT_ID && 
                           !process.env.R2_ACCOUNT_ID.includes("your_") &&
                           process.env.R2_ACCESS_KEY_ID &&
                           !process.env.R2_ACCESS_KEY_ID.includes("your_");
      
      if (!r2Configured) {
        console.warn("[viewFile] R2 storage provider but R2 not configured. File:", id);
        // R2 yapılandırılmamışsa, placeholder resim döndür (galeri için)
        const mimeType = file.mimeType || "";
        if (mimeType.startsWith("image/")) {
          // Placeholder resim URL'i döndür
          return res.json({ 
            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect fill='%23374151' width='200' height='200'/%3E%3Ctext fill='%239CA3AF' font-family='Arial' font-size='14' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle'%3ER2 Yapılandırılmamış%3C/text%3E%3C/svg%3E",
            placeholder: true,
            message: "R2 depolama yapılandırılmamış"
          });
        }
        // Diğer dosya türleri için hata döndür
        return res.status(503).json({ 
          message: "R2 depolama yapılandırılmamış. Dosya şu anda görüntülenemiyor.",
          code: "R2_NOT_CONFIGURED"
        });
      }
      
      try {
        const signed = await getSignedUrlFromR2(key, 300);
        return res.json({ url: signed });
      } catch (e) {
        console.error("R2 signed URL error (view):", e);
        // R2 başarısız olursa devam et
      }
    }
    
    const publicUrl = file.publicUrl || getPublicUrlForKey(key);
    if (publicUrl) return res.json({ url: publicUrl });
    
    return res.status(404).json({ message: "Dosya fiziksel olarak bulunamadı." });
  } catch (err) {
    console.error("viewFile error", err);
    return res.status(500).json({ message: "Dosya görüntülenirken sunucu hatası." });
  }
}

// GET /files/:id/stream
// Local dosyayı doğrudan stream eder (token query param ile doğrular)
export async function streamFile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(401).json({ message: "Token gerekli." });
    }
    
    // Token'ı doğrula
    const jwt = require("jsonwebtoken");
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Geçersiz token." });
    }
    
    const userId = decoded.userId;
    
    // Dosyayı bul (ekip bilgileriyle birlikte)
    const file = await prisma.file.findFirst({ 
      where: { id, isDeleted: false },
      include: { Team: true }
    });
    
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    // Yetki kontrolü: Dosya sahibi mi veya ekip üyesi mi?
    let hasAccess = file.userId === userId;
    
    if (!hasAccess && file.teamId) {
      // Ekip dosyası - üyelik kontrolü (tüm üyeler görüntüleyebilir)
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: file.teamId, userId }
      });
      const isOwner = file.Team?.ownerId === userId;
      
      // Tüm ekip üyeleri (VIEWER dahil) görüntüleyebilir
      hasAccess = !!(membership || isOwner);
    }
    
    if (!hasAccess) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    const key = (file as any).storageKey || file.storagePath;
    
    // Dosyayı farklı olası yollarda ara
    const possiblePaths = [
      path.join(__dirname, "../../uploads", key || ""),
      path.join(__dirname, "../../uploads", file.userId, key || ""),
      key ? path.resolve(key) : null
    ].filter(Boolean);
    
    let foundLocalPath: string | null = null;
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        foundLocalPath = p;
        break;
      }
    }
    
    console.log("[streamFile] Paths checked:", { key, possiblePaths, foundLocalPath });
    
    if (foundLocalPath) {
      const mimeType = file.mimeType || "application/octet-stream";
      
      // CORS ve güvenlik headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "public, max-age=3600");
      
      // PDF için ek headers (iframe'de görüntüleme için)
      if (mimeType === "application/pdf") {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.removeHeader("X-Frame-Options"); // iframe'de açılmasına izin ver
      }
      
      return res.sendFile(foundLocalPath);
    }
    return res.status(404).json({ message: "Dosya fiziksel olarak bulunamadı." });
  } catch (err) {
    console.error("streamFile error", err);
    return res.status(500).json({ message: "Dosya stream edilirken sunucu hatası." });
  }
}

// GET /files/:id/download-stream
// Local dosyayı indirme olarak stream eder (token query param ile doğrular)
export async function downloadStreamFile(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(401).json({ message: "Token gerekli." });
    }
    
    // Token'ı doğrula
    const jwt = require("jsonwebtoken");
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Geçersiz token." });
    }
    
    const userId = decoded.userId;
    
    // Dosyayı bul (ekip bilgileriyle birlikte)
    const file = await prisma.file.findFirst({ 
      where: { id, isDeleted: false },
      include: { Team: true }
    });
    
    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    // Yetki kontrolü: Dosya sahibi mi veya ekip üyesi mi?
    let hasAccess = file.userId === userId;
    
    if (!hasAccess && file.teamId) {
      // Ekip dosyası - üyelik ve indirme yetkisi kontrolü
      const membership = await prisma.teamMember.findFirst({
        where: { teamId: file.teamId, userId }
      });
      const isOwner = file.Team?.ownerId === userId;
      
      if (membership || isOwner) {
        const role = isOwner ? 'OWNER' : membership?.role;
        const downloadRoles = ['OWNER', 'ADMIN', 'EDITOR', 'MEMBER', 'MANAGER', 'DOWNLOADER']; // backwards compat
        hasAccess = role ? downloadRoles.includes(role) : false;
      }
    }
    
    if (!hasAccess) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    const key = (file as any).storageKey || file.storagePath;
    
    // Dosyayı farklı olası yollarda ara
    const possiblePaths = [
      path.join(__dirname, "../../uploads", key || ""),
      path.join(__dirname, "../../uploads", file.userId, key || ""),
      key ? path.resolve(key) : null
    ].filter(Boolean);
    
    let foundLocalPath: string | null = null;
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        foundLocalPath = p;
        break;
      }
    }
    
    if (foundLocalPath) {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.filename)}"`);
      return res.sendFile(foundLocalPath);
    }
    return res.status(404).json({ message: "Dosya fiziksel olarak bulunamadı." });
  } catch (err) {
    console.error("downloadStreamFile error", err);
    return res.status(500).json({ message: "Dosya indirilirken sunucu hatası." });
  }
}

// DELETE /files/:id
// Dosya kaydını ve fiziksel dosyayı siler; usage günceller.
// Soft delete dosya (çöp kutusuna gönderir)
export async function deleteFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Yetkisiz erişim." });
    }

    const { id } = req.params;

    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false } });

    if (!file) {
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }

    await prisma.file.update({ where: { id: file.id }, data: { isDeleted: true, deletedAt: new Date() } });
    
    // WebSocket ile diğer cihazlara bildir
    syncEvents.notifyFileDeleted(req.userId, file.id, file.folderId);
    
    await recalculateUserStorage(req.userId);
    await enforceTrashLimit(req.userId);
    const userAfter = await prisma.user.findUnique({ where: { id: req.userId } });
    
    // Depolama güncellemesini de bildir
    if (userAfter) {
      syncEvents.notifyStorageUpdated(req.userId, {
        usedStorageBytes: Number(userAfter.usedStorageBytes ?? BigInt(0)),
        storageLimitBytes: Number(userAfter.storageLimitBytes ?? BigInt(0)),
        trashStorageBytes: Number(userAfter.trashStorageBytes ?? BigInt(0)),
        trashLimitBytes: Number(userAfter.trashLimitBytes ?? BigInt(0)),
        plan: userAfter.plan
      });
    }
    
    return res.json({ message: "Dosya çöp kutusuna taşındı.", usage: userAfter ? {
      usedStorageBytes: Number(userAfter.usedStorageBytes ?? BigInt(0)),
      storageLimitBytes: Number(userAfter.storageLimitBytes ?? BigInt(0)),
      trashStorageBytes: Number(userAfter.trashStorageBytes ?? BigInt(0)),
      trashLimitBytes: Number(userAfter.trashLimitBytes ?? BigInt(0)),
      plan: userAfter.plan
    } : null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Dosya silinirken bir hata oluştu." });
  }
}

// PUT/PATCH /files/:id (rename / move)
// Dosya adını veya klasörünü günceller.
export async function updateFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { name, folderId, comment } = req.body || {};
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    
    // Build update data dynamically
    const updateData: any = {};
    if (name !== undefined) updateData.filename = String(name).trim();
    if (folderId !== undefined) updateData.folderId = folderId || null;
    if (comment !== undefined) updateData.comment = comment ? String(comment).trim() : null;
    
    const updated = await prisma.file.update({
      where: { id: file.id },
      data: updateData,
    });
    
    // WebSocket ile diğer cihazlara bildir
    if (name !== undefined) {
      syncEvents.notifyFileRenamed(req.userId, file.id, updateData.filename, updated.folderId);
    }
    if (folderId !== undefined) {
      syncEvents.notifyFileMoved(req.userId, file.id, file.folderId, updateData.folderId);
    }
    
    return res.json({ file: serializeFile(updated) });
  } catch (err: any) {
    console.error("updateFile error:", err?.message || err);
    return res.status(500).json({ message: "Dosya güncellenirken hata oluştu.", error: err?.message });
  }
}

// POST /files/:id/share
// Paylaşım linki üretir (varsayılan 24 saat). shareUrl döner.
// Şifreli dosyalar için DEK bilgisi de döner (client fragment ile ekleyecek)
export async function shareFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { expiresIn, permission } = req.body || {};
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });

    // expiresIn can be: number (hours), or string: '1h','1d','7d','unlimited'
    let expiresAt: Date | null = null;
    if (expiresIn !== undefined && expiresIn !== null) {
      if (typeof expiresIn === "number" || !isNaN(Number(expiresIn))) {
        const hours = Number(expiresIn);
        if (hours > 0) expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      } else if (typeof expiresIn === "string") {
        const v = expiresIn.toLowerCase();
        if (v === "1h" || v === "hour" || v === "1hour") expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        else if (v === "1d" || v === "day" || v === "1day") expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        else if (v === "7d" || v === "7day" || v === "7days") expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        else if (v === "unlimited" || v === "never" || v === "0") expiresAt = null;
      }
    } else {
      // default 24 hours
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    // permission handling: VIEW (sadece görüntüleme), DOWNLOAD (görüntüleme+indirme), EDIT (tüm izinler)
    let perm: "VIEW" | "DOWNLOAD" | "EDIT" = "DOWNLOAD";
    if (permission && typeof permission === "string") {
      const p = permission.toUpperCase();
      if (p === "VIEW") perm = "VIEW";
      else if (p === "EDIT") perm = "EDIT";
      else perm = "DOWNLOAD"; // default
    }

    const token = crypto.randomUUID();
    const updated = await prisma.file.update({
      where: { id: file.id },
      data: {
        shareToken: token,
        shareExpiresAt: expiresAt,
        sharePermission: perm as any,
        shareOpenCount: 0,
        shareLastOpenedAt: null,
      },
    });

    // Create activity record for file share
    await createActivity({
      userId: req.userId!,
      type: 'FILE_SHARE',
      fileId: file.id,
      fileName: file.filename,
      folderId: file.folderId || undefined,
      metadata: { permission: perm, expiresAt },
    });

    const base = `${req.protocol}://${req.get("host")}`;
    
    // Şifreli dosyalar için DEK bilgilerini de döndür
    // Client bu bilgileri URL fragment (#) olarak ekleyecek - sunucu görmez
    const encryptionInfo = file.isEncrypted ? {
      isEncrypted: true,
      edek: file.edek,           // Encrypted DEK (master key ile şifreli)
      edekIv: file.edekIv,       // DEK için IV
      cipherIv: file.cipherIv,   // Dosya içeriği için IV
      metaNameEnc: file.metaNameEnc, // Şifreli dosya adı
      metaNameIv: file.metaNameIv,   // Dosya adı için IV
    } : null;
    
    return res.json({ 
      shareUrl: `${base}/share/${updated.shareToken}`, 
      share: { permission: perm, expiresAt: updated.shareExpiresAt },
      encryptionInfo
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Paylaşım linki oluşturulurken hata." });
  }
}

// PUT /files/:id/share
// Mevcut paylaşımın izinlerini günceller (token değişmez)
export async function updateShare(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { permission, expiresIn } = req.body || {};
    
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    if (!file.shareToken) return res.status(400).json({ message: "Bu dosya paylaşılmamış." });
    
    const updateData: any = {};
    
    // Permission update
    if (permission && typeof permission === "string") {
      const p = permission.toUpperCase();
      if (p === "VIEW") updateData.sharePermission = "VIEW";
      else if (p === "EDIT") updateData.sharePermission = "EDIT";
      else updateData.sharePermission = "DOWNLOAD";
    }
    
    // ExpiresIn update
    if (expiresIn !== undefined) {
      let expiresAt: Date | null = null;
      if (typeof expiresIn === "number" && expiresIn > 0) {
        expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000);
      } else if (typeof expiresIn === "string") {
        const val = expiresIn.trim();
        if (val && val !== "unlimited" && val !== "never" && val !== "0") {
          const hours = parseInt(val, 10);
          if (!isNaN(hours) && hours > 0) {
            expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
          }
        }
      }
      updateData.shareExpiresAt = expiresAt;
    }
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Güncellenecek alan bulunamadı." });
    }
    
    const updated = await prisma.file.update({
      where: { id: file.id },
      data: updateData,
    });
    
    const base = `${req.protocol}://${req.get("host")}`;
    return res.json({
      shareUrl: `${base}/share/${updated.shareToken}`,
      share: { 
        permission: updated.sharePermission || "DOWNLOAD", 
        expiresAt: updated.shareExpiresAt 
      }
    });
  } catch (err) {
    console.error("updateShare error:", err);
    return res.status(500).json({ message: "Paylaşım güncellenirken hata." });
  }
}

// GET /share/:token (public)
// Paylaşım linkinden dosya indirme (kullanıcı yetkisi gerekmez).
export async function publicDownload(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const file = await prisma.file.findFirst({ where: { shareToken: token, isDeleted: false } });
    if (!file) {
      return res.status(404).json({ message: "Geçersiz veya süresi dolmuş link." });
    }
    if (file.shareExpiresAt && file.shareExpiresAt.getTime() < Date.now()) {
      return res.status(404).json({ message: "Geçersiz veya süresi dolmuş link." });
    }
    
    // Şifreli dosyalar için özel sayfa göster (client-side decrypt gerekli)
    if (file.isEncrypted) {
      // Frontend'e yönlendir - client DEK ile çözecek
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      return res.redirect(`${frontendUrl}/share/${token}`);
    }
    
    // Serve via R2 public URL if available
    const key = (file as any).storageKey || file.storagePath;
    let redirectUrl = file.publicUrl || getPublicUrlForKey(key);

    try { console.log("[R2] Public download", { token, fileId: file.id, permission: file.sharePermission || "DOWNLOAD" }); } catch (e) {}

    // Increment counters and log
    try {
      const now = new Date();
      
      // Dosya sahibinin trackShareLinks tercihini kontrol et
      const owner = await prisma.user.findUnique({
        where: { id: file.userId },
        select: { trackShareLinks: true }
      });
      
      const shouldTrackLogs = owner?.trackShareLinks ?? true;
      
      if (shouldTrackLogs) {
        await prisma.$transaction([
          prisma.file.update({ where: { id: file.id }, data: { shareOpenCount: { increment: 1 }, shareLastOpenedAt: now } }),
          prisma.fileShareLog.create({ data: { id: crypto.randomUUID(), fileId: file.id, openedAt: now, ipAddress: String(req.ip || req.socket?.remoteAddress || ""), userAgent: String(req.get("user-agent") || "") } }),
        ]);
      } else {
        // Sadece counter'ı güncelle, log kaydetme
        await prisma.file.update({ where: { id: file.id }, data: { shareOpenCount: { increment: 1 }, shareLastOpenedAt: now } });
      }
    } catch (e) {
      console.error("Share stats/log error:", e);
    }

    // Permission: VIEW -> inline, DOWNLOAD -> attachment
    const perm = file.sharePermission || "DOWNLOAD";
    if (file.storageProvider === "R2" && key) {
      try {
        const signed = await getSignedUrlFromR2(key, 300);
        // VIEW modunda dosyayı inline göstermek için Content-Disposition header'ı ile redirect
        if (perm === "VIEW") {
          // Browser'ın dosyayı inline görüntülemesi için redirect yeterli
          // (R2 signed URL zaten dosyayı serve eder)
          return res.redirect(signed);
        }
        // DOWNLOAD modunda attachment olarak indir
        return res.redirect(signed);
      } catch (e) {
        console.error("R2 signed URL error:", e);
        // R2 hatası olsa bile yerel dosyaya fallback yapalım
      }
    }
    // Public URL varsa redirect et
    if (redirectUrl) {
      return res.redirect(redirectUrl);
    }
    // Fallback: serve local file if present
    const filePath = path.join(__dirname, "../../uploads", key || "");
    if (key && fs.existsSync(filePath)) {
      if (perm === "VIEW") {
        res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
        return res.sendFile(filePath);
      }
      return res.download(filePath, file.filename);
    }
    return res.status(404).json({ message: "Dosya bulunamadı veya erişilemiyor." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Paylaşılan dosya indirilirken hata." });
  }
}

// GET /share/:token/info (public)
// Paylaşım linki hakkında bilgi döner (dosya adı, boyut, şifreli mi, süre vb.)
export async function getShareInfo(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const file = await prisma.file.findFirst({ where: { shareToken: token, isDeleted: false } });
    if (!file) {
      return res.status(404).json({ message: "Geçersiz veya süresi dolmuş link." });
    }
    if (file.shareExpiresAt && file.shareExpiresAt.getTime() < Date.now()) {
      return res.status(404).json({ message: "Geçersiz veya süresi dolmuş link." });
    }
    
    // İstatistikleri güncelle
    try {
      const now = new Date();
      
      // Dosya sahibinin trackShareLinks tercihini kontrol et
      const owner = await prisma.user.findUnique({
        where: { id: file.userId },
        select: { trackShareLinks: true }
      });
      
      const shouldTrackLogs = owner?.trackShareLinks ?? true;
      
      if (shouldTrackLogs) {
        await prisma.$transaction([
          prisma.file.update({ where: { id: file.id }, data: { shareOpenCount: { increment: 1 }, shareLastOpenedAt: now } }),
          prisma.fileShareLog.create({ data: { id: crypto.randomUUID(), fileId: file.id, openedAt: now, ipAddress: String(req.ip || req.socket?.remoteAddress || ""), userAgent: String(req.get("user-agent") || "") } }),
        ]);
      } else {
        // Sadece counter'ı güncelle, log kaydetme
        await prisma.file.update({ where: { id: file.id }, data: { shareOpenCount: { increment: 1 }, shareLastOpenedAt: now } });
      }
    } catch (e) {
      console.error("Share stats/log error:", e);
    }
    
    return res.json({
      filename: file.isEncrypted ? "Şifreli Dosya" : file.filename,
      originalFilename: file.filename, // Gerçek dosya adı (mimeType tahmini için)
      sizeBytes: Number(file.sizeBytes),
      mimeType: file.mimeType,
      permission: file.sharePermission || "DOWNLOAD",
      expiresAt: file.shareExpiresAt,
      isEncrypted: file.isEncrypted || false,
      cipherIv: file.cipherIv || null, // Şifre çözme için IV
      // Şifreli dosyalar için download endpoint'i
      downloadUrl: file.isEncrypted 
        ? `/api/share/${token}/download-encrypted`
        : `/share/${token}`,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Paylaşım bilgisi alınırken hata." });
  }
}

// GET /share/:token/download-encrypted (public)
// Şifreli dosyanın raw içeriğini döner (client tarafında decrypt edilecek)
export async function downloadEncryptedShare(req: Request, res: Response) {
  try {
    const { token } = req.params;
    console.log("📥 Download encrypted share request:", token);
    
    const file = await prisma.file.findFirst({ where: { shareToken: token, isDeleted: false } });
    if (!file) {
      console.log("❌ File not found for token:", token);
      return res.status(404).json({ message: "Geçersiz veya süresi dolmuş link." });
    }
    if (file.shareExpiresAt && file.shareExpiresAt.getTime() < Date.now()) {
      console.log("❌ Share expired for token:", token);
      return res.status(404).json({ message: "Geçersiz veya süresi dolmuş link." });
    }
    
    if (!file.isEncrypted) {
      console.log("❌ File is not encrypted:", file.id);
      return res.status(400).json({ message: "Bu endpoint sadece şifreli dosyalar için kullanılır." });
    }
    
    const key = (file as any).storageKey || file.storagePath;
    console.log("📦 Storage key:", key, "Provider:", file.storageProvider);
    
    // Şifreleme bilgilerini header'a ekle
    res.setHeader("X-Cipher-Iv", file.cipherIv || "");
    res.setHeader("X-Is-Encrypted", "true");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Access-Control-Expose-Headers", "X-Cipher-Iv, X-Is-Encrypted");
    
    // Önce R2'yi dene (provider ne olursa olsun - migration durumları için)
    if (key) {
      try {
        const signed = await getSignedUrlFromR2(key, 300);
        console.log("🔄 Trying R2...");
        
        const r2Response = await fetch(signed);
        if (r2Response.ok) {
          console.log("✅ R2'den dosya bulundu");
          const arrayBuffer = await r2Response.arrayBuffer();
          res.setHeader("Content-Length", arrayBuffer.byteLength);
          return res.send(Buffer.from(arrayBuffer));
        }
        console.log("⚠️ R2'de bulunamadı, local deneniyor...");
      } catch (e) {
        console.log("⚠️ R2 hatası, local deneniyor...", (e as Error).message);
      }
    }
    
    // Local fallback - birkaç olası path'i dene
    const possiblePaths = [
      path.join(__dirname, "../../uploads", key || ""),
      path.join(__dirname, "../../uploads", file.userId, file.id),
      path.join(__dirname, "../../uploads", file.id)
    ];
    
    for (const filePath of possiblePaths) {
      console.log("📁 Checking local path:", filePath);
      if (fs.existsSync(filePath)) {
        console.log("✅ Local file found, sending...");
        return res.sendFile(filePath);
      }
    }
    
    console.log("❌ File not found in any storage");
    return res.status(404).json({ message: "Dosya bulunamadı." });
  } catch (err) {
    console.error("❌ Download encrypted share error:", err);
    return res.status(500).json({ message: "Dosya indirilirken hata." });
  }
}

// GET /files/:id/share-stats
// Dosya sahibi için paylaşım istatistiklerini döner (sayacı, son açılma, son loglar)
export async function getShareStats(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    const logs = await prisma.fileShareLog.findMany({ where: { fileId: file.id }, orderBy: { openedAt: "desc" }, take: 50 });
    return res.json({ shareOpenCount: file.shareOpenCount ?? 0, shareLastOpenedAt: file.shareLastOpenedAt || null, logs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Paylaşım istatistikleri alınırken hata." });
  }
}

// POST /files/:id/unshare
// Paylaşımı kapatır: token/expire/permission sıfırlar ve logları siler
export async function unshareFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });

    // Logları sil ve paylaşımı sıfırla
    let updated;
    try {
      await prisma.fileShareLog.deleteMany({ where: { fileId: file.id } });
    } catch (e) {
      // log silme hataları paylaşımı kapatmayı engellemesin
      console.error("Unshare log delete error:", e);
    }

    try {
      updated = await prisma.file.update({
        where: { id: file.id },
        data: {
          shareToken: null,
          shareExpiresAt: null,
          sharePermission: null as any, // enum nullable
          shareOpenCount: 0,
          shareLastOpenedAt: null,
        },
      });
    } catch (e) {
      console.error("Unshare update error:", e);
      return res.status(500).json({ message: "Paylaşım kapatılırken hata oluştu." });
    }

    return res.json({ message: "Paylaşım kapatıldı.", file: serializeFile(updated) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Paylaşım kapatılırken hata oluştu." });
  }
}

// GET /files/trash - kullanıcının silinmiş dosyaları ve klasörleri
export async function listTrash(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    await cleanupDeletedFiles(req.userId);
    const { folderId } = req.query;
    
    const files = await prisma.file.findMany({
      where: { 
        userId: req.userId, 
        isDeleted: true,
        ...(folderId ? { folderId: String(folderId) } : {})
      },
      orderBy: { deletedAt: "desc" },
      include: { FileTag: { include: { Tag: true } } },
    });
    
    // Çöp kutusundaki klasörleri getir - sadece üst düzey silinen klasörler
    // (parentFolderId'si null olan veya parent'ı silinmemiş olan klasörler)
    const allDeletedFolders = await prisma.folder.findMany({
      where: { 
        userId: req.userId, 
        isDeleted: true,
      },
      orderBy: { updatedAt: "desc" }
    });
    
    // Sadece üst düzey silinen klasörleri filtrele
    // Parent klasörü de silinmişse, o klasörü ayrıca gösterme (parent içinde gösterilecek)
    const deletedFolderIds = new Set(allDeletedFolders.map(f => f.id));
    const topLevelDeletedFolders = allDeletedFolders.filter(folder => {
      // Parent yoksa (null) veya parent silinmemişse, bu üst düzey silinen klasördür
      if (!folder.parentFolderId) return true;
      // Parent de silinmişse, bu klasör parent içinde gösterilecek
      return !deletedFolderIds.has(folder.parentFolderId);
    });
    
    // Her klasör için içindeki dosyaların toplam boyutunu hesapla
    const foldersWithSize = await Promise.all(
      topLevelDeletedFolders.map(async (folder) => {
        const folderFiles = await prisma.file.findMany({
          where: { folderId: folder.id, userId: req.userId },
          select: { sizeBytes: true }
        });
        const totalSize = folderFiles.reduce((sum, f) => sum + Number(f.sizeBytes), 0);
        const fileCount = folderFiles.length;
        return { ...folder, totalSize, fileCount };
      })
    );
    
    return res.json({ files: files.map(serializeFile), folders: foldersWithSize });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Çöp kutusu listelenirken hata." });
  }
}

// POST /files/:id/restore - soft deleted dosyayı geri yükle
export async function restoreFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: true } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    const restored = await prisma.file.update({ where: { id: file.id }, data: { isDeleted: false, deletedAt: null } });
        await recalculateUserStorage(req.userId);
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        return res.json({ file: serializeFile(restored), message: "Dosya geri yüklendi.", usage: user ? {
          usedStorageBytes: Number(user.usedStorageBytes ?? BigInt(0)),
          storageLimitBytes: Number(user.storageLimitBytes ?? BigInt(0)),
          trashStorageBytes: Number(user.trashStorageBytes ?? BigInt(0)),
          trashLimitBytes: Number(user.trashLimitBytes ?? BigInt(0)),
          plan: user.plan
        } : null });
    return res.json({ file: restored, message: "Dosya geri yüklendi." });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Dosya geri yüklenirken hata." });
  }
}

// DELETE /files/:id/permanent - çöp kutusundaki dosyayı kalıcı sil
export async function permanentDeleteFile(req: AuthRequest, res: Response) {
  try {
    console.log("[permanentDelete] Start", { userId: req.userId, fileId: req.params.id });
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: true }, include: { FileVersion: true } });
    if (!file) {
      console.log("[permanentDelete] File not found", { id, userId: req.userId });
      return res.status(404).json({ message: "Dosya bulunamadı." });
    }
    
    console.log("[permanentDelete] File found", { fileId: file.id, filename: file.filename, isDeleted: file.isDeleted });
    
    let totalSize = file.sizeBytes;
    for (const v of file.FileVersion) {
      totalSize = totalSize + v.sizeBytes;
    }
    
    // Physical delete from R2 (preferred) and local fallback
    try {
      const key = (file as any).storageKey || file.storagePath;
      if (key) {
        try {
          await deleteFromR2(key);
          console.log("[R2] Delete success", { userId: req.userId, fileId: file.id, key });
        } catch (e) {
          console.log("[R2] Delete failed (ignored)", { key, error: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {}
    
    for (const v of file.FileVersion) {
      try {
        const vkey = (v as any).storageKey || v.storagePath;
        if (vkey) {
          try {
            await deleteFromR2(vkey);
            console.log("[R2] Version delete success", { userId: req.userId, fileId: file.id, key: vkey });
          } catch (e) {
            console.log("[R2] Version delete failed (ignored)", { key: vkey, error: e instanceof Error ? e.message : String(e) });
          }
        }
      } catch (e) {}
    }
    
    const filePath = path.join(__dirname, "../../uploads", (file as any).storageKey || file.storagePath || "");
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }
    for (const v of file.FileVersion) {
      const vPath = path.join(__dirname, "../../uploads", (v as any).storageKey || v.storagePath || "");
      if (fs.existsSync(vPath)) { try { fs.unlinkSync(vPath); } catch {} }
    }
    
    console.log("[permanentDelete] Starting transaction", { totalSize: totalSize.toString() });
    
    await prisma.$transaction([
      prisma.fileTag.deleteMany({ where: { fileId: file.id } }),
      prisma.fileShareLog.deleteMany({ where: { fileId: file.id } }),
      prisma.fileVersion.deleteMany({ where: { fileId: file.id } }),
      prisma.file.delete({ where: { id: file.id } }),
      prisma.user.update({ 
        where: { id: req.userId }, 
        data: { 
          trashStorageBytes: { decrement: totalSize }
        } 
      }),
    ]);
    
    console.log("[permanentDelete] Transaction complete");
    
    const updatedUser = await recalculateUserStorage(req.userId);
    return res.json({ message: "Dosya kalıcı olarak silindi.", usage: {
      usedStorageBytes: Number(updatedUser.usedStorageBytes ?? BigInt(0)),
      storageLimitBytes: Number(updatedUser.storageLimitBytes ?? BigInt(0)),
      trashStorageBytes: Number(updatedUser.trashStorageBytes ?? BigInt(0)),
      trashLimitBytes: Number(updatedUser.trashLimitBytes ?? BigInt(0)),
      plan: updatedUser.plan
    } });
  } catch (err) {
    console.error("Permanent delete error:", err); 
    return res.status(500).json({ message: "Kalıcı silme sırasında hata.", error: err instanceof Error ? err.message : String(err) });
  }
}

// GET /files/:id/versions - versiyon listesini döner
export async function listVersions(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    const versions = await prisma.fileVersion.findMany({ 
      where: { fileId: file.id }, 
      orderBy: { createdAt: "desc" } // Tarihe göre sırala (en yeni önce)
    });
    return res.json({ file: serializeFile(file), versions: versions.map(v => ({ ...v, sizeBytes: Number(v.sizeBytes) })) });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Versiyonlar alınırken hata." });
  }
}

// GET /files/favorites - favori dosyalar (silinmemiş ve gizli olmayan)
export async function listFavorites(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    // Sadece direkt favori olan dosyaları al (klasör içindekiler hariç)
    const files = await prisma.file.findMany({
      where: { 
        userId: req.userId, 
        isDeleted: false, 
        isHidden: false,
        isFavorite: true
      },
      orderBy: { updatedAt: "desc" },
      include: { FileTag: { include: { Tag: true } }, Folder: true },
    });
    
    // Favori klasörleri al
    const folders = await prisma.folder.findMany({
      where: { userId: req.userId, isDeleted: false, isFavorite: true, isHidden: false },
      orderBy: { updatedAt: "desc" }
    });
    
    return res.json({ files: files.map(serializeFile), folders });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Favoriler listelenirken hata." });
  }
}

// POST /files/:id/favorite { favorite: boolean }
export async function toggleFavoriteFile(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { favorite } = req.body || {};
    if (typeof favorite !== "boolean") return res.status(400).json({ message: "Geçersiz favorite değeri." });
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    const updated = await prisma.file.update({ where: { id: file.id }, data: { isFavorite: favorite } });
    return res.json({ file: serializeFile(updated) });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Favori durumu güncellenirken hata." });
  }
}

// POST /files/:id/restore-version { version }
export async function restoreVersion(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { version } = req.body || {};
    if (typeof version !== "number") return res.status(400).json({ message: "Geçersiz versiyon." });
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false }, include: { FileVersion: true } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    const targetVersion = file.FileVersion.find(v => v.version === version);
    if (!targetVersion) return res.status(404).json({ message: "Versiyon bulunamadı." });
    
    // YER DEĞİŞTİRME MANTĞI:
    // 1. Mevcut File kaydını (güncel sürüm) yedekle
    const currentFileBackup = {
      filename: file.filename,
      storagePath: file.storagePath,
      storageKey: (file as any).storageKey || null,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
    };
    
    // 2. File kaydını seçilen eski sürüm ile güncelle
    const updated = await prisma.file.update({
      where: { id: file.id },
      data: {
        filename: targetVersion.filename,
        storagePath: targetVersion.storagePath,
        storageKey: (targetVersion as any).storageKey || null,
        sizeBytes: targetVersion.sizeBytes,
        mimeType: targetVersion.mimeType,
        updatedAt: new Date(), // Güncelleme tarihini işaretle
      },
    });
    
    // 3. Eski FileVersion kaydını şu anki (eski güncel) ile güncelle
    await prisma.fileVersion.update({
      where: { id: targetVersion.id },
      data: {
        filename: currentFileBackup.filename,
        storagePath: currentFileBackup.storagePath,
        storageKey: currentFileBackup.storageKey,
        sizeBytes: currentFileBackup.sizeBytes,
        mimeType: currentFileBackup.mimeType,
        createdAt: new Date(), // Yer değiştirme tarihini işaretle
      },
    });
    
    return res.json({ file: serializeFile(updated), message: "Versiyon geri yüklendi." });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Versiyon geri yüklenirken hata." });
  }
}

// DELETE /files/:id/versions/:versionId - Belirli bir sürümü sil
export async function deleteFileVersion(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id, versionId } = req.params;
    
    // Dosyanın sahibi olduğunu doğrula
    const file = await prisma.file.findFirst({ 
      where: { id, userId: req.userId, isDeleted: false } 
    });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    
    // Versiyonu bul
    const version = await prisma.fileVersion.findUnique({ 
      where: { id: parseInt(versionId) } 
    });
    if (!version || version.fileId !== file.id) {
      return res.status(404).json({ message: "Versiyon bulunamadı." });
    }
    
    // R2'den sil (best effort)
    const vkey = (version as any).storageKey || version.storagePath;
    if (vkey && process.env.R2_BUCKET_NAME) {
      try {
        await deleteFromR2(vkey);
        console.log("[VersionDelete] R2 delete success", { versionId: version.id, key: vkey });
      } catch (e) {
        console.warn("[VersionDelete] R2 delete failed (continuing)", { key: vkey, error: (e as any)?.message });
      }
    }
    
    // Database'den sil
    await prisma.fileVersion.delete({ where: { id: version.id } });
    
    // Depolama hesaplamalarını güncelle
    await recalculateUserStorage(req.userId);
    
    return res.json({ message: "Versiyon silindi." });
  } catch (err) {
    console.error(err); 
    return res.status(500).json({ message: "Versiyon silinirken hata." });
  }
}

// GET /tags - kullanıcının etiketleri
export async function listTags(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const tags = await prisma.tag.findMany({ where: { userId: req.userId }, orderBy: { name: "asc" } });
    return res.json({ tags });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Etiketler alınırken hata." });
  }
}

// Paylaşılan dosyalar (shareToken dolu olanlar)
export async function listSharedFiles(req: any, res: any) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Yetkisiz erişim." });
    }

    const files = await prisma.file.findMany({
      where: {
        userId: req.userId,
        isDeleted: false,
        isHidden: false,
        shareToken: {
          not: null,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // BigInt alanlar JSON'a çevrilemiyor; serializeFile ile dönüştür
    const serialized = files.map((f: any) => serializeFile(f));
    return res.json(serialized);
  } catch (err) {
    console.error("Paylaşılan dosyalar listelenirken hata:", err);
    return res
      .status(500)
      .json({ message: "Paylaşılan dosyalar alınırken hata oluştu." });
  }
}

// Note: Named exports are provided via `export async function` declarations above.

// POST /tags { name }
export async function createTag(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { name } = req.body || {};
    const clean = typeof name === "string" ? name.trim() : "";
    if (!clean) return res.status(400).json({ message: "Etiket adı gerekli." });
    const existing = await prisma.tag.findFirst({ where: { userId: req.userId, name: clean } });
    if (existing) return res.json({ tag: existing });
    const tag = await prisma.tag.create({ data: { name: clean, userId: req.userId, updatedAt: new Date() } });
    return res.status(201).json({ tag });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Etiket oluşturulurken hata." });
  }
}

// POST /files/:id/tags { tags: string[] }
export async function updateFileTags(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { tags } = req.body || {};
    if (!Array.isArray(tags)) return res.status(400).json({ message: "tags dizisi gerekli." });
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false }, include: { FileTag: true } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    const cleanNames = tags.map(t => String(t).trim()).filter(t => t.length > 0);
    const uniqueNames = Array.from(new Set(cleanNames));
    const existingTags = await prisma.tag.findMany({ where: { userId: req.userId, name: { in: uniqueNames } } });
    const existingMap = new Map(existingTags.map(t => [t.name, t]));
    const toCreate = uniqueNames.filter(n => !existingMap.has(n));
    const createdTags = await Promise.all(toCreate.map(n => prisma.tag.create({ data: { name: n, userId: req.userId!, updatedAt: new Date() } })));
    const finalTags = [...existingTags, ...createdTags];
    await prisma.fileTag.deleteMany({ where: { fileId: file.id } });
    if (finalTags.length) await prisma.fileTag.createMany({ data: finalTags.map(t => ({ fileId: file.id, tagId: t.id })) });
    const updated = await prisma.file.findUnique({ where: { id: file.id }, include: { FileTag: { include: { Tag: true } } } });
    return res.json({ file: updated ? serializeFile(updated) : null });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Etiketler güncellenirken hata." });
  }
}

// POST /files/:id/toggle-hidden - Dosyayı gizle/göster
export async function toggleFileHidden(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const file = await prisma.file.findFirst({ where: { id, userId: req.userId, isDeleted: false } });
    if (!file) return res.status(404).json({ message: "Dosya bulunamadı." });
    
    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { isHidden: !file.isHidden }
    });
    
    return res.json({ file: serializeFile(updated), message: updated.isHidden ? "Dosya gizlendi" : "Dosya görünür yapıldı" });
  } catch (err) {
    console.error(err); 
    return res.status(500).json({ message: "Dosya durumu güncellenirken hata." });
  }
}

// GET /files/hidden - Gizli dosyaları ve klasörleri listele
export async function listHiddenFiles(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    const folderId = req.query.folderId as string | undefined;
    
    // Ana dizinde (folderId yok) tüm gizli dosyaları göster
    // Klasör içindeyse (folderId var) o klasördeki gizli dosyaları göster
    const fileWhere: any = { 
      userId: req.userId, 
      isDeleted: false, 
      isHidden: true 
    };
    
    if (folderId && folderId !== 'null' && folderId !== '') {
      // Belirli bir klasör içindeki gizli dosyaları göster
      fileWhere.folderId = folderId;
    }
    
    const files = await prisma.file.findMany({
      where: fileWhere,
      orderBy: { updatedAt: "desc" },
      include: { 
        FileTag: { include: { Tag: true } },
        Folder: true  // Klasör bilgisini de dahil et
      },
    });
    
    // Klasörler için parent kontrolü
    const folderWhere: any = {
      userId: req.userId, 
      isDeleted: false, 
      isHidden: true
    };
    
    if (folderId === undefined || folderId === 'null' || folderId === '') {
      // Ana dizinde sadece parent'ı olmayan klasörleri göster
      folderWhere.parentFolderId = null;
    } else {
      // Belirli klasörün alt klasörlerini göster
      folderWhere.parentFolderId = folderId;
    }
    
    const folders = await prisma.folder.findMany({
      where: folderWhere,
      orderBy: { updatedAt: "desc" }
    });
    
    // Her klasör için dosya sayısı ve toplam boyut hesapla
    const foldersWithStats = await Promise.all(
      folders.map(async (folder) => {
        const folderFiles = await prisma.file.findMany({
          where: { 
            folderId: folder.id, 
            isDeleted: false 
          },
          select: { sizeBytes: true }
        });
        
        const fileCount = folderFiles.length;
        const totalSize = folderFiles.reduce((sum, f) => sum + Number(f.sizeBytes), 0);
        
        return {
          ...folder,
          fileCount,
          totalSize
        };
      })
    );
    
    return res.json({ 
      files: files.map(serializeFile),
      folders: foldersWithStats 
    });
  } catch (err) {
    console.error(err); 
    return res.status(500).json({ message: "Gizli dosyalar alınırken hata." });
  }
}

// Hızlı Transfer - Geçici paylaşım linki oluşturma
export async function quickTransfer(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ error: "Yetkisiz." });
    
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Dosya gerekli." });
    
    const { 
      expiry = "24h", 
      downloadLimit, 
      password, 
      recipientEmail,
      recipientEmails, // Yeni: JSON array olarak birden fazla e-posta
      message, 
      customFileName,
      // Şifreleme parametreleri
      isEncrypted,
      cipherIv,
      originalMimeType,
      originalFileName
    } = req.body;
    
    // E-posta listesini parse et (recipientEmails varsa onu kullan, yoksa recipientEmail'i array'e çevir)
    let emailList: string[] = [];
    if (recipientEmails) {
      try {
        emailList = JSON.parse(recipientEmails);
      } catch {
        emailList = [];
      }
    } else if (recipientEmail && recipientEmail !== '') {
      emailList = [recipientEmail];
    }
    
    // Dosya adı ve mime type - şifreleme yok, doğrudan dosyayı kullan
    const actualFileName = file.originalname;
    const actualMimeType = file.mimetype;
    
    // Özel dosya adı varsa kullan, yoksa orijinal dosya adını kullan
    const displayFileName = customFileName && customFileName.trim() 
      ? customFileName.trim() 
      : actualFileName;
    
    // Geçerlilik süresini hesapla
    let expiresAt: Date;
    
    // ISO tarih formatı mı kontrol et (YYYY-MM-DDTHH:mm)
    if (expiry && expiry.includes('T') && expiry.includes('-')) {
      expiresAt = new Date(expiry);
      // Geçersiz tarih kontrolü
      if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        return res.status(400).json({ error: "Geçersiz veya geçmiş bir tarih seçtiniz." });
      }
    } else {
      // Önceden tanımlı süre seçenekleri
      let expiryMs = 24 * 60 * 60 * 1000; // default 24h
      if (expiry === "1h") expiryMs = 1 * 60 * 60 * 1000;
      else if (expiry === "6h") expiryMs = 6 * 60 * 60 * 1000;
      else if (expiry === "24h") expiryMs = 24 * 60 * 60 * 1000;
      else if (expiry === "3d") expiryMs = 3 * 24 * 60 * 60 * 1000;
      else if (expiry === "7d") expiryMs = 7 * 24 * 60 * 60 * 1000;
      
      expiresAt = new Date(Date.now() + expiryMs);
    }
    
    // Benzersiz storage key oluştur
    const ext = path.extname(file.originalname);
    const storageKey = `transfers/${req.userId}/${crypto.randomUUID()}${ext}`;
    
    // R2 yapılandırması var mı kontrol et
    const hasR2Config = process.env.R2_BUCKET_NAME && 
                        process.env.R2_ACCESS_KEY_ID && 
                        process.env.R2_SECRET_ACCESS_KEY &&
                        !process.env.R2_ACCESS_KEY_ID.includes('your_');
    
    if (hasR2Config) {
      // R2'ye yükle
      await uploadToR2(storageKey, file.buffer, file.mimetype);
    } else {
      // Local storage'a yükle
      const uploadDir = path.join(__dirname, "../../uploads/transfers", req.userId);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const localPath = path.join(uploadDir, path.basename(storageKey));
      fs.writeFileSync(localPath, file.buffer);
    }
    
    // Benzersiz token oluştur
    const shareToken = crypto.randomBytes(32).toString("hex");
    
    // downloadLimit'i parse et
    let parsedDownloadLimit: number | null = null;
    if (downloadLimit && downloadLimit !== '' && downloadLimit !== 'null') {
      const parsed = parseInt(downloadLimit);
      if (!isNaN(parsed) && parsed > 0) {
        parsedDownloadLimit = parsed;
      }
    }
    
    // E-postaları JSON string olarak sakla
    const recipientEmailsStr = emailList.length > 0 ? JSON.stringify(emailList) : null;
    
    console.log('[QuickTransfer] Creating transfer:', {
      userId: req.userId,
      fileName: displayFileName,
      mimeType: actualMimeType,
      sizeBytes: file.size,
      downloadLimit: parsedDownloadLimit,
      hasPassword: !!password,
      recipientCount: emailList.length,
      secureTransport: 'TLS/HTTPS'
    });
    
    // Transfer kaydı oluştur
    const transfer = await prisma.quickTransfer.create({
      data: {
        userId: req.userId,
        fileName: displayFileName,
        mimeType: actualMimeType,
        sizeBytes: BigInt(file.size),
        storageKey,
        shareToken,
        expiresAt,
        downloadLimit: parsedDownloadLimit,
        password: password && password !== '' ? password : null,
        downloadCount: 0,
        recipientEmail: recipientEmailsStr,
        message: message && message !== '' ? message : null,
        sendMethod: emailList.length > 0 ? "email" : "link",
        // TLS güvenliği ile transfer - şifreleme yok
        isEncrypted: false,
        cipherIv: null
      }
    });
    
    // Frontend URL oluştur
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const link = `${baseUrl}/transfer/${shareToken}`;
    
    // E-posta ile gönderim - tüm alıcılara gönder
    if (emailList.length > 0) {
      // Kullanıcı bilgisini al
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { name: true, email: true }
      });
      
      const senderName = user?.name || user?.email || "Bir CloudyOne kullanıcısı";
      
      // Dosya boyutunu formatla
      const formatSize = (bytes: number) => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
      };
      
      const expiresAtFormatted = expiresAt.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Her alıcıya ayrı e-posta gönder
      for (const email of emailList) {
        try {
          await sendTransferEmail(
            email,
            senderName,
            displayFileName,
            formatSize(file.size),
            link,
            expiresAtFormatted,
            message || undefined
          );
        } catch (emailErr) {
          console.error(`[QuickTransfer] E-posta gönderme hatası (${email}):`, emailErr);
        }
      }
    }
    
    return res.json({ 
      link,
      transferId: transfer.id,
      expiresAt: transfer.expiresAt,
      downloadLimit: transfer.downloadLimit
    });
  } catch (err) {
    console.error("[QuickTransfer] Error:", err);
    return res.status(500).json({ error: "Transfer başarısız." });
  }
}

// Hızlı Transfer indirme
export async function downloadQuickTransfer(req: Request, res: Response) {
  try {
    const { token } = req.params;
    const { password } = req.query;
    
    const transfer = await prisma.quickTransfer.findUnique({
      where: { shareToken: token }
    });
    
    if (!transfer) {
      return res.status(404).json({ error: "Transfer bulunamadı veya süresi dolmuş." });
    }
    
    // Süre kontrolü
    if (transfer.expiresAt < new Date()) {
      return res.status(410).json({ error: "Bu transfer linkinin süresi dolmuş." });
    }
    
    // İndirme limiti kontrolü
    if (transfer.downloadLimit && transfer.downloadCount >= transfer.downloadLimit) {
      return res.status(410).json({ error: "Bu transfer linkinin indirme limiti dolmuş." });
    }
    
    // Şifre kontrolü
    if (transfer.password && transfer.password !== password) {
      return res.status(403).json({ error: "Geçersiz şifre.", requirePassword: true });
    }
    
    // İndirme sayısını artır
    await prisma.quickTransfer.update({
      where: { id: transfer.id },
      data: { downloadCount: transfer.downloadCount + 1 }
    });
    
    // R2 yapılandırması var mı kontrol et
    const hasR2Config = process.env.R2_BUCKET_NAME && 
                        process.env.R2_ACCESS_KEY_ID && 
                        process.env.R2_SECRET_ACCESS_KEY &&
                        !process.env.R2_ACCESS_KEY_ID.includes('your_');
    
    if (hasR2Config) {
      // R2'den signed URL al
      const signedUrl = await getSignedUrlFromR2(transfer.storageKey, 3600);
      return res.json({
        downloadUrl: signedUrl,
        fileName: transfer.fileName,
        mimeType: transfer.mimeType,
        sizeBytes: Number(transfer.sizeBytes)
      });
    } else {
      // Local storage için backend üzerinden download URL oluştur
      const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`;
      const downloadUrl = `${backendUrl}/files/quick-transfer/${token}/file`;
      
      return res.json({
        downloadUrl,
        fileName: transfer.fileName,
        mimeType: transfer.mimeType,
        sizeBytes: Number(transfer.sizeBytes)
      });
    }
  } catch (err) {
    console.error("[QuickTransfer Download] Error:", err);
    return res.status(500).json({ error: "İndirme başarısız." });
  }
}

// Local storage dosya indirme (stream)
export async function downloadQuickTransferFile(req: Request, res: Response) {
  try {
    const { token } = req.params;
    
    const transfer = await prisma.quickTransfer.findUnique({
      where: { shareToken: token }
    });
    
    if (!transfer) {
      return res.status(404).json({ error: "Transfer bulunamadı." });
    }
    
    // Süre kontrolü
    if (transfer.expiresAt < new Date()) {
      return res.status(410).json({ error: "Bu transfer linkinin süresi dolmuş." });
    }
    
    const userId = transfer.storageKey.split('/')[1];
    const localPath = path.join(__dirname, "../../uploads/transfers", userId, path.basename(transfer.storageKey));
    
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({ error: "Dosya bulunamadı." });
    }
    
    res.setHeader('Content-Type', transfer.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(transfer.fileName)}"`);
    res.setHeader('Content-Length', Number(transfer.sizeBytes));
    
    const fileStream = fs.createReadStream(localPath);
    fileStream.pipe(res);
  } catch (err) {
    console.error("[QuickTransfer File] Error:", err);
    return res.status(500).json({ error: "İndirme başarısız." });
  }
}

export async function getQuickTransferInfo(req: Request, res: Response) {
  try {
    const { token } = req.params;
    
    console.log('[QuickTransfer Info] Token:', token);
    
    const transfer = await prisma.quickTransfer.findUnique({
      where: { shareToken: token }
    });
    
    console.log('[QuickTransfer Info] Transfer found:', !!transfer);
    
    if (!transfer) {
      return res.status(404).json({ error: "Transfer bulunamadı." });
    }
    
    // Süre kontrolü
    if (transfer.expiresAt < new Date()) {
      console.log('[QuickTransfer Info] Transfer expired');
      return res.status(410).json({ error: "Bu transfer linkinin süresi dolmuş." });
    }
    
    // İndirme limiti kontrolü
    if (transfer.downloadLimit && transfer.downloadCount >= transfer.downloadLimit) {
      console.log('[QuickTransfer Info] Download limit reached');
      return res.status(410).json({ error: "Bu transfer linkinin indirme limiti dolmuş." });
    }
    
    // Gönderici bilgilerini al (eğer userId varsa)
    let senderName = null;
    let senderEmail = null;
    
    if (transfer.userId) {
      const user = await prisma.user.findUnique({
        where: { id: transfer.userId },
        select: { name: true, email: true }
      });
      senderName = user?.name || null;
      senderEmail = user?.email || null;
    }
    
    console.log('[QuickTransfer Info] Returning transfer info, isEncrypted:', transfer.isEncrypted);
    
    return res.json({
      fileName: transfer.fileName,
      mimeType: transfer.mimeType,
      sizeBytes: Number(transfer.sizeBytes),
      expiresAt: transfer.expiresAt,
      requirePassword: !!transfer.password,
      downloadLimit: transfer.downloadLimit,
      downloadCount: transfer.downloadCount,
      // Şifreleme bilgileri
      isEncrypted: transfer.isEncrypted,
      cipherIv: transfer.cipherIv,
      // Gönderen bilgileri
      senderName: senderName,
      senderEmail: senderEmail
    });
  } catch (err) {
    console.error("[QuickTransfer Info] Error:", err);
    return res.status(500).json({ error: "Bilgi alınamadı." });
  }
}

// Kullanıcının transfer geçmişi
export async function listUserTransfers(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ error: "Yetkisiz." });
    
    const transfers = await prisma.quickTransfer.findMany({
      where: { 
        userId: req.userId,
        isDeleted: false // Silinmiş transferleri gösterme
      },
      orderBy: { createdAt: 'desc' },
      take: 50 // Son 50 transfer
    });
    
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const now = new Date();
    
    const formattedTransfers = transfers.map((t: any) => ({
      id: t.id,
      fileName: t.fileName,
      mimeType: t.mimeType,
      sizeBytes: Number(t.sizeBytes),
      link: `${baseUrl}/transfer/${t.shareToken}`,
      shareToken: t.shareToken,
      expiresAt: t.expiresAt,
      isExpired: t.expiresAt < now,
      downloadLimit: t.downloadLimit,
      downloadCount: t.downloadCount,
      hasPassword: !!t.password,
      sendMethod: t.sendMethod || "link",
      recipientEmail: t.recipientEmail || null,
      message: t.message || null,
      createdAt: t.createdAt
    }));
    
    return res.json({ transfers: formattedTransfers });
  } catch (err) {
    console.error("[ListUserTransfers] Error:", err);
    return res.status(500).json({ error: "Transfer geçmişi alınamadı." });
  }
}

// Transfer silme
export async function deleteTransfer(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ error: "Yetkisiz." });
    
    const { id } = req.params;
    
    const transfer = await prisma.quickTransfer.findFirst({
      where: { id, userId: req.userId }
    });
    
    if (!transfer) {
      return res.status(404).json({ error: "Transfer bulunamadı." });
    }
    
    // Dosyayı storage'dan sil
    const hasR2Config = process.env.R2_BUCKET_NAME && 
                        process.env.R2_ACCESS_KEY_ID && 
                        process.env.R2_SECRET_ACCESS_KEY &&
                        !process.env.R2_ACCESS_KEY_ID.includes('your_');
    
    if (hasR2Config) {
      try {
        await deleteFromR2(transfer.storageKey);
      } catch (e) {
        console.error("[DeleteTransfer] R2 delete error:", e);
      }
    } else {
      // Local storage'dan sil
      const userId = transfer.storageKey.split('/')[1];
      const localPath = path.join(__dirname, "../../uploads/transfers", userId, path.basename(transfer.storageKey));
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }
    
    // Veritabanından sil
    await prisma.quickTransfer.delete({
      where: { id }
    });
    
    return res.json({ success: true, message: "Transfer silindi." });
  } catch (err) {
    console.error("[DeleteTransfer] Error:", err);
    return res.status(500).json({ error: "Transfer silinemedi." });
  }
}

// Süresi dolmuş transferleri toplu silme
export async function deleteExpiredTransfers(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ error: "Yetkisiz." });
    
    const now = new Date();
    
    // Süresi dolmuş transferleri bul
    const expiredTransfers = await prisma.quickTransfer.findMany({
      where: { 
        userId: req.userId,
        expiresAt: { lt: now },
        isDeleted: false
      }
    });
    
    if (expiredTransfers.length === 0) {
      return res.json({ success: true, deletedCount: 0, message: "Süresi dolmuş transfer bulunamadı." });
    }
    
    const hasR2Config = process.env.R2_BUCKET_NAME && 
                        process.env.R2_ACCESS_KEY_ID && 
                        process.env.R2_SECRET_ACCESS_KEY &&
                        !process.env.R2_ACCESS_KEY_ID.includes('your_');
    
    // Her transfer için dosyayı sil
    for (const transfer of expiredTransfers) {
      try {
        if (hasR2Config) {
          await deleteFromR2(transfer.storageKey);
        } else {
          const userId = transfer.storageKey.split('/')[1];
          const localPath = path.join(__dirname, "../../uploads/transfers", userId, path.basename(transfer.storageKey));
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }
        }
      } catch (e) {
        console.error("[DeleteExpiredTransfers] Storage delete error for:", transfer.id, e);
      }
    }
    
    // Veritabanından toplu sil
    const result = await prisma.quickTransfer.deleteMany({
      where: { 
        userId: req.userId,
        expiresAt: { lt: now },
        isDeleted: false
      }
    });
    
    return res.json({ 
      success: true, 
      deletedCount: result.count, 
      message: `${result.count} süresi dolmuş transfer silindi.` 
    });
  } catch (err) {
    console.error("[DeleteExpiredTransfers] Error:", err);
    return res.status(500).json({ error: "Süresi dolmuş transferler silinemedi." });
  }
}

// Quick Transfer dosyasını hesaba kaydet
export async function saveTransferToAccount(req: AuthRequest, res: Response) {
  try {
    const { token } = req.params;
    const { password, folderId } = req.body;
    
    if (!req.userId) {
      return res.status(401).json({ error: "Oturum açmanız gerekiyor." });
    }
    
    // Transfer'i bul
    const transfer = await prisma.quickTransfer.findUnique({
      where: { shareToken: token },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });
    
    if (!transfer) {
      return res.status(404).json({ error: "Transfer bulunamadı." });
    }
    
    // Süre kontrolü
    if (transfer.expiresAt < new Date()) {
      return res.status(410).json({ error: "Bu transfer linkinin süresi dolmuş." });
    }
    
    // İndirme limiti kontrolü
    if (transfer.downloadLimit && transfer.downloadCount >= transfer.downloadLimit) {
      return res.status(410).json({ error: "Bu transfer linkinin indirme limiti dolmuş." });
    }
    
    // Şifre kontrolü
    if (transfer.password && transfer.password !== password) {
      return res.status(403).json({ error: "Geçersiz şifre.", requirePassword: true });
    }
    
    // Hedef folder kontrolü
    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId: req.userId }
      });
      if (!folder) {
        return res.status(404).json({ error: "Hedef klasör bulunamadı." });
      }
    }
    
    // Dosyayı R2/Local'den kopyala
    const hasR2Config = process.env.R2_BUCKET_NAME && 
                        process.env.R2_ACCESS_KEY_ID && 
                        process.env.R2_SECRET_ACCESS_KEY &&
                        !process.env.R2_ACCESS_KEY_ID.includes('your_');
    
    let newStorageKey: string;
    const newFileId = crypto.randomUUID();
    
    if (hasR2Config) {
      // R2'den kopyala
      newStorageKey = `files/${req.userId}/${newFileId}_${transfer.fileName}`;
      await copyInR2(transfer.storageKey, newStorageKey);
    } else {
      // Local storage'da kopyala
      const sourceUserId = transfer.storageKey.split('/')[1];
      const sourcePath = path.join(__dirname, "../../uploads/transfers", sourceUserId, path.basename(transfer.storageKey));
      const destDir = path.join(__dirname, "../../uploads", req.userId);
      
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      const destPath = path.join(destDir, `${newFileId}_${transfer.fileName}`);
      fs.copyFileSync(sourcePath, destPath);
      newStorageKey = `files/${req.userId}/${newFileId}_${transfer.fileName}`;
    }
    
    // Gönderen bilgilerini al
    const senderName = transfer.user?.name || null;
    const senderEmail = transfer.user?.email || null;
    
    // Yeni dosya kaydı oluştur
    const newFile = await prisma.file.create({
      data: {
        id: newFileId,
        userId: req.userId,
        folderId: folderId || null,
        filename: transfer.fileName,
        mimeType: transfer.mimeType || 'application/octet-stream',
        sizeBytes: transfer.sizeBytes,
        storageKey: newStorageKey,
        storagePath: newStorageKey,
        updatedAt: new Date(),
        encryptionState: transfer.isEncrypted ? 'ENCRYPTED' : 'PLAINTEXT',
        isEncrypted: transfer.isEncrypted || false,
        cipherIv: transfer.cipherIv,
        // Gönderen bilgileri
        receivedFromName: senderName,
        receivedFromEmail: senderEmail,
        receivedAt: new Date()
      }
    });
    
    // İndirme sayısını artır
    await prisma.quickTransfer.update({
      where: { id: transfer.id },
      data: { downloadCount: transfer.downloadCount + 1 }
    });
    
    return res.json({
      success: true,
      file: {
        id: newFile.id,
        filename: newFile.filename,
        mimeType: newFile.mimeType,
        sizeBytes: Number(newFile.sizeBytes),
        receivedFromName: newFile.receivedFromName,
        receivedFromEmail: newFile.receivedFromEmail,
        receivedAt: newFile.receivedAt
      },
      message: "Dosya hesabınıza kaydedildi."
    });
  } catch (err) {
    console.error("[SaveTransferToAccount] Error:", err);
    return res.status(500).json({ error: "Dosya kaydedilemedi." });
  }
}
