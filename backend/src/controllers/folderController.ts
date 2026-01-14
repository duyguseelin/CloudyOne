import { Response } from "express";
import { prisma } from "../utils/prisma";
import type { AuthRequest } from "../middleware/auth";
import { recalculateUserStorage } from "../utils/storage";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import * as syncEvents from "../lib/syncEvents";

// POST /folders
export async function createFolder(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { name, parentId, isHidden } = req.body || {};
    if (!name) return res.status(400).json({ message: "Klasör adı gerekli." });
    if (parentId) {
      const parent = await prisma.folder.findFirst({ where: { id: parentId, userId: req.userId } });
      if (!parent) return res.status(404).json({ message: "Üst klasör bulunamadı." });
    }
    const folder = await prisma.folder.create({
      data: {
        id: crypto.randomUUID(),
        name: String(name).trim(),
        userId: req.userId,
        parentFolderId: parentId || null,
        isHidden: isHidden === true, // Gizli bölümden oluşturulursa true
        updatedAt: new Date(),
      },
    });
    
    // WebSocket ile diğer cihazlara bildir
    syncEvents.notifyFolderCreated(req.userId, folder);
    
    return res.status(201).json({ folder });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Klasör oluşturulurken hata." });
  }
}

// PUT /folders/:id
export async function updateFolder(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { name, parentId } = req.body || {};
    const folder = await prisma.folder.findFirst({ where: { id, userId: req.userId } });
    if (!folder) return res.status(404).json({ message: "Klasör bulunamadı." });
    if (parentId) {
      const parent = await prisma.folder.findFirst({ where: { id: parentId, userId: req.userId } });
      if (!parent) return res.status(404).json({ message: "Yeni üst klasör bulunamadı." });
    }
    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: {
        name: name ? String(name).trim() : folder.name,
        parentFolderId: parentId === undefined ? folder.parentFolderId : (parentId || null),
      },
    });
    
    // WebSocket ile diğer cihazlara bildir
    if (name !== undefined) {
      syncEvents.notifyFolderRenamed(req.userId, folder.id, updated.name);
    }
    
    return res.json({ folder: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Klasör güncellenirken hata." });
  }
}

// DELETE /folders/:id (recursive soft delete - çöp kutusuna taşı)
export async function deleteFolder(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const folder = await prisma.folder.findFirst({ where: { id, userId: req.userId, isDeleted: false } });
    if (!folder) return res.status(404).json({ message: "Klasör bulunamadı." });

    // BFS ile alt klasörleri topla
    const queue: string[] = [folder.id];
    const allFolderIds: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      allFolderIds.push(current);
      const children = await prisma.folder.findMany({ 
        where: { parentFolderId: current, userId: req.userId, isDeleted: false }, 
        select: { id: true } 
      });
      for (const c of children) queue.push(c.id);
    }

    // İlgili tüm dosyaları bul (silinmemiş)
    const files = await prisma.file.findMany({ 
      where: { folderId: { in: allFolderIds }, userId: req.userId, isDeleted: false } 
    });

    // Soft delete: klasörleri ve dosyaları isDeleted=true yap
    const now = new Date();
    await prisma.$transaction([
      // Tüm dosyaları soft delete
      prisma.file.updateMany({ 
        where: { id: { in: files.map((f) => f.id) } }, 
        data: { isDeleted: true, deletedAt: now } 
      }),
      // Tüm klasörleri soft delete
      prisma.folder.updateMany({ 
        where: { id: { in: allFolderIds } }, 
        data: { isDeleted: true, updatedAt: now } 
      }),
    ]);

    // WebSocket ile diğer cihazlara bildir
    syncEvents.notifyFolderDeleted(req.userId, folder.id, folder.parentFolderId);

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    return res.json({ 
      message: "Klasör çöp kutusuna taşındı.", 
      usage: user ? { 
        usedStorageBytes: Number(user.usedStorageBytes ?? BigInt(0)), 
        storageLimitBytes: Number(user.storageLimitBytes ?? BigInt(0)) 
      } : null 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Klasör silinirken hata." });
  }
}

