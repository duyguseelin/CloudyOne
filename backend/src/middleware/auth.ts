import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";
import { verifyAccessToken } from "../utils/tokenServiceRS256"; // FAZ 7: RS256 JWT

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-later";

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Yetkisiz erişim. Token bulunamadı." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // FAZ 7: RS256 JWT verification
    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;
    
    // Kullanıcı bilgilerini çek (role dahil)
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true }
    });
    
    if (!user) {
      return res.status(401).json({ message: "Kullanıcı bulunamadı" });
    }
    
    req.userRole = user.role;
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Geçersiz veya süresi dolmuş token." });
  }
}
