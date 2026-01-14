/**
 * R2 Bucket'ı temizle
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function cleanR2() {
  const bucket = process.env.R2_BUCKET_NAME || "cloudyone-storage";
  console.log("🗑️  R2 Bucket temizleniyor:", bucket);
  
  // Dosyaları listele
  const listCommand = new ListObjectsV2Command({ Bucket: bucket });
  const response = await r2Client.send(listCommand);
  
  if (!response.Contents || response.Contents.length === 0) {
    console.log("   ℹ️  Bucket zaten boş");
    return;
  }
  
  console.log("   📊 Bulunan dosya sayısı:", response.Contents.length);
  
  // Dosyaları sil
  const deleteCommand = new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: {
      Objects: response.Contents.map(obj => ({ Key: obj.Key }))
    }
  });
  
  const deleteResponse = await r2Client.send(deleteCommand);
  console.log("   ✅ Silinen dosya:", deleteResponse.Deleted?.length || 0);
  console.log("✅ R2 Bucket temizlendi!");
}

cleanR2().catch(console.error);
