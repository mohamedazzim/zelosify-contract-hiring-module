import { Router, type RequestHandler } from "express";
import { createDigitalInitiative } from "../../controllers/form/initiativeRequestController.js";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";

/**
 * Router for digital initiative request management endpoints
 */
const router = Router();

/**
 * =============================================================================
 * DIGITAL INITIATIVE CREATION ROUTES
 * =============================================================================
 */

/**
 * POST /api/v1/digital-initiatives
 * @requires BUSINESS_USER role
 */
router.post(
  "/",
  authenticateUser as RequestHandler,
  authorizeRole("BUSINESS_USER") as RequestHandler,
  (async (req, res, next) => {
    try {
      await createDigitalInitiative(req as any, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler
);

export default router;
