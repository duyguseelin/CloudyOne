/**
 * Security Routes - FAZ 5
 */

import { Router } from "express";
import { cspReport } from "../controllers/securityController";

const router = Router();

// CSP violation reporting (no auth required)
router.post("/csp-report", cspReport);

export default router;
