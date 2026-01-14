import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../utils/prisma";
import { sendPasswordResetEmail, sendEmail } from "../utils/email";
import type { AuthRequest } from "../middleware/auth";
import {
  createAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../utils/tokenServiceRS256"; // FAZ 7: RS256 Asymmetric JWT

// Not: MSSQL kullanıyorsanız .env içinde DATABASE_URL 'sqlserver' provider formatında olmalı
// Ör: sqlserver://USERNAME:PASSWORD@HOST:PORT;database=DBNAME;trustServerCertificate=true



const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret"; // Production'da MUTLAKA değiştirin
const NODE_ENV = process.env.NODE_ENV || "development";
const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

function createToken(userId: string) {
  // DEPRECATED: Use createAccessToken from tokenService instead
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Set refresh token cookie (httpOnly, secure in production)
 */
function setRefreshTokenCookie(res: Response, token: string) {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, token, {
    httpOnly: true, // XSS protection
    secure: NODE_ENV === "production", // HTTPS only in prod
    sameSite: "lax", // CSRF protection
    path: "/api/auth", // Limit scope
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

/**
 * Clear refresh token cookie
 */
function clearRefreshTokenCookie(res: Response) {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
  });
}

// POST /auth/register
export async function register(req: Request, res: Response) {
  try {
    const { name, email, password } = req.body;

    // Email'i normalize et (trim + lowercase) ve boşlukları temizle
    const normalizedEmail = (email || "").trim().toLowerCase();
    const cleanedName = name ? String(name).trim() : undefined;

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "E-posta ve şifre zorunludur." });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ message: "Bu e-posta ile zaten bir hesap var." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Kullanıcı kayıt olduğunda varsayılan FREE planı verilir
    // 1GB = 1024 * 1024 * 1024 bytes
    const GB = 1024n * 1024n * 1024n;
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        name: cleanedName,
        passwordHash,
        plan: "FREE",
        storageLimitBytes: 1n * GB, // 1GB
        trashLimitBytes: 1n * GB, // 1GB
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        storageLimitBytes: true,
        trashLimitBytes: true,
        usedStorageBytes: true,
        trashStorageBytes: true,
        plan: true,
        createdAt: true,
      },
    });

    // FAZ 6: Create access token (15 min) + refresh token (30 days)
    const accessToken = createAccessToken(user.id);
    const { token: refreshToken } = await createRefreshToken({
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    return res.status(201).json({
      token: accessToken, // Access token (short-lived)
      user: {
        ...user,
        storageLimitBytes: Number(user.storageLimitBytes),
        trashLimitBytes: Number(user.trashLimitBytes),
        usedStorageBytes: Number(user.usedStorageBytes),
        trashStorageBytes: Number(user.trashStorageBytes),
      }
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Kayıt sırasında bir hata oluştu." });
  }
}

// POST /auth/login
export async function login(req: Request, res: Response) {
  try {
    console.log("Login attempt:", req.body?.email);
    const rawEmail = req.body?.email;
    const password = req.body?.password;
    const normalizedEmail = (rawEmail || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "E-posta ve şifre zorunludur." });
    }

    // Kullanıcıyı çek
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      console.log("User not found:", normalizedEmail);
      // Güvenlik gereği spesifik bilgi vermiyoruz
      return res.status(401).json({ message: "E-posta veya şifre hatalı." });
    }

    // Şifre doğrulama
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      console.log("Invalid password for:", normalizedEmail);
      return res.status(401).json({ message: "E-posta veya şifre hatalı." });
    }

    // ⚡ 2FA KONTROLÜ: Eğer kullanıcının 2FA'sı aktifse, kod doğrulaması gerekiyor
    if (user.twoFactorEnabled === true) {
      console.log("User has 2FA enabled, waiting for code:", normalizedEmail);
      // Geçici token oluştur (5 dakika geçerli, sadece 2FA doğrulaması için)
      const temp2FAToken = jwt.sign(
        { userId: user.id, email: user.email, type: '2fa-pending' },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      
      return res.status(200).json({
        requires2FA: true,
        temp2FAToken,
        message: "İki faktörlü doğrulama kodu gerekli."
      });
    }

    // Eski kullanıcılar için plan yoksa FREE planı ata
    let updatedUser = user;
    if (!user.plan || user.storageLimitBytes === 0n) {
      const GB = 1024n * 1024n * 1024n;
      updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: "FREE",
          storageLimitBytes: 1n * GB,
          trashLimitBytes: 1n * GB,
        },
      });
      console.log("Applied FREE plan to existing user:", normalizedEmail);
    }

    // FAZ 6: Create access token (15 min) + refresh token (30 days)
    const accessToken = createAccessToken(user.id);
    const { token: refreshToken } = await createRefreshToken({
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Set refresh token as httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      token: accessToken, // Access token (short-lived)
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        plan: updatedUser.plan,
        storageLimitBytes: Number(updatedUser.storageLimitBytes),
        trashLimitBytes: Number(updatedUser.trashLimitBytes),
        usedStorageBytes: Number(updatedUser.usedStorageBytes),
        trashStorageBytes: Number(updatedUser.trashStorageBytes),
        createdAt: updatedUser.createdAt,
      }
    });
  } catch (err: any) {
    console.error("/auth/login hata:", err?.message || err);
    return res.status(500).json({ message: "Giriş sırasında bir hata oluştu." });
  }
}

