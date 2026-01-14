import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

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
  'TEAM_FILE_COMMENT': 'Dosyaya yorum yapıldı',
  'TEAM_FILE_DOWNLOAD': 'Ekip dosyası indirildi',
  'TEAM_MEMBER_JOINED': 'Ekibe yeni üye katıldı',
  'TEAM_MEMBER_LEFT': 'Üye ekipten ayrıldı',
  'TEAM_INVITE_SENT': 'Ekip daveti gönderildi',
  'OTHER': 'Diğer işlem',
};

// Kullanıcının etkinliklerini getir
export const getActivities = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { limit = 20, offset = 0, unreadOnly = false } = req.query;

    const whereClause: any = { userId };
    if (unreadOnly === 'true') {
      whereClause.isRead = false;
    }

    const activities = await prisma.activity.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    const totalCount = await prisma.activity.count({ where: whereClause });
    const unreadCount = await prisma.activity.count({
      where: { userId, isRead: false },
    });

    // Activity'leri formatla
    const formattedActivities = activities.map(activity => {
      let metadata: Record<string, any> = {};
      try {
        metadata = activity.metadata ? JSON.parse(activity.metadata) : {};
      } catch {}

      // Açıklama oluştur
      let description = activityTypeMap[activity.type] || activity.type;
      if (activity.actorName) {
        description = `${activity.actorName}: ${description}`;
      }
      if (activity.fileName) {
        description += ` - ${activity.fileName}`;
      } else if (activity.folderName) {
        description += ` - ${activity.folderName}`;
      }

      return {
        id: activity.id,
        type: activity.type.toLowerCase(),
        description,
        fileName: activity.fileName,
        folderName: activity.folderName,
        actorName: activity.actorName,
        teamName: metadata.teamName || null,
        createdAt: activity.createdAt.toISOString(),
        isRead: activity.isRead,
        metadata
      };
    });

    res.json({
      activities: formattedActivities,
      totalCount,
      unreadCount,
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Etkinlikler getirilirken bir hata oluştu' });
  }
};

// Etkinliği okundu olarak işaretle
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { activityId } = req.params;

    const activity = await prisma.activity.updateMany({
      where: { id: activityId, userId },
      data: { isRead: true },
    });

    if (activity.count === 0) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Etkinlik işaretlenirken bir hata oluştu' });
  }
};

// Tüm etkinlikleri okundu olarak işaretle
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    await prisma.activity.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Etkinlikler işaretlenirken bir hata oluştu' });
  }
};

// Yeni etkinlik oluştur (internal kullanım için)
export const createActivity = async (params: {
  userId: string;
  type: string;
  fileId?: string;
  fileName?: string;
  folderId?: string;
  folderName?: string;
  actorId?: string;
  actorName?: string;
  metadata?: any;
}) => {
  try {
    const activity = await prisma.activity.create({
      data: {
        userId: params.userId,
        type: params.type as any,
        fileId: params.fileId,
        fileName: params.fileName,
        folderId: params.folderId,
        folderName: params.folderName,
        actorId: params.actorId,
        actorName: params.actorName,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        isRead: false,
      },
    });

    // Maksimum 20 etkinlik tutulacak, fazlasını sil
    await cleanupOldActivities(params.userId, 20);

    return activity;
  } catch (error) {
    console.error('Create activity error:', error);
    return null;
  }
};

// Eski etkinlikleri temizle - maksimum sayıyı aşanları sil
export const cleanupOldActivities = async (userId: string, maxCount: number = 20) => {
  try {
    // Kullanıcının toplam etkinlik sayısını al
    const totalCount = await prisma.activity.count({ where: { userId } });

    if (totalCount > maxCount) {
      // Silinecek etkinlikleri bul (en eski olanları)
      const activitiesToDelete = await prisma.activity.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: totalCount - maxCount,
        select: { id: true }
      });

      if (activitiesToDelete.length > 0) {
        await prisma.activity.deleteMany({
          where: {
            id: { in: activitiesToDelete.map(a => a.id) }
          }
        });
        console.log(`Cleaned up ${activitiesToDelete.length} old activities for user ${userId}`);
      }
    }
  } catch (error) {
    console.error('Cleanup activities error:', error);
  }
};

// Etkinlikleri sil (opsiyonel - temizlik için)
export const deleteOldActivities = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { daysOld = 30 } = req.query;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld as string));

    const deleted = await prisma.activity.deleteMany({
      where: {
        userId,
        createdAt: { lt: cutoffDate },
      },
    });

    res.json({ 
      success: true, 
      deletedCount: deleted.count 
    });
  } catch (error) {
    console.error('Delete old activities error:', error);
    res.status(500).json({ error: 'Etkinlikler silinirken bir hata oluştu' });
  }
};

// Tek etkinliği sil
export const deleteActivity = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { activityId } = req.params;

    const deleted = await prisma.activity.deleteMany({
      where: { id: activityId, userId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Etkinlik bulunamadı' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ error: 'Etkinlik silinirken bir hata oluştu' });
  }
};
