import { Router, type RequestHandler } from "express";

import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import {
  fetchRequestData,
  // generatePresignedUrls,
  // updateVendorRequest,
  // uploadAttachment,
  // deleteAttachment,
} from "../../controllers/controllers.js";

/**
 * Router for vendor request management endpoints
 * All routes require authentication and VENDOR_MANAGER role
 */
const router = Router();

/**
 * =============================================================================
 * VENDOR RESOURCE REQUEST RETRIEVAL ROUTES
 * =============================================================================
 */

/**
 * GET /api/v1/vendor/requests
 * @requires VENDOR_MANAGER role
 */
router.get(
  "/",
  authenticateUser as RequestHandler,
  authorizeRole("VENDOR_MANAGER") as RequestHandler,
  fetchRequestData as any
);

export default router;
