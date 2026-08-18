import { encrypt } from "../../utils/encryption/encryption.js";
import { sanitizeFilename } from "../../helpers/vendorRequestValidation.js";
import {
  PresignedUploadConfig,
  UploadMetadata,
  UploadToken,
} from "../../types/typeIndex.js";

/**
 * Service for generating encrypted presigned upload URLs
 *
 * This service provides a flexible way to generate secure upload tokens with
 * encrypted metadata for file uploads to cloud storage. It supports:
 * - Configurable S3 key patterns for different use cases
 * - Tenant isolation with custom path structures
 * - Custom metadata fields for application-specific data
 * - Flexible upload endpoint configuration
 */
export class FilePresignService {
  /** Default token expiry duration (5 minutes) */
  private static readonly DEFAULT_EXPIRY_DURATION = 5 * 60 * 1000;

  /**
   * Generate encrypted upload tokens for multiple files
   *
   * Creates presigned URLs for each filename and encrypts the metadata
   * into secure tokens that can be used by the frontend for uploads.
   *
   * @param filenames - Array of filenames to generate tokens for
   * @param config - Configuration for upload token generation
   * @returns Promise resolving to array of upload tokens
   * @throws Error if storage service fails or filename processing fails
   */
  public async generateUploadTokens(
    filenames: string[],
    config: PresignedUploadConfig
  ): Promise<UploadToken[]> {
    // Import storage service dynamically to avoid circular dependencies
    const { createStorageService } = await import(
      "../storage/storageFactory.js"
    );
    const storageService = createStorageService();

    const expiryDuration =
      config.expiryDuration || FilePresignService.DEFAULT_EXPIRY_DURATION;

    // Generate upload tokens for all files in parallel
    const uploadTokens = await Promise.all(
      filenames.map(async (filename: string) => {
        const uploadToken = await this.generateSingleUploadToken(
          filename,
          config,
          storageService,
          expiryDuration
        );
        return uploadToken;
      })
    );

    return uploadTokens;
  }

  /**
   * Generate upload token for a single file
   *
   * @private
   * @param filename - Original filename
   * @param config - Upload configuration
   * @param storageService - Storage service instance
   * @param expiryDuration - Token expiry duration in milliseconds
   * @returns Promise resolving to upload token
   * @throws Error if URL generation or encryption fails
   */
  private async generateSingleUploadToken(
    filename: string,
    config: PresignedUploadConfig,
    storageService: any,
    expiryDuration: number
  ): Promise<UploadToken> {
    try {
      // Create unique S3 key with tenant isolation and timestamp
      const key = this.generateUniqueKey(filename, config);
      const sanitizedFilename = sanitizeFilename(filename);

      // Generate presigned upload URL
      const uploadUrl = await storageService.getUploadURL(key);

      // Create upload metadata
      const uploadMetadata: UploadMetadata = {
        key,
        url: uploadUrl,
        filename: sanitizedFilename,
        tenantId: config.tenantId,
        expiresAt: Date.now() + expiryDuration,
        ...(config.customMetadata && { customFields: config.customMetadata }),
      };

      // Encrypt the metadata into a secure token
      const encryptedToken = encrypt(JSON.stringify(uploadMetadata));

      return {
        filename: sanitizedFilename,
        uploadToken: encryptedToken,
        uploadEndpoint: config.uploadEndpoint,
      };
    } catch (error) {
      console.error(`Error generating presigned URL for ${filename}:`, error);
      throw new Error(`Failed to generate upload URL for ${filename}`);
    }
  }

  /**
   * Generate unique S3 key with flexible path configuration
   *
   * Creates a hierarchical key structure based on the provided path segments
   * and optional timestamp/prefix configuration.
   *
   * @private
   * @param filename - Original filename
   * @param config - Upload configuration with S3 key settings
   * @returns Unique S3 key
   */
  private generateUniqueKey(
    filename: string,
    config: PresignedUploadConfig
  ): string {
    const sanitizedFilename = sanitizeFilename(filename);
    const { s3KeyConfig } = config;

    // Build the path from configured segments
    const pathParts = [...s3KeyConfig.pathSegments];

    // Generate filename with optional timestamp and prefix
    let finalFilename = sanitizedFilename;

    if (s3KeyConfig.includeTimestamp) {
      const timestamp = Date.now();
      finalFilename = `${timestamp}_${sanitizedFilename}`;
    }

    if (s3KeyConfig.filenamePrefix) {
      finalFilename = `${s3KeyConfig.filenamePrefix}${finalFilename}`;
    }

    // Combine all parts
    pathParts.push(finalFilename);

    return pathParts.join("/");
  }
}
