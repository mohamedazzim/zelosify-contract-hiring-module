import express from "express";
import vendorRequestRoutes from "./vendorRequestRoutes.js";
import vendorOpeningsRoutes from "./vendorOpeningsRoutes.js";

const router = express.Router();

/**
 * @route /api/v1/vendor/requests
 */
router.use("/requests", vendorRequestRoutes);

/**
 * @route /api/v1/vendor/openings
 */
router.use("/openings", vendorOpeningsRoutes);

export default router;
