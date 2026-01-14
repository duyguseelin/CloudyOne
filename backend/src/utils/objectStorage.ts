import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET, R2_PUBLIC_BASE } from "../lib/r2Client";
import crypto from "crypto";

export async function uploadToR2(userId: string, originalName: string, buffer: Buffer, contentType?: string) {
  const uuid = crypto.randomUUID();
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_\.]/g, "_");
  const key = `${userId}/${uuid}-${safeName}`;
  const cmd = new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: contentType });
  await r2Client.send(cmd);
  const publicUrl = R2_PUBLIC_BASE ? `${R2_PUBLIC_BASE.replace(/\/$/, "")}/${key}` : null;
  try {
    console.log("[R2] Upload success", { userId, originalName, key });
  } catch (e) {
    // ignore logging errors
  }
  return { key, publicUrl };
}

export async function deleteFromR2(key?: string) {
  if (!key) return;
  try {
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    try { console.log("[R2] Delete success", { key }); } catch (e) { }
  } catch (e) {
    console.error("deleteFromR2 error:", e);
  }
}

export function getPublicUrlForKey(key?: string) {
  if (!key) return null;
  if (!R2_PUBLIC_BASE) return null;
  return `${R2_PUBLIC_BASE.replace(/\/$/, "")}/${key}`;
}
