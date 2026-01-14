import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../utils/prisma";
import { recalculateUserStorage, applyPlan, PLAN_DEFINITIONS, PlanKey } from "../utils/storage";
import { sendEmailVerificationEmail } from "../utils/email";
import crypto from "crypto";

const router = Router();

// GET /account/storage
router.get("/storage", requireAuth, async (req: any, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    
    // Tüm dosyaları al (isDeleted=false, gizli dosyalar dahil, ekip dosyaları hariç)
    const allFiles = await prisma.file.findMany({
      where: { userId: req.userId, isDeleted: false, teamId: null },
      select: { filename: true, originalName: true, extension: true, sizeBytes: true, isHidden: true }
    });
    
    // Kategori bazlı hesaplamalar
    const categoryBytes = {
      image: 0,
      media: 0,
      document: 0,
      other: 0
    };
    
    const categoryCounts = {
      image: 0,
      media: 0,
      document: 0,
      other: 0
    };
    
    let hiddenFilesCount = 0;
    let hiddenFilesBytes = 0;
    
    allFiles.forEach((file) => {
      // originalName varsa ve "encrypted" değilse onu kullan, yoksa extension'dan tahmin et
      let nameForExt = file.originalName;
      if (!nameForExt || nameForExt === 'encrypted') {
        if (file.extension) {
          nameForExt = `file.${file.extension}`;
        } else {
          nameForExt = file.filename;
        }
      }
      
      const ext = nameForExt.split('.').pop()?.toLowerCase() || '';
      const size = Number(file.sizeBytes || 0);
      
      // Gizli dosyaları say (ayrı istatistik için)
      if (file.isHidden) {
        hiddenFilesCount += 1;
        hiddenFilesBytes += size;
        // Gizli dosyalar kategorilere DAHIL EDİLMEZ - sadece ayrı sayılır
        return;
      }
      
      // Sadece gizli OLMAYAN dosyaları kategorilere ayır
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'tiff'].includes(ext)) {
        categoryBytes.image += size;
        categoryCounts.image += 1;
      }
      else if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext)) {
        categoryBytes.media += size;
        categoryCounts.media += 1;
      }
      else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods', 'zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
        categoryBytes.document += size;
        categoryCounts.document += 1;
      }
      else {
        categoryBytes.other += size;
        categoryCounts.other += 1;
      }
    });
    
    // Yüzdeler frontend de hesaplayabilir; yine de döndürelim
    const activePct = Number(user.storageLimitBytes) ? Math.min(100, Math.round(Number(user.usedStorageBytes) / Number(user.storageLimitBytes) * 100)) : 0;
    const trashPct = Number(user.trashLimitBytes) ? Math.min(100, Math.round(Number(user.trashStorageBytes) / Number(user.trashLimitBytes) * 100)) : 0;
    
    console.log("[Storage Debug] Total files:", allFiles.length);
    console.log("[Storage Debug] Category bytes:", categoryBytes);
    console.log("[Storage Debug] Hidden:", { count: hiddenFilesCount, bytes: hiddenFilesBytes });
    console.log("[Storage Debug] Used storage:", Number(user.usedStorageBytes), "Limit:", Number(user.storageLimitBytes));
    
    return res.json({
      plan: user.plan,
      storageLimitBytes: Number(user.storageLimitBytes),
      trashLimitBytes: Number(user.trashLimitBytes),
      usedStorageBytes: Number(user.usedStorageBytes),
      trashStorageBytes: Number(user.trashStorageBytes),
      percentActive: activePct,
      percentTrash: trashPct,
      categoryBytes,
      categoryCounts,
      hiddenFilesCount,
      hiddenFilesBytes
    });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Depolama bilgisi alınırken hata." });
  }
});

