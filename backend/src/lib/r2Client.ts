import { S3Client } from "@aws-sdk/client-s3";

// Environment variable names expected:
// R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_REGION, R2_PUBLIC_BASE
export const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "";
export const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE || process.env.R2_PUBLIC_BASE_URL || "";

export const r2Client = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || "",
  },
  forcePathStyle: true,
});

export default r2Client;
