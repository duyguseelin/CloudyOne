/**
 * File Routes V2 - Presigned URL Implementation
 * FAZ 2: R2 Private Bucket + Presigned URLs
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { rateLimitPresignUpload, rateLimitPresignDownload } from "../middleware/rateLimiter";
import {
  presignUpload,
  uploadComplete,
  presignDownload,
  listFilesV2,
  deleteFileV2,
} from "../controllers/fileController.v2";

const router = Router();

/**
 * POST /api/files/v2/presign-upload
 * Generate presigned upload URL
 * FAZ 5: Rate limit 30 req / 10min / user
 */
router.post(
  "/presign-upload",
  requireAuth,
  rateLimitPresignUpload,
  presignUpload
);

/**
 * POST /api/files/v2/:fileId/complete
 * Mark upload as complete
 */
router.post("/:fileId/complete", requireAuth, uploadComplete);

/**
 * POST /api/files/v2/presign-download
 * Generate presigned download URL
 * FAZ 5: Rate limit 60 req / 10min / user
 */
router.post("/presign-download", requireAuth, rateLimitPresignDownload, presignDownload);

/**
 * GET /api/files/v2/list
 * List user's active files
 */
router.get("/list", requireAuth, listFilesV2);

/**
 * DELETE /api/files/v2/:fileId
 * Delete file (soft delete + R2 delete)
 */
router.delete("/:fileId", requireAuth, deleteFileV2);

export default router;
