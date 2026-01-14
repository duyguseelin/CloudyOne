/**
 * Fix encrypted filenames
 * V3 ile şifrelenmiş dosyaların filename'ini "encrypted" olarak güncelle
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 V3 şifreli dosyaların filename alanını düzeltme işlemi başlıyor...\n');

  // V3 ile şifrelenmiş ama filename'i "encrypted" olmayan dosyaları bul
  const files = await prisma.file.findMany({
    where: {
      isEncrypted: true,
      metaNameEnc: { not: null },
      metaNameIv: { not: null },
      filename: { not: 'encrypted' },
      isDeleted: false,
    },
    select: {
      id: true,
      filename: true,
      metaNameEnc: true,
      userId: true,
    },
  });

  console.log(`📊 Toplam ${files.length} dosya bulundu\n`);

  if (files.length === 0) {
    console.log('✅ Düzeltilecek dosya yok');
    return;
  }

  let fixed = 0;

  for (const file of files) {
    console.log(`📝 Düzeltiliyor: ${file.id} (${file.filename})`);
    
    await prisma.file.update({
      where: { id: file.id },
      data: {
        filename: 'encrypted',
      },
    });

    fixed++;
  }

  console.log(`\n✅ ${fixed} dosya güncellendi`);
}

main()
  .catch((e) => {
    console.error('❌ Hata:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
