/**
 * Dosya durumunu kontrol et
 */

import { prisma } from "../src/utils/prisma";

async function checkFile() {
  try {
    const fileId = 'a17be60d-2dc2-49bd-b947-c28d1c83be75';
    
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        filename: true,
        isEncrypted: true,
        metaNameEnc: true,
        metaNameIv: true,
        status: true,
        isDeleted: true,
        userId: true,
        folderId: true,
      }
    });
    
    if (!file) {
      console.log("❌ Dosya bulunamadı:", fileId);
    } else {
      console.log("✅ Dosya bulundu:");
      console.log(JSON.stringify(file, null, 2));
    }
    
  } catch (error) {
    console.error("❌ Hata:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFile();