// POST /auth/forgot-password - Email veya Recovery Key ile
export async function forgotPassword(req: Request, res: Response) {
  try {
    console.log("🔵 Forgot password request received:", req.body);
    const rawEmail = req.body?.email;
    const recoveryKey = req.body?.recoveryKey;
    const normalizedEmail = (rawEmail || "").trim().toLowerCase();

    if (!normalizedEmail && !recoveryKey) {
      return res.status(400).json({ message: "E-posta adresi veya kurtarma anahtarı zorunludur." });
    }

    let user = null;

    // Eğer email sağlanmışsa, email'e göre ara
    if (normalizedEmail) {
      console.log("🔵 Email ile aranıyor:", normalizedEmail);
      user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      console.log("🔵 User found:", user ? `Yes (${user.email})` : "No");
    }
    
    // Eğer recovery key sağlanmışsa, recovery key'e göre ara
    if (!user && recoveryKey) {
      console.log("🔵 Recovery key ile aranıyor...");
      // Recovery key encrypted olduğu için, tüm kullanıcıları kontrol etmeliyiz
      // Basit versiyonda: recovery key kullanıcının recovery key'i ile eşleşip eşleşmediğini kontrol et
      const allUsers = await prisma.user.findMany({
        where: { recoveryEnabled: true }
      });
      
      // Recovery key'i decrypt etmeye çalış (eğer encrypted ise)
      for (const u of allUsers) {
        // Not: recoveryKeyEnc encrypted, bu basit karşılaştırma olmayabilir
        // Eğer plain text ise karşılaştır
        if (u.recoveryKeyEnc && u.recoveryKeyEnc.includes(recoveryKey)) {
          user = u;
          console.log("🔵 Recovery key eşleşti:", u.email);
          break;
        }
      }
      
      if (!user) {
        console.log("⚠️ Recovery key bulunamadı");
      }
    }

    if (user) {
      // Şifre sıfırlama token'ı oluştur (1 saat geçerli)
      const resetToken = jwt.sign(
        { userId: user.id, email: user.email, type: 'reset' }, 
        JWT_SECRET, 
        { expiresIn: '1h' }
      );
      
      console.log("🔵 Token generated, sending email...");
      
      try {
        // E-posta gönder
        await sendPasswordResetEmail(user.email, resetToken);
        console.log(`✅ Şifre sıfırlama e-postası gönderildi: ${user.email}`);
      } catch (emailError) {
        console.error('❌ E-posta gönderilemedi:', emailError);
        // E-posta gönderilemese bile güvenlik için başarılı mesajı döndür
      }
    } else {
      console.log(`⚠️ Şifre sıfırlama talebi - kullanıcı bulunamadı`);
    }

    // Güvenlik için her zaman başarılı yanıt döndür (kullanıcı var mı yok mu belli etme)
    return res.status(200).json({ 
      message: "Eğer sağlanan bilgilere kayıtlı bir hesap varsa, şifre sıfırlama linki gönderildi." 
    });
  } catch (err: any) {
    console.error("Forgot password error:", err);
    console.error("Forgot password error stack:", err?.stack);
    return res.status(500).json({ message: "Bir hata oluştu.", error: process.env.NODE_ENV === 'development' ? err?.message : undefined });
  }
}

