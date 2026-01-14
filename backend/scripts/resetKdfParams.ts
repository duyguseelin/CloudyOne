/**
 * KDF parametrelerini sıfırla
 * Eski Argon2id parametrelerini temizler, yeni PBKDF2 parametreleri oluşturulur
 */

import { prisma } from "../src/utils/prisma";

async function resetKdfParams() {
  try {
    console.log("🔄 Kullanıcı KDF parametreleri sıfırlanıyor...");
    
    const result = await prisma.user.updateMany({
      data: {
        kdfSalt: null,
        kdfParams: null,
      },
    });
    
    console.log(`✅ ${result.count} kullanıcının KDF parametreleri sıfırlandı`);
    console.log("ℹ️  Kullanıcılar tekrar login olduğunda yeni PBKDF2 parametreleri oluşturulacak");
    
  } catch (error) {
    console.error("❌ Hata:", error);
  } finally {
    await prisma.$disconnect();
  }
}

resetKdfParams();
