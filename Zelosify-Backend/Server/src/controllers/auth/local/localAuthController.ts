import { register as registerImpl } from "./register/localRegister.js";
import { verifyLogin as verifyLoginImpl } from "./login/localLogin.js";
import { verifyTOTP as verifyTOTPImpl } from "./login/verifyTOTP.js";
import { Request, Response, NextFunction } from "express";

/**
 * Handles user registration with error handling.
 * Accepts Express next function for middleware compatibility.
 * @param req Express request
 * @param res Express response
 * @param next Express next function
 */
export const register = async (
  req: Request,
  res: Response,
  next?: NextFunction
) => {
  try {
    // Provide a no-op next if not supplied
    const safeNext: NextFunction = next || (() => {});
    await registerImpl(req, res, safeNext);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

/**
 * Handles user login with error handling.
 * @param req Express request
 * @param res Express response
 */
export const verifyLogin = async (req: Request, res: Response) => {
  try {
    await verifyLoginImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

/**
 * Handles TOTP verification with error handling.
 * @param req Express request
 * @param res Express response
 */
export const verifyTOTP = async (req: Request, res: Response) => {
  try {
    await verifyTOTPImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};
