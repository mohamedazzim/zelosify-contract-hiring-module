import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { authorizeRole } from "../../middlewares/auth/authorizeMiddleware.js";
import {
  getManagerOpenings,
  getOpeningProfiles,
  shortlistProfile,
  rejectProfile,
  createOpening,
} from "../../controllers/hiring/hiringProfileController.js";

const router = Router();

/**
 * =============================================================================
 * HIRING MANAGER ROUTES - VACANCY & APPLICANT MANAGEMENT
 * =============================================================================
 */

// All routes require authentication and HIRING_MANAGER role
router.use(authenticateUser as RequestHandler);
router.use(authorizeRole("HIRING_MANAGER") as RequestHandler);

/**
 * GET /api/v1/hiring-manager/openings
 * Returns paginated openings assigned to the authenticated Hiring Manager.
 */
router.get("/openings", getManagerOpenings as RequestHandler);

/**
 * POST /api/v1/hiring-manager/openings
 * Creates a new opening for the authenticated Hiring Manager.
 */
router.post("/openings", createOpening as RequestHandler);

/**
 * GET /api/v1/hiring-manager/openings/:id/profiles
 * Returns paginated profiles for a specific opening owned by the Hiring Manager.
 */
router.get("/openings/:id/profiles", getOpeningProfiles as RequestHandler);

/**
 * POST /api/v1/hiring-manager/profiles/:id/shortlist
 * Transitions an applicant profile to SHORTLISTED.
 */
router.post("/profiles/:id/shortlist", shortlistProfile as RequestHandler);

/**
 * POST /api/v1/hiring-manager/profiles/:id/reject
 * Transitions an applicant profile to REJECTED.
 */
router.post("/profiles/:id/reject", rejectProfile as RequestHandler);

export default router;
