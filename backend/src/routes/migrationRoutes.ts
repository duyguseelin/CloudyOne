/**
 * Migration Routes - FAZ 4
 * Plaintext to encrypted file migration endpoints
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { rateLimitMigration } from "../middleware/rateLimiter";
import {
  listMigrationStatus,
  startMigration,
  commitMigration,
  failMigration,
  cleanupLegacy,
} from "../controllers/migrationController";

const router = Router();

/**
 * GET /api/migration/files
 * List files by encryption state
 * FAZ 5: Rate limit 10 req / 10min / user
 */
router.get("/files", requireAuth, rateLimitMigration, listMigrationStatus);

/**
 * POST /api/migration/files/:fileId/start
 * Mark file as MIGRATING
 */
router.post("/files/:fileId/start", requireAuth, rateLimitMigration, startMigration);

/**
 * POST /api/migration/files/:fileId/commit
 * Complete migration with encrypted metadata
 */
router.post("/files/:fileId/commit", requireAuth, rateLimitMigration, commitMigration);

/**
 * POST /api/migration/files/:fileId/fail
 * Mark migration as failed
 */
router.post("/files/:fileId/fail", requireAuth, rateLimitMigration, failMigration);

/**
 * POST /api/migration/files/:fileId/cleanup
 * Delete legacy plaintext file after migration
 */
router.post("/files/:fileId/cleanup", requireAuth, rateLimitMigration, cleanupLegacy);

export default router;