// POST /folders/:id/restore - Klasörü çöp kutusundan geri yükle
export async function restoreFolder(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const folder = await prisma.folder.findFirst({ 
      where: { id, userId: req.userId, isDeleted: true } 
    });
    if (!folder) return res.status(404).json({ message: "Silinmiş klasör bulunamadı." });

    // BFS ile alt klasörleri topla
    const queue: string[] = [folder.id];
    const allFolderIds: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      allFolderIds.push(current);
      const children = await prisma.folder.findMany({ 
        where: { parentFolderId: current, userId: req.userId, isDeleted: true }, 
        select: { id: true } 
      });
      for (const c of children) queue.push(c.id);
    }

    // İlgili tüm dosyaları bul
    const files = await prisma.file.findMany({ 
      where: { folderId: { in: allFolderIds }, userId: req.userId, isDeleted: true } 
    });

    // Geri yükle: klasörleri ve dosyaları isDeleted=false yap
    await prisma.$transaction([
      // Tüm dosyaları geri yükle
      prisma.file.updateMany({ 
        where: { id: { in: files.map((f) => f.id) } }, 
        data: { isDeleted: false, deletedAt: null } 
      }),
      // Tüm klasörleri geri yükle
      prisma.folder.updateMany({ 
        where: { id: { in: allFolderIds } }, 
        data: { isDeleted: false, updatedAt: new Date() } 
      }),
    ]);

    return res.json({ message: "Klasör geri yüklendi." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Klasör geri yüklenirken hata." });
  }
}

// DELETE /folders/:id/permanent - Klasörü ve içeriğini kalıcı olarak sil
export async function permanentDeleteFolder(req: AuthRequest, res: Response) {
  try {
    console.log("[permanentDeleteFolder] Start", { userId: req.userId, folderId: req.params.id });
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const folder = await prisma.folder.findFirst({ 
      where: { id, userId: req.userId, isDeleted: true } 
    });
    console.log("[permanentDeleteFolder] Folder query result:", folder ? { id: folder.id, name: folder.name, isDeleted: folder.isDeleted } : "not found");
    if (!folder) return res.status(404).json({ message: "Silinmiş klasör bulunamadı." });

    // BFS ile alt klasörleri topla
    const queue: string[] = [folder.id];
    const allFolderIds: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      allFolderIds.push(current);
      const children = await prisma.folder.findMany({ 
        where: { parentFolderId: current, userId: req.userId, isDeleted: true }, 
        select: { id: true } 
      });
      for (const c of children) queue.push(c.id);
    }

    // İlgili tüm dosyaları bul
    const files = await prisma.file.findMany({ 
      where: { folderId: { in: allFolderIds }, userId: req.userId, isDeleted: true },
      include: { FileVersion: true }
    });

    // R2'den dosyaları sil
    for (const f of files) {
      const key = (f as any).storageKey || f.storagePath;
      if (key) {
        try { 
          const { deleteObject } = await import("../lib/r2");
          await deleteObject(key); 
        } catch (e) { 
          console.warn("R2 delete failed (continuing)", { key }); 
        }
      }
      // Versiyonları da sil
      for (const v of f.FileVersion) {
        const vkey = (v as any).storageKey || v.storagePath;
        if (vkey) {
          try { 
            const { deleteObject } = await import("../lib/r2");
            await deleteObject(vkey); 
          } catch (e) { 
            console.warn("R2 version delete failed (continuing)", { vkey }); 
          }
        }
      }
    }

    // Veritabanından kalıcı olarak sil
    await prisma.$transaction([
      // Dosya versiyonlarını sil
      prisma.fileVersion.deleteMany({ 
        where: { fileId: { in: files.map(f => f.id) } } 
      }),
      // Dosyaları sil
      prisma.file.deleteMany({ 
        where: { id: { in: files.map(f => f.id) } } 
      }),
      // Klasörleri sil
      prisma.folder.deleteMany({ 
        where: { id: { in: allFolderIds } } 
      }),
    ]);

    // Storage'ı yeniden hesapla
    await recalculateUserStorage(req.userId);

    return res.json({ message: "Klasör kalıcı olarak silindi." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Klasör kalıcı silinirken hata." });
  }
}

// POST /folders/:id/toggle-hidden - Klasörü gizle/göster
export async function toggleFolderHidden(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const folder = await prisma.folder.findFirst({ where: { id, userId: req.userId } });
    if (!folder) return res.status(404).json({ message: "Klasör bulunamadı." });
    
    const newHiddenState = !folder.isHidden;
    
    // Klasörü güncelle
    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: { isHidden: newHiddenState }
    });
    
    // Klasör içindeki tüm dosyaları da aynı duruma getir
    await prisma.file.updateMany({
      where: { folderId: folder.id, userId: req.userId },
      data: { isHidden: newHiddenState }
    });
    
    return res.json({ folder: updated, message: updated.isHidden ? "Klasör ve içindeki dosyalar gizlendi" : "Klasör ve içindeki dosyalar görünür yapıldı" });
  } catch (err) {
    console.error(err); 
    return res.status(500).json({ message: "Klasör durumu güncellenirken hata." });
  }
}

