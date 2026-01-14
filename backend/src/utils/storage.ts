import { prisma } from "./prisma";
import { deleteFromR2 } from "../lib/objectStorage";

export async function recalculateUserStorage(userId: string) {
  // Sadece kişisel dosyaları hesapla (ekip dosyalarını hariç tut)
  const activeAgg = await prisma.file.aggregate({
    _sum: { sizeBytes: true },
    where: { userId, isDeleted: false, teamId: null },
  });
  const trashAgg = await prisma.file.aggregate({
    _sum: { sizeBytes: true },
    where: { userId, isDeleted: true, teamId: null },
  });
  const usedStorageBytes: bigint = activeAgg._sum.sizeBytes ?? 0n;
  const trashStorageBytes: bigint = trashAgg._sum.sizeBytes ?? 0n;
  const user = await prisma.user.update({
    where: { id: userId },
    data: { usedStorageBytes, trashStorageBytes, usedBytes: usedStorageBytes },
    select: {
      id: true,
      plan: true,
      storageLimitBytes: true,
      trashLimitBytes: true,
      usedStorageBytes: true,
      trashStorageBytes: true,
    },
  });
  return user;
}

export type PlanKey = "FREE" | "PRO" | "BUSINESS";

const GB = 1024n * 1024n * 1024n; // 1GB in bytes (BigInt)
export const PLAN_DEFINITIONS: Record<PlanKey, { storageLimitBytes: bigint; trashLimitBytes: bigint }> = {
  FREE: { storageLimitBytes: 1n * GB, trashLimitBytes: 1n * GB }, // 1GB / 1GB
  PRO: { storageLimitBytes: 100n * GB, trashLimitBytes: 10n * GB }, // 100GB / 10GB
  BUSINESS: { storageLimitBytes: 1024n * GB, trashLimitBytes: 50n * GB }, // 1TB / 50GB
};

export async function applyPlan(userId: string, plan: PlanKey) {
  const def = PLAN_DEFINITIONS[plan];
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      storageLimitBytes: def.storageLimitBytes,
      trashLimitBytes: def.trashLimitBytes,
    },
  });
  return recalculateUserStorage(userId);
}

// En eski silinmiş dosyaları trash kotasına sığdırmak için temizler
export async function enforceTrashLimit(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  if (user.trashStorageBytes <= user.trashLimitBytes) return;
  let over = user.trashStorageBytes - user.trashLimitBytes; // bigint
  const toDelete = await prisma.file.findMany({
    where: { userId, isDeleted: true },
    orderBy: { deletedAt: "asc" },
    select: { id: true, sizeBytes: true, storageKey: true, storagePath: true },
  });
  for (const f of toDelete) {
    if (over <= 0n) break;
    // R2'den sil
    const key = f.storageKey || f.storagePath;
    if (key) {
      try {
        await deleteFromR2(key);
        console.log("[TrashLimit] R2 delete success:", key);
      } catch (e) {
        console.warn("[TrashLimit] R2 delete failed (continuing):", key, e instanceof Error ? e.message : e);
      }
    }
    await prisma.file.delete({ where: { id: f.id } });
    over -= f.sizeBytes;
  }
  await recalculateUserStorage(userId);
}

export async function cleanupOldTrash(userId: string) {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const old = await prisma.file.findMany({
    where: { userId, isDeleted: true, deletedAt: { lt: threshold } },
    select: { id: true, storageKey: true, storagePath: true },
  });
  if (!old.length) return;
  
  // R2'den sil
  for (const f of old) {
    const key = f.storageKey || f.storagePath;
    if (key) {
      try {
        await deleteFromR2(key);
        console.log("[OldTrash] R2 delete success:", key);
      } catch (e) {
        console.warn("[OldTrash] R2 delete failed (continuing):", key, e instanceof Error ? e.message : e);
      }
    }
  }
  
  await prisma.file.deleteMany({ where: { id: { in: old.map(o => o.id) } } });
  await recalculateUserStorage(userId);
}