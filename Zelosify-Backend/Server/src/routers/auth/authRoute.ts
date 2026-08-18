// src/routers/auth/authRoute.ts
import { Router } from "express";
import localAuthRoutes from "./local/localAuthRoutes.js";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import { getUserDetails } from "../../controllers/controllers.js";

/**
 * Main authentication router that combines all authentication modules
 * Organizes routes into logical groups for better maintainability
 */
const router = Router();

/**
 * =============================================================================
 * ROUTE MODULE REGISTRATION
 * =============================================================================
 */

/**
 * Normal authentication routes (register, login, logout, secure endpoints)
 * Handles traditional username/password authentication and protected routes
 */
router.use("/", localAuthRoutes);

/**
 * Retrives user information and profile management
 * This module handles user profile data retrieval and updates
 */
router.get("/user", authenticateUser, getUserDetails);

export default router;
