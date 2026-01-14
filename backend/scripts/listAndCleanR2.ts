import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const R2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const prisma = new PrismaClient();
const BUCKET = process.env.R2_BUCKET_NAME || 'cloudyone-storage';

async function listAllR2Files() {
  console.log('🔍 R2 dosyaları listeleniyor...\n');
  
  // R2'deki tüm dosyaları listele
  const listCmd = new ListObjectsV2Command({
    Bucket: BUCKET,
  });
  
  const result = await R2.send(listCmd);
  
  if (!result.Contents || result.Contents.length === 0) {
    console.log('R2 boş');
    return;
  }
  
  console.log('📁 R2 Dosyaları:');
  result.Contents.forEach(obj => {
    const sizeKB = (obj.Size || 0) / 1024;
    console.log(`  ${obj.Key} (${sizeKB.toFixed(2)} KB)`);
  });
  console.log(`\nToplam: ${result.Contents.length} dosya\n`);
  
  // Veritabanındaki kullanıcıları al
  const users = await prisma.user.findMany({ select: { id: true } });
  const validUserIds = new Set(users.map(u => u.id));
  
  console.log('👥 Geçerli kullanıcı IDleri:', [...validUserIds]);
  
  // Yetim dosyaları bul (u/ prefix ile başlayan ama geçerli kullanıcı olmayan)
  const orphanFiles = result.Contents.filter(obj => {
    if (!obj.Key?.startsWith('u/')) return false;
    const parts = obj.Key.split('/');
    if (parts.length < 2) return false;
    const userId = parts[1];
    return !validUserIds.has(userId);
  });
  
  if (orphanFiles.length > 0) {
    console.log('\n🗑️ Yetim dosyalar (silinecek):');
    let totalOrphanSize = 0;
    orphanFiles.forEach(obj => {
      const sizeKB = (obj.Size || 0) / 1024;
      totalOrphanSize += sizeKB;
      console.log(`  ${obj.Key} (${sizeKB.toFixed(2)} KB)`);
    });
    console.log(`\nToplam yetim: ${orphanFiles.length} dosya, ${totalOrphanSize.toFixed(2)} KB`);
    
    // Sil
    console.log('\n🗑️ Siliniyor...');
    const deleteCmd = new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: orphanFiles.map(obj => ({ Key: obj.Key! })),
      },
    });
    
    const deleteResult = await R2.send(deleteCmd);
    console.log(`✅ Silinen: ${deleteResult.Deleted?.length || 0} dosya`);
  } else {
    console.log('\n✅ Yetim dosya yok, her şey temiz!');
  }
  
  await prisma.$disconnect();
}

listAllR2Files().catch(console.error);
