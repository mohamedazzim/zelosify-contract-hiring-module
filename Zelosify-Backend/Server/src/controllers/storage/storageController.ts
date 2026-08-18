// src/controllers/storageController.ts
import { Response } from "express";
import { createStorageService } from "../../services/storage/storageFactory.js";
import { getUserFolderPath } from "../../utils/aws/getUserFolderPath.js";
import type {
  AuthenticatedRequest,
  FileListResponse,
  ApiResponse,
} from "../../types/typeIndex.js";

const storageService = createStorageService();

/**
 * List objects in user's storage folder
 * @param req - Authenticated request
 * @param res - Response with file list
 */
export const listOfObjects = async (
  req: AuthenticatedRequest,
  res: Response<FileListResponse | ApiResponse>
): Promise<void> => {
  try {
    if (!req.user) {
      const errorResponse: ApiResponse = {
        status: "error",
        error: "Unauthorized: User not logged in",
      };
      res.status(401).json(errorResponse);
      return;
    }
    const userId = req.user?.id;
    const tenantId = req.user?.tenant?.tenantId;
    const department = req.user?.department;

    // Get folder path
    const folderPath = getUserFolderPath(
      "contract-uploads",
      tenantId,
      department,
      userId
    );

    const objects = await storageService.listObjects(folderPath);
    const files = objects.map((f: any) => ({
      key: f.Key,
      lastModified: f.LastModified,
      size: f.Size,
    }));

    const response: FileListResponse = { files };
    res.status(200).json(response);
  } catch (error: any) {
    console.error("[List] Error listing objects:", error);
    const errorResponse: ApiResponse = {
      status: "error",
      error: error.message,
    };
    res.status(500).json(errorResponse);
  }
};
