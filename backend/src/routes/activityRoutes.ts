import { Router } from 'express';
import { getActivities, markAsRead, markAllAsRead, deleteOldActivities, deleteActivity } from '../controllers/activityController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Tüm route'lar authentication gerektirir
router.use(requireAuth as any);

// Etkinlikleri getir
router.get('/', getActivities);

// Tek etkinliği okundu olarak işaretle
router.patch('/:activityId/read', markAsRead);

// Tüm etkinlikleri okundu olarak işaretle
router.patch('/read-all', markAllAsRead);

// Tek etkinliği sil
router.delete('/:activityId', deleteActivity);

// Eski etkinlikleri sil
router.delete('/old', deleteOldActivities);

export default router;
