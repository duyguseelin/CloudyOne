import { Router } from "express";
import multer from "multer";
import {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  updateProfile,
  updatePreferences,
  refreshAccessToken,
  logout,
  setHiddenFilesPin,
  verifyHiddenFilesPin,
  hasHiddenFilesPin,
  uploadProfilePhoto,
  removeProfilePhoto,
  sendVerificationCode,
  verifyEmailCode,
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";
import { rateLimitAuth } from "../middleware/rateLimiter";
import { enable2FA, verify2FA, disable2FA, get2FAStatus, verifyLogin2FA } from "../controllers/twoFactorController";

// Multer for profile photo
const profilePhotoUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları kabul edilir.'));
    }
  }
});

const router = Router();

// FAZ 5: Rate limiting for auth endpoints (10 req / 10min / IP)
router.post("/register", rateLimitAuth, register);
router.post("/login", rateLimitAuth, login);
router.post("/forgot-password", rateLimitAuth, forgotPassword);
router.post("/reset-password", rateLimitAuth, resetPassword);
router.post("/send-verification", rateLimitAuth, sendVerificationCode);
router.post("/verify-email", rateLimitAuth, verifyEmailCode);

// FAZ 6: JWT Refresh Token Lifecycle
router.post("/refresh", refreshAccessToken); // No rate limit (legitimate use case)
router.post("/logout", logout); // No auth required (cookie-based)

router.get("/me", requireAuth, me);
router.put("/update-profile", requireAuth, updateProfile);
router.put("/update-preferences", requireAuth, updatePreferences);

// Profile photo routes
router.post("/profile-photo", requireAuth, profilePhotoUpload.single('profilePhoto'), uploadProfilePhoto);
router.delete("/profile-photo", requireAuth, removeProfilePhoto);

// 2FA routes
router.post("/2fa/enable", requireAuth, enable2FA);
router.post("/2fa/verify", requireAuth, verify2FA);
router.post("/2fa/disable", requireAuth, disable2FA);
router.get("/2fa/status", requireAuth, get2FAStatus);
router.post("/2fa/verify-login", verifyLogin2FA); // Login sırasında 2FA doğrulaması (auth gerekmez)

// Hidden files PIN routes
router.post("/hidden-pin/set", requireAuth, setHiddenFilesPin);
router.post("/hidden-pin/verify", requireAuth, verifyHiddenFilesPin);
router.get("/hidden-pin/has", requireAuth, hasHiddenFilesPin);

export default router;
