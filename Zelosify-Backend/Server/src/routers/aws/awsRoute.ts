// src/routes/awsRoutes.ts

import express from "express";
import { listOfObjects } from "../../controllers/controllers.js";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";

const router = express.Router();

/**
 * =============================================================================
 * AWS S3 FILE MANAGEMENT ROUTES
 * =============================================================================
 */

// GET /api/v1/aws/list - List all objects stored in the S3 bucket
router.get("/list", authenticateUser, listOfObjects as any);

export default router;
