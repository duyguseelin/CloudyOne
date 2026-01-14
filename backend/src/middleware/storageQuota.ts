import type { AuthRequest } from "./auth";
import { Response, NextFunction } from "express";
import { prisma } from "../utils/prisma";

export async function checkStorageQuota(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) return res.status(401).json({ message: "Yetkisiz erişim." });
    if (!req.file) return res.status(400).json({ message: "Dosya bulunamadı." });
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ message: "Kullanıcı bulunamadı." });
    const incomingSize = BigInt(req.file.size);
    const currentUsed = BigInt(user.usedStorageBytes); // aktif kullanım (BigInt)
    const limit = BigInt(user.storageLimitBytes);
    if (currentUsed + incomingSize > limit) {
      return res.status(413).json({
        message: "Depolama sınırını aştınız. Lütfen dosya silin veya paketi yükseltin.",
        usage: {
          usedStorageBytes: Number(currentUsed),
          storageLimitBytes: Number(limit),
          incomingBytes: Number(incomingSize)
        }
      });
    }
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Kota kontrolü sırasında hata." });
  }
}