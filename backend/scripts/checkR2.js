const { S3Client, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
require('dotenv').config();

console.log('R2 Endpoint:', process.env.R2_ENDPOINT);
console.log('R2 Bucket:', process.env.R2_BUCKET_NAME);

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function check() {
  const key = 'u/cmilqh1dy0000i6nxfvihusm8/18ac15d0-448e-45de-8a00-4bf2514635b9';
  
  // Check specific file
  try {
    const cmd = new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    const result = await s3.send(cmd);
    console.log('✅ Dosya R2 bulundu:', result.ContentLength, 'bytes');
  } catch (e) {
    console.log('❌ Bu key R2 de yok:', e.name);
  }
  
  // List user files
  console.log('\n📦 R2 deki dosyalar (u/cmilqh1dy0000i6nxfvihusm8/):');
  try {
    const listCmd = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      Prefix: 'u/cmilqh1dy0000i6nxfvihusm8/',
      MaxKeys: 20
    });
    const listResult = await s3.send(listCmd);
    console.log('Toplam:', listResult.Contents?.length || 0, 'dosya');
    (listResult.Contents || []).forEach(obj => {
      console.log('  -', obj.Key, '(', obj.Size, 'bytes)');
    });
  } catch (e) {
    console.log('Liste hatası:', e.message);
  }
  
  // List all files in bucket
  console.log('\n📦 Bucket daki tüm dosyalar:');
  try {
    const listCmd = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: 30
    });
    const listResult = await s3.send(listCmd);
    console.log('Toplam:', listResult.Contents?.length || 0, 'dosya');
    (listResult.Contents || []).slice(0, 15).forEach(obj => {
      console.log('  -', obj.Key);
    });
  } catch (e) {
    console.log('Liste hatası:', e.message);
  }
}

check().catch(console.error);
