import { prisma } from "../src/utils/prisma";

function getFileCategory(filename: string | null): string {
  if (!filename) return 'other';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico', 'heic', 'tiff'].includes(ext)) {
    return 'image';
  }
  else if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext)) {
    return 'media';
  }
  else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods', 'zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return 'document';
  }
  return 'other';
}

async function fixFileCategories() {
  try {
    console.log("📁 Dosya kategorisini kontrol etmeye başlıyorum...\n");
    
    // Tüm dosyaları getir
    const allFiles = await prisma.file.findMany({
      where: { isDeleted: false, teamId: null },
      select: {
        id: true,
        filename: true,
        originalName: true,
        extension: true,
        userId: true,
        isHidden: true,
      }
    });

    console.log(`📊 Toplam ${allFiles.length} dosya bulundu\n`);

    // Kullanıcı başına kategorisini hesapla
    const userCategories: { [userId: string]: any } = {};

    for (const file of allFiles) {
      if (!userCategories[file.userId]) {
        userCategories[file.userId] = {
          image: { count: 0, bytes: 0 },
          media: { count: 0, bytes: 0 },
          document: { count: 0, bytes: 0 },
          other: { count: 0, bytes: 0 },
          hidden: { count: 0, bytes: 0 }
        };
      }

      // originalName varsa ve "encrypted" değilse onu kullan, yoksa extension'dan tahmin et
      let displayName = file.originalName;
      if (!displayName || displayName === 'encrypted') {
        if (file.extension) {
          displayName = `file.${file.extension}`;
        } else {
          displayName = file.filename;
        }
      }

      const category = getFileCategory(displayName);
      
      const fileData = await prisma.file.findUnique({
        where: { id: file.id },
        select: { sizeBytes: true }
      });

      const sizeBytes = Number(fileData?.sizeBytes || 0);

      if (file.isHidden) {
        userCategories[file.userId].hidden.count += 1;
        userCategories[file.userId].hidden.bytes += sizeBytes;
      } else {
        userCategories[file.userId][category].count += 1;
        userCategories[file.userId][category].bytes += sizeBytes;
      }

      console.log(`📄 ${displayName} -> ${category} (${formatBytes(sizeBytes)})`);
    }

    // Sonuçları göster
    console.log("\n" + "=".repeat(60));
    console.log("📊 Kategorisine göre dosyalar:\n");
    for (const userId in userCategories) {
      console.log(`👤 Kullanıcı: ${userId}`);
      const cats = userCategories[userId];
      console.log(`  🖼️  Resimler: ${cats.image.count} dosya (${formatBytes(cats.image.bytes)})`);
      console.log(`  🎬 Medya: ${cats.media.count} dosya (${formatBytes(cats.media.bytes)})`);
      console.log(`  📄 Dokümanlar: ${cats.document.count} dosya (${formatBytes(cats.document.bytes)})`);
      console.log(`  📁 Diğer: ${cats.other.count} dosya (${formatBytes(cats.other.bytes)})`);
      if (cats.hidden.count > 0) {
        console.log(`  🔒 Gizli: ${cats.hidden.count} dosya (${formatBytes(cats.hidden.bytes)})`);
      }
      console.log();
    }

    console.log("✅ Kontrol tamamlandı!");
    
  } catch (error) {
    console.error("Kritik hata:", error);
  } finally {
    await prisma.$disconnect();
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

fixFileCategories();
