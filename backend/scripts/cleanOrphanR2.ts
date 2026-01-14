import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
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

const BUCKET = process.env.R2_BUCKET_NAME || 'cloudyone-storage';
const ORPHAN_USER = 'a39eca72-adef-4ddf-b1b2-0d543a4923f0';

async function deleteOrphanFiles() {
  console.log('🔍 Yetim dosyalar listeleniyor...');
  
  // Yetim kullanıcının dosyalarını listele
  const listCmd = new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: `u/${ORPHAN_USER}/`,
  });
  
  const result = await R2.send(listCmd);
  
  if (!result.Contents || result.Contents.length === 0) {
    console.log('❌ Silinecek dosya bulunamadı');
    return;
  }
  
  console.log('📁 Silinecek dosyalar:');
  let totalSize = 0;
  result.Contents.forEach(obj => {
    const sizeKB = (obj.Size || 0) / 1024;
    totalSize += sizeKB;
    console.log(`  - ${obj.Key} (${sizeKB.toFixed(2)} KB)`);
  });
  console.log(`\n📊 Toplam: ${result.Contents.length} dosya, ${totalSize.toFixed(2)} KB`);
  
  // Dosyaları sil
  const deleteCmd = new DeleteObjectsCommand({
    Bucket: BUCKET,
    Delete: {
      Objects: result.Contents.map(obj => ({ Key: obj.Key! })),
    },
  });
  
  const deleteResult = await R2.send(deleteCmd);
  console.log(`\n✅ Silinen dosya sayısı: ${deleteResult.Deleted?.length || 0}`);
  
  if (deleteResult.Errors && deleteResult.Errors.length > 0) {
    console.log('❌ Hatalar:', deleteResult.Errors);
  }
}

deleteOrphanFiles().catch(console.error);