// POST /account/plan { plan }
router.post("/plan", requireAuth, async (req: any, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { plan } = req.body || {};
    if (!plan || !PLAN_DEFINITIONS[plan as PlanKey]) return res.status(400).json({ message: "Geçersiz plan." });
    const updated = await applyPlan(req.userId, plan as PlanKey);
    return res.json({
      message: "Plan güncellendi.",
      plan: updated.plan,
      storageLimitBytes: Number(updated.storageLimitBytes),
      trashLimitBytes: Number(updated.trashLimitBytes),
      usedStorageBytes: Number(updated.usedStorageBytes),
      trashStorageBytes: Number(updated.trashStorageBytes),
    });
  } catch (err) {
    console.error(err); return res.status(500).json({ message: "Plan güncellenirken hata." });
  }
});

// GET /account/activities - Get user activities from activity log and file operations
router.get("/activities", requireAuth, async (req: any, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    // Son 30 gündeki aktiviteleri çek
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Activity tablosundan kullanıcı aktivitelerini al
    const activities = await prisma.activity.findMany({
      where: {
        userId: req.userId,
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // Maksimum 20 etkinlik
      select: {
        id: true,
        type: true,
        createdAt: true,
        fileName: true,
        metadata: true,
        isRead: true,
      }
    });

    // Dosya paylaşım loglarını al
    const shareLogsRaw = await prisma.fileShareLog.findMany({
      where: {
        File: { userId: req.userId },
        openedAt: { gte: thirtyDaysAgo }
      },
      orderBy: { openedAt: 'desc' },
      take: 20,
      include: { File: { select: { filename: true } } }
    });
    
    // Activity type'larını Türkçe açıklamalara çevir
    const activityTypeMap: Record<string, string> = {
      'FILE_UPLOAD': 'Dosya yüklendi',
      'FILE_DELETE': 'Dosya silindi',
      'FILE_SHARE': 'Dosya paylaşıldı',
      'FILE_DOWNLOAD': 'Dosya indirildi',
      'FILE_MOVE': 'Dosya taşındı',
      'FOLDER_CREATE': 'Klasör oluşturuldu',
      'FOLDER_DELETE': 'Klasör silindi',
      'LOGIN': 'Giriş yapıldı',
      'LOGOUT': 'Çıkış yapıldı',
      'FILE_REQUEST_CREATED': 'Dosya isteği oluşturuldu',
      'FILE_REQUEST_EXPIRED': 'Dosya isteğinin süresi doldu',
      'FILE_REQUEST_UPLOAD': 'Dosya isteğine yükleme yapıldı',
      'TEAM_FILE_UPLOAD': 'Ekibe dosya yüklendi',
      'TEAM_FILE_DELETE': 'Ekip dosyası silindi',
      'TEAM_FOLDER_CREATE': 'Ekip klasörü oluşturuldu',
      'TEAM_FOLDER_DELETE': 'Ekip klasörü silindi',
      'TEAM_FILE_COMMENT': 'Ekip dosyasına yorum yapıldı',
      'TEAM_FILE_DOWNLOAD': 'Ekip dosyası indirildi',
      'TEAM_MEMBER_JOINED': 'Ekibe yeni üye katıldı',
      'TEAM_MEMBER_LEFT': 'Üye ekipten ayrıldı',
      'TEAM_INVITE_SENT': 'Ekip daveti gönderildi',
      'OTHER': 'Diğer işlem',
    };

    // Activity'leri formatla
    const formattedActivities = activities.map(activity => {
      let metadata: Record<string, any> = {};
      try {
        metadata = activity.metadata ? JSON.parse(activity.metadata) : {};
      } catch {}
      
      return {
        id: activity.id.toString(),
        type: activity.type.toLowerCase(),
        description: activityTypeMap[activity.type] || activity.type,
        fileName: activity.fileName || null,
        details: metadata.details || null,
        createdAt: activity.createdAt.toISOString(),
        ipAddress: metadata.ipAddress || null,
        isRead: activity.isRead,
      };
    });

    // Paylaşım açma loglarını ekle
    const shareLogs = shareLogsRaw.map(log => ({
      id: `share-${log.id}`,
      type: 'share_view',
      description: 'Paylaşılan dosya görüntülendi',
      fileName: log.File?.filename || null,
      details: log.ipAddress ? `IP: ${log.ipAddress}` : null,
      createdAt: log.openedAt.toISOString(),
      ipAddress: log.ipAddress,
      isRead: true,
    }));

    // Tüm aktiviteleri birleştir ve tarihe göre sırala
    const allActivities = [...formattedActivities, ...shareLogs]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    return res.json({ activities: allActivities });
  } catch (err) {
    console.error("Activities error:", err);
    return res.status(500).json({ message: "Etkinlikler alınırken hata." });
  }
});

