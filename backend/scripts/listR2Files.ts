/**
 * R2 Bucket içeriğini listeler
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

async function listR2Files() {
  const command = new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME || "cloudyone-storage",
  });

  const response = await r2Client.send(command);
  
  console.log("\n☁️  Cloudflare R2 Bucket Contents\n");
  console.log(`📦 Bucket: ${process.env.R2_BUCKET_NAME}`);
  console.log(`📊 Total Objects: ${response.KeyCount}\n`);
  
  if (response.Contents) {
    console.log("─".repeat(80));
    console.log("Key".padEnd(60) + "Size".padStart(15));
    console.log("─".repeat(80));
    
    for (const obj of response.Contents) {
      const size = obj.Size ? `${(obj.Size / 1024).toFixed(1)} KB` : "-";
      console.log((obj.Key || "").padEnd(60) + size.padStart(15));
    }
    console.log("─".repeat(80));
  }
}

listR2Files().catch(console.error);