// POST /auth/reset-password
export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token ve yeni şifre zorunludur." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Şifre en az 6 karakter olmalıdır." });
    }

    // Token'ı doğrula
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ message: "Geçersiz veya süresi dolmuş token." });
    }

    if (decoded.type !== 'reset') {
      return res.status(400).json({ message: "Geçersiz token türü." });
    }

    // Kullanıcıyı bul
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    // Yeni şifreyi hashle ve güncelle
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    console.log(`✅ Şifre sıfırlandı: ${user.email}`);

    return res.status(200).json({ message: "Şifreniz başarıyla değiştirildi. Artık giriş yapabilirsiniz." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: "Bir hata oluştu." });
  }
}

// GET /auth/me
export async function me(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Yetkisiz erişim." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        storageLimitBytes: true,
        trashLimitBytes: true,
        usedStorageBytes: true,
        trashStorageBytes: true,
        createdAt: true,
        profilePhoto: true,
        profilePhotoKey: true,
        twoFactorEnabled: true,
        trackShareLinks: true,
        warnLargeFiles: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    }

    // Profil fotoğrafı için signed URL oluştur (1 saat geçerli)
    let profilePhotoUrl = null;
    if (user.profilePhotoKey) {
      try {
        profilePhotoUrl = await getSignedUrlFromR2(user.profilePhotoKey, 3600);
      } catch (e) {
        console.error("Profil fotoğrafı URL oluşturulamadı:", e);
      }
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        storageLimitBytes: Number(user.storageLimitBytes ?? BigInt(0)),
        usedStorageBytes: Number(user.usedStorageBytes ?? BigInt(0)),
        trashStorageBytes: Number(user.trashStorageBytes ?? BigInt(0)),
        trashLimitBytes: Number(user.trashLimitBytes ?? BigInt(0)),
        createdAt: user.createdAt,
        profilePhoto: profilePhotoUrl,
        twoFactorEnabled: user.twoFactorEnabled,
        trackShareLinks: user.trackShareLinks ?? true,
        warnLargeFiles: user.warnLargeFiles ?? true,
        emailVerified: user.emailVerified ?? false,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Bir hata oluştu." });
  }
}

// PUT /auth/update-profile
export async function updateProfile(req: any, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const { name, email } = req.body;
    if (!name?.trim() && !email?.trim()) {
      return res.status(400).json({ message: "En az bir alan doldurulmalıdır." });
    }

    const updateData: any = {};
    if (name?.trim()) updateData.name = name.trim();
    if (email?.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
      // E-posta değişiyorsa, aynı e-posta ile başka kullanıcı var mı kontrol et
      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing && existing.id !== userId) {
        return res.status(409).json({ message: "Bu e-posta adresi zaten kullanımda." });
      }
      updateData.email = normalizedEmail;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        storageLimitBytes: true,
        trashLimitBytes: true,
        usedStorageBytes: true,
        trashStorageBytes: true,
        createdAt: true,
      },
    });

    return res.json({
      message: "Profil başarıyla güncellendi.",
      user: {
        ...updatedUser,
        storageLimitBytes: Number(updatedUser.storageLimitBytes),
        trashLimitBytes: Number(updatedUser.trashLimitBytes),
        usedStorageBytes: Number(updatedUser.usedStorageBytes),
        trashStorageBytes: Number(updatedUser.trashStorageBytes),
      },
    });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ message: "Profil güncellenirken bir hata oluştu." });
  }
}

