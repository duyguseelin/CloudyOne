/**
 * Recovery Routes - FAZ 4
 * Endpoints for recovery key management
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
  getRecoveryStatus,
  generateRecoveryKey,
  disableRecoveryKey,
  downloadRecoveryKey,
} from "../controllers/recoveryController";

const router = Router();

// All routes require authentication
router.get("/status", requireAuth, getRecoveryStatus);
router.post("/generate", requireAuth, generateRecoveryKey);
router.post("/disable", requireAuth, disableRecoveryKey);
router.get("/download", requireAuth, downloadRecoveryKey);

export default router;
