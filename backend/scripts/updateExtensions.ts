/**
 * Update extension field for existing encrypted files
 * This script extracts extension from filename and updates the database
 */

import { PrismaClient } from '@prisma/client';
import path from 'path';

const prisma = new PrismaClient();

async function updateExtensions() {
  try {
    console.log('🔄 Dosya uzantılarını güncelleme başlatılıyor...\n');

    // Get all files without extension field
    const files = await prisma.file.findMany({
      where: {
        OR: [
          { extension: null },
          { extension: '' }
        ],
        isDeleted: false
      },
      select: {
        id: true,
        filename: true,
        originalName: true,
        extension: true,
        isEncrypted: true
      }
    });

    console.log(`📊 Toplam ${files.length} dosya bulundu\n`);

    let updated = 0;
    let skipped = 0;

    for (const file of files) {
      // Try to extract extension from originalName first, then filename
      const nameToUse = file.originalName || file.filename;
      const ext = path.extname(nameToUse).toLowerCase().replace(/^\./, '');

      if (ext) {
        await prisma.file.update({
          where: { id: file.id },
          data: { extension: ext }
        });
        console.log(`✅ ${file.id} -> ${nameToUse} -> extension: ${ext}`);
        updated++;
      } else {
        console.log(`⏭️  ${file.id} -> ${nameToUse} -> uzantı bulunamadı`);
        skipped++;
      }
    }

    console.log(`\n✅ Güncelleme tamamlandı!`);
    console.log(`   - Güncellenen: ${updated}`);
    console.log(`   - Atlanan: ${skipped}`);
    console.log(`   - Toplam: ${files.length}`);

  } catch (error) {
    console.error('❌ Hata:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateExtensions();