// PUT /auth/update-preferences
export async function updatePreferences(req: any, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const { trackShareLinks, warnLargeFiles } = req.body;
    
    const updateData: any = {};
    if (typeof trackShareLinks === 'boolean') updateData.trackShareLinks = trackShareLinks;
    if (typeof warnLargeFiles === 'boolean') updateData.warnLargeFiles = warnLargeFiles;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "Güncellenecek tercih bulunamadı." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return res.json({ message: "Tercihler başarıyla güncellendi." });
  } catch (err) {
    console.error("Update preferences error:", err);
    return res.status(500).json({ message: "Tercihler güncellenirken bir hata oluştu." });
  }
}

// ============================================
// FAZ 6: JWT Refresh Token Lifecycle
// ============================================

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token cookie
 * - Verifies refresh token
 * - Rotates refresh token (new token, old one revoked)
 * - Returns new access token
 */
export async function refreshAccessToken(req: Request, res: Response) {
  try {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME];

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token not found" });
    }

    // Rotate refresh token (verify + create new + revoke old)
    const { accessToken, refreshToken: newRefreshToken } = await rotateRefreshToken({
      oldToken: refreshToken,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Set new refresh token cookie
    setRefreshTokenCookie(res, newRefreshToken);

    return res.json({
      token: accessToken, // New access token
      message: "Token refreshed successfully",
    });
  } catch (error: any) {
    console.error("Refresh token error:", error.message);

    // Clear invalid cookie
    clearRefreshTokenCookie(res);

    return res.status(401).json({
      message: "Invalid or expired refresh token",
      error: error.message,
    });
  }
}

/**
 * POST /api/auth/logout
 * Logout user by revoking refresh token
 */
export async function logout(req: Request, res: Response) {
  try {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME];

    if (refreshToken) {
      // Revoke refresh token
      await revokeRefreshToken(refreshToken);
    }

    // Clear cookie
    clearRefreshTokenCookie(res);

    return res.json({ message: "Logged out successfully" });
  } catch (error: any) {
    console.error("Logout error:", error.message);

    // Clear cookie even if revocation fails
    clearRefreshTokenCookie(res);

    return res.status(500).json({ message: "Logout failed" });
  }
}

// POST /auth/set-hidden-pin { pin } - Gizli dosyalar PIN'i ayarla
export async function setHiddenFilesPin(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { pin } = req.body || {};
    
    if (pin && (typeof pin !== "string" || pin.length !== 4 || !/^\d{4}$/.test(pin))) {
      return res.status(400).json({ message: "PIN 4 haneli sayı olmalıdır." });
    }
    
    // PIN'i hash'le (argon2)
    const argon2 = await import("argon2");
    const pinHash = pin ? await argon2.hash(pin) : null;
    
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { hiddenFilesPin: pinHash }
    });
    
    return res.json({ message: pin ? "PIN ayarlandı" : "PIN kaldırıldı", hasPinSet: !!user.hiddenFilesPin });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "PIN ayarlanırken hata." });
  }
}

// POST /auth/verify-hidden-pin { pin } - PIN doğrula
export async function verifyHiddenFilesPin(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    const { pin } = req.body || {};
    
    if (!pin || typeof pin !== "string") {
      return res.status(400).json({ message: "PIN gerekli." });
    }
    
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user || !user.hiddenFilesPin) {
      return res.status(400).json({ message: "PIN ayarlanmamış." });
    }
    
    const argon2 = await import("argon2");
    const valid = await argon2.verify(user.hiddenFilesPin, pin);
    
    if (!valid) {
      return res.status(401).json({ message: "Yanlış PIN." });
    }
    
    return res.json({ message: "PIN doğrulandı", valid: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "PIN doğrulanırken hata." });
  }
}

