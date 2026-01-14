import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireAdmin";
import { rateLimitAdmin } from "../middleware/rateLimiter";
import { adminIpWhitelist, enforceAdmin2FA, adminSessionTimeout } from "../middleware/adminSecurity";
import { prisma } from "../utils/prisma";
import { revokeUserSessions, listUserActiveSessions } from "../controllers/adminController";

const router = Router();

// Tüm admin route'ları auth + admin kontrolünden geçsin + güvenlik katmanları
router.use(requireAuth);
router.use(adminIpWhitelist); // IP whitelist kontrolü (production'da)
router.use(enforceAdmin2FA); // 2FA zorunluluğu (production'da)
router.use(requireAdmin);
router.use(rateLimitAdmin); // FAZ 5: 20 req / 10min
router.use(adminSessionTimeout); // Session timeout header

/**
 * GET /api/admin/health
 * Admin endpoint health check
 */
router.get("/health", (_req: AuthRequest, res: Response) => {
  res.json({ 
    ok: true, 
    admin: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/admin/users
 * Tüm kullanıcıları listele (sensitive bilgiler hariç)
 */
router.get("/users", async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        createdAt: true,
        twoFactorEnabled: true,
        // passwordHash ve twoFactorSecret gizli
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({ users, count: users.length });
  } catch (error) {
    console.error("Admin users list error:", error);
    res.status(500).json({ message: "Kullanıcılar alınırken hata oluştu" });
  }
});

/**
 * POST /api/admin/users/:userId/role
 * Kullanıcının rolünü değiştir
 */
router.post("/users/:userId/role", async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !["user", "admin"].includes(role)) {
      return res.status(400).json({ message: "Geçersiz rol. 'user' veya 'admin' olmalı" });
    }

    // Kendi rolünü değiştirmeyi engelle
    if (userId === req.userId) {
      return res.status(400).json({ message: "Kendi rolünüzü değiştiremezsiniz" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    res.json({ 
      message: "Rol güncellendi",
      user: updatedUser 
    });
  } catch (error) {
    console.error("Admin role update error:", error);
    res.status(500).json({ message: "Rol güncellenirken hata oluştu" });
  }
});

/**
 * GET /api/admin/stats
 * Platform istatistikleri
 */
router.get("/stats", async (_req: AuthRequest, res: Response) => {
  try {
    const [totalUsers, totalFiles, totalFolders, totalStorage] = await Promise.all([
      prisma.user.count(),
      prisma.file.count({ where: { isDeleted: false } }),
      prisma.folder.count(),
      prisma.file.aggregate({
        where: { isDeleted: false },
        _sum: { sizeBytes: true }
      })
    ]);

    res.json({
      users: totalUsers,
      files: totalFiles,
      folders: totalFolders,
      totalStorageBytes: Number(totalStorage._sum.sizeBytes || 0)
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ message: "İstatistikler alınırken hata oluştu" });
  }
});

// ============================================
// FAZ 6: User Session Management
// ============================================

/**
 * POST /api/admin/users/:userId/revoke-sessions
 * Force logout user (revoke all refresh tokens)
 */
router.post("/users/:userId/revoke-sessions", revokeUserSessions);

/**
 * GET /api/admin/users/:userId/active-sessions
 * List active sessions for a user
 */
router.get("/users/:userId/active-sessions", listUserActiveSessions);

export default router;
