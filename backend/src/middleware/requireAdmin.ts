import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth";

/**
 * Admin middleware - Sadece role="admin" olan kullanıcılar geçebilir
 * NOT: Bu middleware'i kullanmadan önce requireAuth middleware'i çalıştırılmalı
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  // Auth middleware'den gelen userId kontrolü
  if (!req.userId) {
    return res.status(401).json({ 
      message: "Kimlik doğrulaması gerekli" 
    });
  }

  // User role kontrolü
  if (!req.userRole || req.userRole !== "admin") {
    return res.status(403).json({ 
      message: "Bu işlem için yönetici yetkisi gerekli" 
    });
  }

  next();
}
