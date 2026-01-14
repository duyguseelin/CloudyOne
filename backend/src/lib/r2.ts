/**
 * Cloudflare R2 Client (AWS S3 Compatible)
 * FAZ 2: Private bucket + Presigned URLs only
 * 
 * Security:
 * - R2 bucket is PRIVATE (no public access)
 * - Frontend NEVER sees credentials
 * - All uploads/downloads via presigned URLs
 * - URLs expire in configurable time (default 10 minutes)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

// Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET!;
const R2_ENDPOINT = process.env.R2_ENDPOINT!;
const PRESIGNED_URL_EXPIRATION = parseInt(
  process.env.PRESIGNED_URL_EXPIRATION_SECONDS || "600",
  10
);

// Validate configuration
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  throw new Error("Missing R2 configuration in .env file");
}

// S3-compatible R2 Client
export const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate presigned PUT URL for file upload
 * 
 * @param r2Key - Unique R2 object key (UUID-based, no original filename)
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration in seconds (default from env)
 * @returns Presigned upload URL
 */
export async function generatePresignedUploadUrl(
  r2Key: string,
  contentType: string,
  expiresIn: number = PRESIGNED_URL_EXPIRATION
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
    ContentType: contentType,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Generate presigned GET URL for file download
 * 
 * @param r2Key - R2 object key
 * @param expiresIn - URL expiration in seconds (default from env)
 * @returns Presigned download URL
 */
export async function generatePresignedDownloadUrl(
  r2Key: string,
  expiresIn: number = PRESIGNED_URL_EXPIRATION
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
  });

  return getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Get object content directly from R2
 * 
 * @param r2Key - R2 object key
 * @returns Object content as Buffer
 */
export async function getObjectContent(r2Key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
  });

  const response = await r2Client.send(command);
  
  if (!response.Body) {
    throw new Error("R2'den dosya içeriği alınamadı");
  }
  
  // Stream'i Buffer'a dönüştür
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Check if object exists in R2
 * 
 * @param r2Key - R2 object key
 * @returns Object metadata if exists, null otherwise
 */
export async function checkObjectExists(
  r2Key: string
): Promise<{ size: number; contentType: string } | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
    });

    const response = await r2Client.send(command);

    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType || "application/octet-stream",
    };
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete object from R2
 * 
 * @param r2Key - R2 object key
 */
export async function deleteObject(r2Key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET,
    Key: r2Key,
  });

  await r2Client.send(command);
}

/**
 * Generate unique R2 key for a file
 * Format: u/<userId>/<uuid>
 * 
 * @param userId - Owner user ID
 * @param fileId - Unique file ID (cuid)
 * @returns R2 object key
 */
export function generateR2Key(userId: string, fileId: string): string {
  return `u/${userId}/${fileId}`;
}

/**
 * Allowed content types (whitelist)
 * Add more as needed for your project
 */
export const ALLOWED_CONTENT_TYPES = [
  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  "text/plain",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  // Archives
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/gzip",
  // Video
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  // Audio
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  // Other
  "application/json",
  "application/xml",
];

/**
 * Validate content type against whitelist
 */
export function isContentTypeAllowed(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase());
}

/**
 * Get max file size from environment (default 25MB)
 */
export function getMaxFileSize(): number {
  return parseInt(process.env.MAX_FILE_SIZE_BYTES || "26214400", 10);
}