// DELETE /account/activities - Clear all user activities
router.delete("/activities", requireAuth, async (req: any, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    // Kullanıcının tüm aktivitelerini sil
    await prisma.activity.deleteMany({
      where: { userId: req.userId }
    });

    return res.json({ message: "Tüm etkinlikler temizlendi." });
  } catch (err) {
    console.error("Clear activities error:", err);
    return res.status(500).json({ message: "Etkinlikler temizlenirken hata." });
  }
});

// POST /account/resend-verification - Resend email verification
router.post("/resend-verification", requireAuth, async (req: any, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    
    if (user.emailVerified) {
      return res.status(400).json({ message: "E-posta zaten doğrulanmış." });
    }
    
    // Yeni doğrulama token'ı oluştur ve veritabanına kaydet
    const verificationToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: verificationToken }
    });
    
    // E-posta gönder
    await sendEmailVerificationEmail(user.email, verificationToken);
    
    return res.json({ message: "Doğrulama e-postası gönderildi." });
  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ message: "E-posta gönderilemedi." });
  }
});

// GET /account/verify-email/:token - E-posta doğrulama
router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token }
    });
    
    if (!user) {
      return res.status(404).json({ message: "Geçersiz veya süresi dolmuş doğrulama linki." });
    }
    
    // E-postayı doğrulanmış olarak işaretle ve token'ı sil
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null
      }
    });
    
    return res.json({ message: "E-posta başarıyla doğrulandı!", email: user.email });
  } catch (err) {
    console.error("Email verification error:", err);
    return res.status(500).json({ message: "E-posta doğrulanırken bir hata oluştu." });
  }
});

// DELETE /account/delete - Hesabı kalıcı olarak sil
router.delete("/delete", requireAuth, async (req: any, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ message: "Şifre gerekli." });
    }
    
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    
    // Şifreyi doğrula
    const bcrypt = require('bcryptjs');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Şifre yanlış." });
    }
    
    // Kullanıcının tüm verilerini sil
    // 1. Dosya paylaşım logları
    await prisma.fileShareLog.deleteMany({
      where: { File: { userId: req.userId } }
    });
    
    // 2. Dosya sürümleri
    await prisma.fileVersion.deleteMany({
      where: { File: { userId: req.userId } }
    });
    
    // 3. Dosyalar
    await prisma.file.deleteMany({
      where: { userId: req.userId }
    });
    
    // 4. Klasörler
    await prisma.folder.deleteMany({
      where: { userId: req.userId }
    });
    
    // 5. Aktiviteler
    await prisma.activity.deleteMany({
      where: { userId: req.userId }
    });
    
    // 6. Dosya istekleri
    await prisma.fileRequest.deleteMany({
      where: { userId: req.userId }
    });
    
    // 7. Transferler
    await prisma.quickTransfer.deleteMany({
      where: { userId: req.userId }
    });
    
    // 8. Takım üyelikleri
    await prisma.teamMember.deleteMany({
      where: { userId: req.userId }
    });
    
    // 9. Refresh tokenlar
    await prisma.refreshToken.deleteMany({
      where: { userId: req.userId }
    });
    
    // 10. Kullanıcıyı sil
    await prisma.user.delete({
      where: { id: req.userId }
    });
    
    return res.json({ message: "Hesabınız başarıyla silindi." });
  } catch (err) {
    console.error("Delete account error:", err);
    return res.status(500).json({ message: "Hesap silinirken hata oluştu." });
  }
});

export default router;