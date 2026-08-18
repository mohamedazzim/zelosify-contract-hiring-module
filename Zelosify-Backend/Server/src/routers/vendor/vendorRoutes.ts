import express from "express";
import vendorRequestRoutes from "./vendorRequestRoutes.js";

const router = express.Router();

/**
 * @route /vendor/requests
 */
router.use("/requests", vendorRequestRoutes);

export default router;