// GET /auth/has-hidden-pin - Kullanıcının PIN'i var mı kontrol et
export async function hasHiddenFilesPin(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    const user = await prisma.user.findUnique({ 
      where: { id: req.userId },
      select: { hiddenFilesPin: true }
    });
    
    return res.json({ hasPinSet: !!user?.hiddenFilesPin });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "PIN kontrolü yapılırken hata." });
  }
}

// ============================================
// Profile Photo Management
// ============================================
import path from "path";
import fs from "fs";
import { uploadToR2, deleteFromR2, getSignedUrlFromR2 } from "../lib/objectStorage";

// POST /auth/profile-photo - Upload profile photo
export async function uploadProfilePhoto(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ message: "Dosya yüklenmedi." });
    }

    // Eski fotoğrafı sil
    const user = await prisma.user.findUnique({ 
      where: { id: req.userId },
      select: { profilePhotoKey: true }
    });
    
    if (user?.profilePhotoKey) {
      try {
        await deleteFromR2(user.profilePhotoKey);
      } catch (e) {
        console.error("Eski profil fotoğrafı silinirken hata:", e);
      }
    }

    // Yeni fotoğrafı R2'ye yükle
    const ext = path.extname(file.originalname || "photo.jpg") || ".jpg";
    const photoKey = `profile-photos/${req.userId}/${Date.now()}${ext}`;
    
    await uploadToR2(photoKey, file.buffer, file.mimetype || "image/jpeg");
    
    // Signed URL oluştur (1 saat geçerli)
    const profilePhotoUrl = await getSignedUrlFromR2(photoKey, 3600);
    
    // Veritabanını güncelle (sadece key sakla)
    await prisma.user.update({
      where: { id: req.userId },
      data: { 
        profilePhotoKey: photoKey 
      }
    });

    return res.json({ 
      message: "Profil fotoğrafı yüklendi.",
      profilePhoto: profilePhotoUrl 
    });
  } catch (err) {
    console.error("Profile photo upload error:", err);
    return res.status(500).json({ message: "Fotoğraf yüklenirken hata oluştu." });
  }
}

// DELETE /auth/profile-photo - Remove profile photo
export async function removeProfilePhoto(req: AuthRequest, res: Response) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    
    const user = await prisma.user.findUnique({ 
      where: { id: req.userId },
      select: { profilePhotoKey: true }
    });
    
    if (user?.profilePhotoKey) {
      try {
        await deleteFromR2(user.profilePhotoKey);
      } catch (e) {
        console.error("Profil fotoğrafı silinirken hata:", e);
      }
    }
    
    // Veritabanından temizle
    await prisma.user.update({
      where: { id: req.userId },
      data: { 
        profilePhoto: null,
        profilePhotoKey: null 
      }
    });

    return res.json({ message: "Profil fotoğrafı kaldırıldı." });
  } catch (err) {
    console.error("Profile photo remove error:", err);
    return res.status(500).json({ message: "Fotoğraf kaldırılırken hata oluştu." });
  }
}

