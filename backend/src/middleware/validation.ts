/**
 * Validation Middleware - FAZ 5
 * Request payload validation with Zod
 */

import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

/**
 * Validate request body against Zod schema
 */
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: error.issues.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * Common validation schemas
 */

// Base64 string validation (with max length)
export const base64Schema = (maxLength = 1000000) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64 format")
    .max(maxLength, `Base64 exceeds max length of ${maxLength}`);

// UUID validation
export const uuidSchema = z.string().uuid("Invalid UUID format");

// Presign upload validation
export const presignUploadSchema = z
  .object({
    filename: z.string().min(1).max(255),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024), // 10GB max
    mimeType: z.string().optional(),
  })
  .strict(); // Reject unknown fields

// Presign upload V3 (encrypted metadata)
export const presignUploadV3Schema = z
  .object({
    metaNameEnc: base64Schema(10000), // Encrypted filename (max 10KB)
    metaNameIv: base64Schema(100), // IV (12 bytes base64 ~16 chars)
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024),
    mimeEnc: base64Schema(1000).optional(), // Encrypted MIME type
  })
  .strict();

// Upload complete V3 (full crypto metadata)
export const uploadCompleteV3Schema = z
  .object({
    cipherIv: base64Schema(100),
    edek: base64Schema(500), // Encrypted DEK
    edekIv: base64Schema(100),
    encMeta: z.object({
      algo: z.string(),
      chunkSize: z.number().int().positive(),
      totalChunks: z.number().int().positive(),
      baseIv: z.string(),
      aadVersion: z.number().int(),
      headerVersion: z.number().int(),
    }),
    metaNameEnc: base64Schema(10000),
    metaNameIv: base64Schema(100),
    mimeEnc: base64Schema(1000).optional(),
  })
  .strict();

// Presign download validation
export const presignDownloadSchema = z
  .object({
    fileId: uuidSchema,
  })
  .strict();

// Migration commit validation
export const migrationCommitSchema = z
  .object({
    cipherIv: base64Schema(100),
    edek: base64Schema(500),
    edekIv: base64Schema(100),
    encMeta: z.object({
      algo: z.string(),
      chunkSize: z.number().int().positive(),
      totalChunks: z.number().int().positive(),
      baseIv: z.string(),
      aadVersion: z.number().int(),
      headerVersion: z.number().int(),
    }),
    metaNameEnc: base64Schema(10000),
    metaNameIv: base64Schema(100),
    mimeEnc: base64Schema(1000).optional(),
    contentSha256: z.string().length(64).optional(), // SHA-256 hex
  })
  .strict();

// Recovery key generation
export const recoveryKeySchema = z
  .object({
    recoveryKeyEnc: base64Schema(1000), // Encrypted recovery key
    recoveryKeySalt: base64Schema(100), // Salt
  })
  .strict();
