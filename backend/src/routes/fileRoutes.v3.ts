/**
 * File Routes V3 - Zero-Knowledge Encryption
 * FAZ 3: Client-side encrypted file operations
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { rateLimitPresignUpload, rateLimitPresignDownload } from "../middleware/rateLimiter";
import {
  presignUploadV3,
  uploadCompleteV3,
  presignDownloadV3,
  listFilesV3,
  deleteFileV3,
  downloadEncryptedFile,
} from "../controllers/fileController.v3";

const router = Router();

/**
 * POST /api/files/v3/presign-upload
 * Generate presigned upload URL for encrypted file
 * FAZ 5: Rate limit 30 req / 10min / user
 */
router.post(
  "/presign-upload",
  requireAuth,
  rateLimitPresignUpload,
  presignUploadV3
);

/**
 * POST /api/files/v3/:fileId/complete
 * Save encryption artifacts and activate file
 */
router.post("/:fileId/complete", requireAuth, uploadCompleteV3);

/**
 * POST /api/files/v3/presign-download
 * Generate presigned download URL with encryption artifacts
 * FAZ 5: Rate limit 60 req / 10min / user
 */
router.post("/presign-download", requireAuth, rateLimitPresignDownload, presignDownloadV3);

/**
 * GET /api/files/v3/:fileId/download
 * Download encrypted file content (proxy through backend to avoid CORS)
 */
router.get("/:fileId/download", requireAuth, downloadEncryptedFile);

/**
 * GET /api/files/v3/list
 * List user's encrypted files (metadata is encrypted)
 */
router.get("/list", requireAuth, listFilesV3);

/**
 * DELETE /api/files/v3/:fileId
 * Delete encrypted file (soft delete + R2 delete)
 */
router.delete("/:fileId", requireAuth, deleteFileV3);

export default router;
