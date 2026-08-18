import multer from "multer";

/**
 * Multer configuration for file uploads
 * Handles file validation, size limits, and storage configuration
 */

/**
 * Allowed MIME types for file uploads
 * Supports documents, presentations, images, and text files
 */
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/jpg",
] as const;

/**
 * File size limit in bytes (100MB)
 */
const FILE_SIZE_LIMIT = 100 * 1024 * 1024;

/**
 * Multer file filter function
 * Validates file types against allowed MIME types
 * @param req - Express request object
 * @param file - Multer file object
 * @param cb - Callback function
 */
const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only PDF, DOC, DOCX, PPT, PPTX, TXT, JPG, JPEG, PNG files are allowed."
      )
    );
  }
};

/**
 * Default multer configuration for file uploads
 * Uses memory storage for temporary file handling
 */
export const uploadConfig = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FILE_SIZE_LIMIT,
  },
  fileFilter,
});

/**
 * Export individual components for custom configurations
 */
export { ALLOWED_MIME_TYPES, FILE_SIZE_LIMIT, fileFilter };
