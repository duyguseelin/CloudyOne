/**
 * Migration Script: Local Storage → Cloudflare R2
 * 
 * Bu script uploads/ klasöründeki dosyaları R2'ye taşır ve
 * veritabanı kayıtlarını günceller.
 */

import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// R2 Configuration
const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET!;

const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const UPLOADS_DIR = path.join(__dirname, "../uploads");

interface MigrationResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

async function uploadToR2(filePath: string, r2Key: string, mimeType: string): Promise<boolean> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: mimeType || "application/octet-stream",
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    console.error(`❌ R2 upload failed for ${r2Key}:`, error);
    return false;
  }
}

async function migrateFiles(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  console.log("\n🚀 Starting migration to Cloudflare R2...\n");
  console.log(`📁 Uploads directory: ${UPLOADS_DIR}`);
  console.log(`☁️  R2 Bucket: ${R2_BUCKET}`);
  console.log(`🔗 R2 Endpoint: ${R2_ENDPOINT}\n`);

  // Get all files with LOCAL storage or no storageProvider
  const localFiles = await prisma.file.findMany({
    where: {
      OR: [
        { storageProvider: "LOCAL" },
        { storageProvider: null },
        { storageProvider: "" },
      ],
      isDeleted: false,
    },
  });

  console.log(`📊 Found ${localFiles.length} files to migrate\n`);

  for (const file of localFiles) {
    console.log(`\n📄 Processing: ${file.filename}`);
    
    // Determine local file path
    let localPath = "";
    
    // Try different path patterns
    const possiblePaths = [
      path.join(UPLOADS_DIR, file.storagePath),
      path.join(UPLOADS_DIR, file.userId, file.storagePath),
      path.join(UPLOADS_DIR, file.storageKey || ""),
      file.storagePath, // Absolute path
    ];

    for (const tryPath of possiblePaths) {
      if (tryPath && fs.existsSync(tryPath)) {
        localPath = tryPath;
        break;
      }
    }

    if (!localPath) {
      console.log(`   ⚠️  File not found on disk, skipping`);
      result.skipped++;
      continue;
    }

    // Generate R2 key
    const r2Key = `files/${file.userId}/${file.id}/${file.filename}`;
    
    console.log(`   📍 Local: ${localPath}`);
    console.log(`   ☁️  R2 Key: ${r2Key}`);

    // Upload to R2
    const uploaded = await uploadToR2(localPath, r2Key, file.mimeType || "application/octet-stream");

    if (uploaded) {
      // Update database
      await prisma.file.update({
        where: { id: file.id },
        data: {
          storageProvider: "R2",
          storageKey: r2Key,
        },
      });

      console.log(`   ✅ Migrated successfully`);
      result.success++;
    } else {
      console.log(`   ❌ Migration failed`);
      result.failed++;
      result.errors.push(`Failed to upload: ${file.filename}`);
    }
  }

  return result;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("   📦 Local to R2 Migration Tool");
  console.log("═══════════════════════════════════════════════════════");

  // Validate R2 configuration
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error("\n❌ R2 configuration is missing in .env file!");
    console.error("   Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME");
    process.exit(1);
  }

  try {
    const result = await migrateFiles();

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("   📊 Migration Summary");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   ❌ Failed:  ${result.failed}`);
    console.log(`   ⚠️  Skipped: ${result.skipped}`);
    
    if (result.errors.length > 0) {
      console.log("\n   Errors:");
      result.errors.forEach((err) => console.log(`   - ${err}`));
    }

    if (result.success > 0) {
      console.log("\n   💡 Tip: You can now delete local files from uploads/");
      console.log("          after verifying R2 uploads are working correctly.");
    }

    console.log("═══════════════════════════════════════════════════════\n");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
