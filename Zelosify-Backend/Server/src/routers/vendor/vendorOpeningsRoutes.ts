import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import {
  getOpenings,
  getOpeningById,
  presignUploadUrl,
  uploadProfile,
  deleteProfile,
  previewProfile,
} from "../../controllers/controllers.js";

const router = Router();

/**
 * =============================================================================
 * IT VENDOR OPENINGS ROUTES - CONTRACT MANAGEMENT MODULE
 * =============================================================================
 * All routes under /api/v1/vendor/openings require IT_VENDOR role
 */

/**
 * GET /api/v1/vendor/openings
 * List paginated openings for the authenticated vendor's tenant
 * @requires IT_VENDOR role
 */
router.get(
  "/",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  getOpenings as RequestHandler
);

/**
 * GET /api/v1/vendor/openings/:id
 * Get details of a single opening + vendor's own uploaded profiles
 * @requires IT_VENDOR role
 */
router.get(
  "/:id",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  getOpeningById as RequestHandler
);

/**
 * POST /api/v1/vendor/openings/:id/profiles/presign
 * Generate S3 presigned upload URLs for new profile submissions
 * @requires IT_VENDOR role
 */
router.post(
  "/:id/profiles/presign",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  presignUploadUrl as RequestHandler
);

/**
 * POST /api/v1/vendor/openings/:id/profiles/upload
 * Record submitted profiles (after frontend uploads to S3) via Prisma transaction
 * @requires IT_VENDOR role
 */
router.post(
  "/:id/profiles/upload",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  uploadProfile as RequestHandler
);

/**
 * PATCH /api/v1/vendor/openings/:openingId/profiles/:profileId
 * Soft-delete a profile (sets isDeleted = true)
 * @requires IT_VENDOR role
 */
router.patch(
  "/:openingId/profiles/:profileId",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  deleteProfile as RequestHandler
);

/**
 * GET /api/v1/vendor/openings/:openingId/profiles/:profileId/preview
 * Preview a profile file via backend redirect to presigned S3 URL
 * @requires IT_VENDOR role
 */
router.get(
  "/:openingId/profiles/:profileId/preview",
  authenticateUser as RequestHandler,
  authorizeRole("IT_VENDOR") as RequestHandler,
  previewProfile as RequestHandler
);

export default router;