// POST /folders/:id/toggle-favorite - Klasörü favorilere ekle/çıkar
export async function toggleFolderFavorite(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const folder = await prisma.folder.findFirst({ where: { id, userId: req.userId, isDeleted: false } });
    if (!folder) return res.status(404).json({ message: "Klasör bulunamadı." });
    
    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: { isFavorite: !folder.isFavorite }
    });
    
    return res.json({ folder: updated, message: updated.isFavorite ? "Klasör favorilere eklendi" : "Klasör favorilerden çıkarıldı" });
  } catch (err) {
    console.error(err); 
    return res.status(500).json({ message: "Favori durumu güncellenirken hata." });
  }
}

// POST /folders/:id/share - Klasördeki dosyaları paylaş
export async function shareFolder(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { id } = req.params;
    const { expiresIn, permission } = req.body || {};
    
    // Klasörü kontrol et
    const folder = await prisma.folder.findFirst({ 
      where: { id, userId: req.userId, isDeleted: false } 
    });
    if (!folder) return res.status(404).json({ message: "Klasör bulunamadı." });
    
    // Klasördeki dosyaları al (sadece bu klasördeki, alt klasörler hariç)
    const files = await prisma.file.findMany({
      where: { 
        folderId: folder.id, 
        userId: req.userId, 
        isDeleted: false,
        isHidden: false 
      }
    });
    
    if (files.length === 0) {
      return res.status(400).json({ message: "Klasörde paylaşılacak dosya yok." });
    }
    
    // Süre hesaplama
    let expiresAt: Date | null = null;
    if (expiresIn) {
      const now = new Date();
      if (expiresIn === "1h") expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      else if (expiresIn === "1d") expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      else if (expiresIn === "7d") expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      else if (expiresIn === "30d") expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    
    // İzin kontrolü
    const sharePermission = permission === "VIEW" ? "VIEW" : "DOWNLOAD";
    
    // Her dosya için paylaşım token'ı oluştur
    const shareToken = crypto.randomBytes(16).toString("hex");
    
    // Dosyaları güncelle
    await prisma.file.updateMany({
      where: { 
        id: { in: files.map(f => f.id) } 
      },
      data: {
        shareToken,
        sharePermission,
        shareExpiresAt: expiresAt,
        shareOpenCount: 0,
      }
    });
    
    // Paylaşım linkini oluştur
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/shared/${shareToken}`;
    
    return res.json({ 
      shareUrl,
      shareToken,
      expiresAt,
      permission: sharePermission,
      fileCount: files.length,
      message: `${files.length} dosya paylaşıldı`
    });
  } catch (err) {
    console.error(err); 
    return res.status(500).json({ message: "Klasör paylaşılırken hata." });
  }
}