// POST /auth/send-verification - Email doğrulama kodu gönder
export async function sendVerificationCode(req: Request, res: Response) {
  console.log('🔄 [Backend] sendVerificationCode endpoint çağrıldı');
  console.log('📨 [Backend] Request body:', req.body);
  console.log('📨 [Backend] Request headers:', req.headers);
  
  try {
    const { email } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    
    console.log('📧 [Backend] Normalized email:', normalizedEmail);

    if (!normalizedEmail) {
      console.log('❌ [Backend] Email adresi boş');
      return res.status(400).json({ message: "E-posta adresi zorunludur." });
    }

    // Email'in kayıtlı olmadığını kontrol et
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      console.log('❌ [Backend] Bu email ile zaten bir hesap var:', normalizedEmail);
      return res.status(409).json({ message: "Bu e-posta ile zaten bir hesap var." });
    }

    // 6 haneli kod oluştur
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log('🔢 [Backend] Doğrulama kodu oluşturuldu:', code);
    
    // Kodu cache veya temp storage'da kaydet (gerçek projede Redis kullanılmalı)
    // Şimdilik basit bir in-memory storage kullanacağız
    const verificationStore = (global as any)._verificationCodes || {};
    (global as any)._verificationCodes = verificationStore;
    
    verificationStore[normalizedEmail] = {
      code,
      expiresAt: Date.now() + 15 * 60 * 1000 // 15 dakika
    };
    
    console.log('💾 [Backend] Kod store\'da saklandı');

    // Email gönder (sendPasswordResetEmail benzer bir fonksiyon kullanacağız)
    const { sendEmail } = require("../utils/email");
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
              }
              .container {
                max-width: 600px;
                margin: 40px auto;
                background: white;
                border-radius: 12px;
                padding: 40px;
              }
              .code {
                font-size: 32px;
                font-weight: bold;
                color: #8b5cf6;
                letter-spacing: 4px;
                text-align: center;
                padding: 20px;
                background: #f5f3ff;
                border-radius: 8px;
                margin: 20px 0;
              }
              .footer {
                text-align: center;
                font-size: 12px;
                color: #999;
                margin-top: 30px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>Email Doğrulama Kodu</h2>
              <p>CloudyOne'a hoşgeldiniz!</p>
              <p>Hesabınızı tamamlamak için aşağıdaki doğrulama kodunu kullanın:</p>
              <div class="code">${code}</div>
              <p><strong>Bu kod 15 dakika geçerlidir.</strong></p>
              <p>Eğer bu isteği siz yapmadıysanız, bu e-postayı görmezden gelin.</p>
              <div class="footer">
                <p>© CloudyOne - Güvenli Bulut Depolama</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const textContent = `
CloudyOne Email Doğrulama Kodu

Doğrulama kodunuz: ${code}

Bu kod 15 dakika geçerlidir.

Eğer bu isteği siz yapmadıysanız, bu e-postayı görmezden gelin.

© CloudyOne - Güvenli Bulut Depolama
      `;

      await sendEmail(
        normalizedEmail,
        "CloudyOne - Email Doğrulama Kodu",
        htmlContent,
        textContent
      );
      console.log(`✅ Email doğrulama kodu başarıyla gönderildi: ${normalizedEmail}`);
    } catch (emailErr) {
      console.error("❌ Email gönderme hatası:", emailErr);
      // Email gönderilemese de kod oluşturuldu - kullanıcıya bildir
    }

    return res.json({ message: "Doğrulama kodu gönderildi." });
  } catch (err) {
    console.error("Send verification code error:", err);
    return res.status(500).json({ message: "Doğrulama kodu gönderilemedi." });
  }
}

// POST /auth/verify-email - Email doğrulama kodını kontrol et
export async function verifyEmailCode(req: Request, res: Response) {
  try {
    const { email, code } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !code) {
      return res.status(400).json({ message: "E-posta ve kod zorunludur." });
    }

    const verificationStore = (global as any)._verificationCodes || {};
    const stored = verificationStore[normalizedEmail];

    if (!stored) {
      return res.status(400).json({ message: "Önce doğrulama kodu talep edin." });
    }

    if (Date.now() > stored.expiresAt) {
      delete verificationStore[normalizedEmail];
      return res.status(400).json({ message: "Doğrulama kodunun süresi doldu." });
    }

    if (stored.code !== code) {
      return res.status(400).json({ message: "Geçersiz doğrulama kodu." });
    }

    // Kodu sil
    delete verificationStore[normalizedEmail];

    return res.json({ message: "Email doğrulandı." });
  } catch (err) {
    console.error("Verify email code error:", err);
    return res.status(500).json({ message: "Doğrulama başarısız oldu." });
  }
}

