import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import multer from "multer";
import {
  createTeam,
  getOrCreateDefaultTeam,
  listTeamMembers,
  inviteToTeam,
  cancelInvite,
  removeMember,
  updateMemberRole,
  getInviteByToken,
  acceptInvite,
  declineInvite,
  listMyTeams,
  getPendingInvites,
  listTeamFiles,
  shareFileWithTeam,
  unshareFileFromTeam,
  createTeamFolder,
  deleteTeamFile,
  deleteTeamFolder,
  uploadTeamFile,
  listFileComments,
  addFileComment,
  deleteFileComment,
  updateFileComment,
  renameTeamFile,
  copyTeamFileToPersonal,
  leaveTeam
} from "../controllers/teamController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// PUBLIC ROUTES (Auth gerektirmeyen)
// ==========================================

// Davet detaylarını getir (token ile)
router.get("/invite/:token", getInviteByToken);

// ==========================================
// PROTECTED ROUTES (Auth gerektiren)
// ==========================================

// Yeni ekip oluştur
router.post("/create", requireAuth, createTeam);

// Kullanıcının varsayılan ekibini getir/oluştur
router.get("/default", requireAuth, getOrCreateDefaultTeam);

// Ekip üyelerini listele
router.get("/members", requireAuth, listTeamMembers);

// Kullanıcının dahil olduğu tüm ekipleri listele
router.get("/my-teams", requireAuth, listMyTeams);

// Kullanıcıya gelen davet isteklerini listele
router.get("/pending-invites", requireAuth, getPendingInvites);

// Yeni üye davet et
router.post("/invite", requireAuth, inviteToTeam);

// Daveti kabul et (token ile)
router.post("/invite/:token/accept", requireAuth, acceptInvite);

// Daveti reddet (token ile)
router.post("/invite/:token/decline", requireAuth, declineInvite);

// Daveti kabul et (inviteId ile - pending invites sayfasından)
router.post("/pending-invites/:inviteId/accept", requireAuth, acceptInvite);

// Daveti reddet (inviteId ile - pending invites sayfasından)
router.post("/pending-invites/:inviteId/decline", requireAuth, declineInvite);

// Daveti iptal et (ekip sahibi tarafından)
router.delete("/invite/:inviteId", requireAuth, cancelInvite);

// Üyeyi ekipten çıkar
router.delete("/member/:memberId", requireAuth, removeMember);

// Ekipten çık (kendini ekipten çıkar)
router.post("/:teamId/leave", requireAuth, leaveTeam);

// Üye rolünü güncelle
router.patch("/member/:memberId/role", requireAuth, updateMemberRole);

// ==========================================
// EKİP DOSYALARI
// ==========================================

// Ekip dosyalarını listele
router.get("/:teamId/files", requireAuth, listTeamFiles);

// Ekibe doğrudan dosya yükle
router.post("/:teamId/upload", requireAuth, upload.single("file"), uploadTeamFile);

// Dosyayı ekiple paylaş
router.post("/share-file", requireAuth, shareFileWithTeam);

// Dosyayı ekipten kaldır
router.post("/unshare-file", requireAuth, unshareFileFromTeam);

// Ekip klasörü oluştur
router.post("/folder", requireAuth, createTeamFolder);

// Ekip dosyasını sil
router.delete("/file/:fileId", requireAuth, deleteTeamFile);

// Ekip dosyasını yeniden adlandır
router.patch("/file/:fileId/rename", requireAuth, renameTeamFile);

// Ekip dosyasını kişisel dosyalara kopyala
router.post("/file/:fileId/copy-to-personal", requireAuth, copyTeamFileToPersonal);

// Ekip klasörünü sil
router.delete("/folder/:folderId", requireAuth, deleteTeamFolder);

// ==========================================
// DOSYA YORUMLARI
// ==========================================

// Dosya yorumlarını listele
router.get("/file/:fileId/comments", requireAuth, listFileComments);

// Dosyaya yorum ekle
router.post("/file/:fileId/comments", requireAuth, addFileComment);

// Yorum güncelle
router.patch("/comment/:commentId", requireAuth, updateFileComment);

// Yorum sil
router.delete("/comment/:commentId", requireAuth, deleteFileComment);

export default router;
