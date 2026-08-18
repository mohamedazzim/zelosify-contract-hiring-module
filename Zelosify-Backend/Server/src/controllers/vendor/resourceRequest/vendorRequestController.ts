import { fetchRequestData as fetchRequestDataImpl } from "./requests/getVendorRequests.js";
// import { updateVendorRequest as updateVendorRequestImpl } from "./requests/updateVendorRequest.js";
// import { generatePresignedUrls as generatePresignedUrlsImpl } from "./attachment/generatePresignedUrls.js";
// import { uploadAttachment as uploadAttachmentImpl } from "./attachment/uploadAttachment.js";
import { Request, Response } from "express";

/**
 * Handles vendor requests with error handling and response formatting.
 * @param req Express request
 * @param res Express response
 */
export const fetchRequestData = async (req: Request, res: Response) => {
  try {
    await fetchRequestDataImpl(req, res);
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: "Internal server error",
      details: (error as Error).message,
    });
  }
};

// export const updateVendorRequest = async (req: Request, res: Response) => {
//   try {
//     await updateVendorRequestImpl(req, res);
//   } catch (error) {
//     res.status(500).json({
//       status: "error",
//       error: "Internal server error",
//       details: (error as Error).message,
//     });
//   }
// };

// export const generatePresignedUrls = async (req: Request, res: Response) => {
//   try {
//     await generatePresignedUrlsImpl(req, res);
//   } catch (error) {
//     res.status(500).json({
//       status: "error",
//       error: "Internal server error",
//       details: (error as Error).message,
//     });
//   }
// };

// export const uploadAttachment = async (req: Request, res: Response) => {
//   try {
//     await uploadAttachmentImpl(req, res);
//   } catch (error) {
//     res.status(500).json({
//       status: "error",
//       error: "Internal server error",
//       details: (error as Error).message,
//     });
//   }
// };
