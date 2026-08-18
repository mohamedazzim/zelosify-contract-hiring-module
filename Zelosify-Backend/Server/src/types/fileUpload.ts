/**
 * Interface for upload metadata that gets encrypted into tokens
 */
export interface UploadMetadata {
  /** S3 key where the file will be stored */
  key: string;
  /** Presigned upload URL */
  url: string;
  /** Sanitized filename */
  filename: string;
  /** Tenant ID for isolation */
  tenantId: string;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Additional custom metadata fields */
  customFields?: Record<string, any>;
}

/**
 * Interface for upload token response
 */
export interface UploadToken {
  /** Original sanitized filename */
  filename: string;
  /** Encrypted upload token containing metadata */
  uploadToken: string;
  /** Endpoint URL for uploading files */
  uploadEndpoint: string;
}

/**
 * Configuration for S3 key generation
 */
export interface S3KeyConfig {
  /** Base path segments for the S3 key */
  pathSegments: string[];
  /** Whether to include timestamp in the filename */
  includeTimestamp?: boolean;
  /** Custom prefix for the filename */
  filenamePrefix?: string;
}

/**
 * Configuration for presigned URL generation
 */
export interface PresignedUploadConfig {
  /** S3 key configuration */
  s3KeyConfig: S3KeyConfig;
  /** Tenant ID for isolation */
  tenantId: string;
  /** Upload endpoint path template */
  uploadEndpoint: string;
  /** Token expiry duration in milliseconds (default: 5 minutes) */
  expiryDuration?: number;
  /** Additional custom metadata to include in encrypted token */
  customMetadata?: Record<string, any>;
}

/**
 * Interface for file upload request
 */
export interface FileUploadRequest {
  /** The file buffer to upload */
  fileBuffer: Buffer;
  /** The file's MIME type */
  mimeType: string;
  /** The encrypted upload token */
  uploadToken: string;
}

/**
 * Interface for the upload result
 */
export interface FileUploadResult {
  /** The S3 key where the file was stored */
  key: string;
  /** The original filename */
  filename: string;
  /** Optional custom fields provided during token generation */
  customFields?: Record<string, any>;
  /** The success status of the upload */
  success: boolean;
  /** Error message if upload failed */
  errorMessage?: string;
}

/**
 * Interface for token validation options
 */
export interface TokenValidationOptions {
  /** Additional validation checks for the token */
  validateTokenFn?: (metadata: any) => {
    isValid: boolean;
    errorMessage?: string;
  };
}
