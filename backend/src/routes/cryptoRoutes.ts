/**
 * Crypto Routes - Zero-Knowledge Encryption
 * FAZ 3: KDF initialization and file metadata
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { initCrypto, saveFileMetadata } from "../controllers/cryptoController";

const router = Router();

/**
 * POST /api/crypto/init
 * Get or generate KDF parameters for user
 */
router.post("/init", requireAuth, initCrypto);

/**
 * POST /api/crypto/files/:fileId/metadata
 * Save encryption metadata for a file
 */
router.post("/files/:fileId/metadata", requireAuth, saveFileMetadata);

export default router;
