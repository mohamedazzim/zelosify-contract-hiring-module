/**
 * Main export file for all type definitions
 * This file provides a centralized location for importing types across the application
 */

// Common types and interfaces used across controllers
export * from "./common.js";

// API-specific types for requests and responses
export * from "./api.js";

// Authentication and authorization types
export * from "./auth.js";

// Re-export the most commonly used types for convenience
export type {
  // Core request/response types
  AuthenticatedRequest,
  AuthenticatedUser,
  ApiResponse,

  // File and storage types

  // Contract types

  // Form types
  DigitalInitiativeRequest,
  DigitalInitiativeResponse,
  FormValidationError,
} from "./common.js";

export type {
  // API types
  ErrorResponse,
  SuccessResponse,
} from "./api.js";

export type {
  // Auth types
  RegisterRequest,
  RegisterResponse,
  LoginTOTPRequiredResponse,
  LoginSuccessResponse,
  TokenResponse,
  LoginCredentials,
} from "./auth.js";

export type {
  // Storage controller types
  FileListResponse,
} from "./pdf.js";

export type {
  // File upload types
  UploadMetadata,
  UploadToken,
  S3KeyConfig,
  PresignedUploadConfig,
  FileUploadRequest,
  FileUploadResult,
  TokenValidationOptions,
} from "./fileUpload.js";
