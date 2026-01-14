import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint =
  process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

export const r2 = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

// Upload object to Cloudflare R2
export async function uploadToR2(key: string, buffer: Buffer, contentType?: string): Promise<void> {
  if (!process.env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME is not set");
  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      })
    );
    try { console.log("[R2] Upload success", { key }); } catch {}
  } catch (error) {
    console.error("[R2] Upload error", error);
    throw error;
  }
}

// Delete object from R2
export async function deleteFromR2(key: string): Promise<void> {
  if (!process.env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME is not set");
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    try { console.log("[R2] Delete success", { key }); } catch {}
  } catch (error) {
    console.error("[R2] Delete error", error);
    throw error;
  }
}

// Copy object within R2
export async function copyInR2(sourceKey: string, destKey: string): Promise<void> {
  if (!process.env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME is not set");
  try {
    await r2.send(
      new CopyObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        CopySource: `${process.env.R2_BUCKET_NAME}/${sourceKey}`,
        Key: destKey,
      })
    );
    try { console.log("[R2] Copy success", { sourceKey, destKey }); } catch {}
  } catch (error) {
    console.error("[R2] Copy error", error);
    throw error;
  }
}

// Create a time-limited signed URL for GET
export async function getSignedUrlFromR2(key: string, expiresInSeconds: number): Promise<string> {
  if (!process.env.R2_BUCKET_NAME) throw new Error("R2_BUCKET_NAME is not set");
  try {
    const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
    const url = await getSignedUrl(r2, cmd, { expiresIn: Math.max(1, Math.min(7 * 24 * 3600, expiresInSeconds)) });
    return url;
  } catch (error) {
    console.error("[R2] Presign error", error);
    throw error;
  }
}

export function getPublicUrlForKey(key?: string | null) {
  if (!key) return null;
  const base = process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE || "";
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${key}`;
}
