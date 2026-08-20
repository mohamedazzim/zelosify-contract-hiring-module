import { Request, Response } from "express";
import { getOpenings as getOpeningsImpl } from "./handlers/getOpenings.js";
import { getOpeningById as getOpeningByIdImpl } from "./handlers/getOpeningById.js";
import { presignUploadUrl as presignUploadUrlImpl } from "./handlers/presignUploadUrl.js";
import { uploadProfile as uploadProfileImpl } from "./handlers/uploadProfile.js";
import { deleteProfile as deleteProfileImpl } from "./handlers/deleteProfile.js";
import { previewProfile as previewProfileImpl } from "./handlers/previewProfile.js";

/**
 * Handles IT Vendor opening endpoints with error handling and response formatting.
 * @param req Express request
 * @param res Express response
 */
export const getOpenings = async (req: Request, res: Response) => {
  try {
    await getOpeningsImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

export const getOpeningById = async (req: Request, res: Response) => {
  try {
    await getOpeningByIdImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

export const presignUploadUrl = async (req: Request, res: Response) => {
  try {
    await presignUploadUrlImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

export const uploadProfile = async (req: Request, res: Response) => {
  try {
    await uploadProfileImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

export const deleteProfile = async (req: Request, res: Response) => {
  try {
    await deleteProfileImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

export const previewProfile = async (req: Request, res: Response) => {
  try {
    await previewProfileImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};
