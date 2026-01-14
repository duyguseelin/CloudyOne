import { Request, Response } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { prisma } from "../utils/prisma";

// 2FA'yı aktif etme - QR kod oluştur
export async function enable2FA(req: any, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });

    if (user.twoFactorEnabled === true) {
      return res.status(400).json({ message: "İki aşamalı doğrulama zaten aktif." });
    }

    // TOTP secret oluştur
    const secret = speakeasy.generateSecret({
      name: `CloudyOne (${user.email})`,
      issuer: "CloudyOne"
    });

    // QR kodu base64 olarak oluştur
    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    // Secret'i geçici olarak veritabanına kaydet (henüz aktif değil)
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 || null }
    });

    return res.json({
      qrCode,
      secret: secret.base32,
      message: "QR kodu taratıp doğrulama kodunu girin."
    });
  } catch (err: any) {
    console.error("Enable2FA error:", err);
    return res.status(500).json({ message: "2FA aktif edilemedi." });
  }
}

// 2FA doğrulama ve aktif etme
export async function verify2FA(req: any, res: Response) {
  try {
    const userId = req.userId;
    const { token } = req.body;

    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    if (!token) return res.status(400).json({ message: "Doğrulama kodu gerekli." });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ message: "2FA kurulumu başlatılmamış." });
    }

    // Token'ı doğrula
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token,
      window: 2 // ±2 zaman aralığı toleransı
    });

    if (!verified) {
      return res.status(400).json({ message: "Geçersiz doğrulama kodu." });
    }

    // 2FA'yı aktif et
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true }
    });

    return res.json({ message: "İki aşamalı doğrulama başarıyla aktif edildi!" });
  } catch (err: any) {
    console.error("Verify2FA error:", err);
    return res.status(500).json({ message: "Doğrulama başarısız." });
  }
}

// 2FA'yı devre dışı bırak
export async function disable2FA(req: any, res: Response) {
  try {
    const userId = req.userId;
    const { password } = req.body;

    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    if (!password) return res.status(400).json({ message: "Şifre gerekli." });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });

    if (user.twoFactorEnabled !== true) {
      return res.status(400).json({ message: "İki aşamalı doğrulama zaten aktif değil." });
    }

    // Şifreyi kontrol et (güvenlik için)
    const bcrypt = require("bcryptjs");
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: "Şifre hatalı." });
    }

    // 2FA'yı devre dışı bırak
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null
      }
    });

    return res.json({ message: "İki aşamalı doğrulama devre dışı bırakıldı." });
  } catch (err: any) {
    console.error("Disable2FA error:", err);
    return res.status(500).json({ message: "2FA devre dışı bırakılamadı." });
  }
}

// 2FA durumunu kontrol et
export async function get2FAStatus(req: any, res: Response) {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ message: "Yetkisiz erişim." });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true }
    });

    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });

    return res.json({ enabled: user.twoFactorEnabled === true });
  } catch (err: any) {
    console.error("Get2FAStatus error:", err);
    return res.status(500).json({ message: "Durum alınamadı." });
  }
}

// Login sırasında 2FA kodu doğrulama
export async function verifyLogin2FA(req: any, res: Response) {
  try {
    const { temp2FAToken, code } = req.body;

    if (!temp2FAToken || !code) {
      return res.status(400).json({ message: "Token ve doğrulama kodu gerekli." });
    }

    // Geçici token'ı doğrula
    const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";
    let decoded: any;
    try {
      decoded = require("jsonwebtoken").verify(temp2FAToken, JWT_SECRET);
      if (decoded.type !== '2fa-pending') {
        return res.status(400).json({ message: "Geçersiz token." });
      }
    } catch {
      return res.status(400).json({ message: "Token süresi dolmuş veya geçersiz." });
    }

    // Kullanıcıyı çek
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ message: "2FA kurulumu bulunamadı." });
    }

    // TOTP kodunu doğrula
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 2 // ±2 zaman aralığı toleransı
    });

    if (!verified) {
      return res.status(400).json({ message: "Geçersiz doğrulama kodu." });
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
    }

    // Gerçek access token ve refresh token oluştur
    const { createAccessToken, createRefreshToken } = require("../utils/tokenServiceRS256");
    const accessToken = createAccessToken(user.id);
    const { token: refreshToken } = await createRefreshToken({
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Refresh token'ı cookie olarak set et
    const NODE_ENV = process.env.NODE_ENV || "development";
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    console.log("✅ 2FA login successful for:", user.email);

    return res.status(200).json({
      token: accessToken,
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
    console.error("VerifyLogin2FA error:", err);
    return res.status(500).json({ message: "2FA doğrulaması başarısız." });
  }
}
