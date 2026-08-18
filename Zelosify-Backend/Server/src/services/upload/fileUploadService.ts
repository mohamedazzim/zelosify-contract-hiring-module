import { decrypt } from "../../utils/encryption/encryption.js";
import axios from "axios";
import {
  FileUploadRequest,
  FileUploadResult,
  TokenValidationOptions,
  UploadMetadata,
} from "../../types/typeIndex.js";

/**
 * Service for handling file uploads to S3 using presigned URLs
 *
 * This service decrypts upload tokens, validates them, and uploads files
 * to S3 using the presigned URLs contained in the tokens. It handles all
 * the common logic required for secure file uploads.
 */
export class FileUploadService {
  /**
   * Upload a file to S3 using a presigned URL from an encrypted token
   *
   * @param uploadRequest - The upload request containing file and token
   * @param options - Optional validation options
   * @returns Promise resolving to the upload result
   */
  public async uploadFile(
    uploadRequest: FileUploadRequest,
    options?: TokenValidationOptions
  ): Promise<FileUploadResult> {
    try {
      // Decrypt and validate the upload token
      const uploadMetadata = await this.decryptAndValidateToken(
        uploadRequest.uploadToken,
        options?.validateTokenFn
      );

      // Upload the file to S3 using the presigned URL
      await this.uploadToS3(
        uploadMetadata.url,
        uploadRequest.fileBuffer,
        uploadRequest.mimeType
      );

      // Return the upload result
      return {
        key: uploadMetadata.key,
        filename: uploadMetadata.filename,
        customFields: uploadMetadata.customFields,
        success: true,
      };
    } catch (error: any) {
      console.error("Error in file upload:", error.message);
      return {
        key: "",
        filename: "",
        success: false,
        errorMessage: error.message || "Unknown error during file upload",
      };
    }
  }

  /**
   * Decrypt and validate an upload token
   *
   * @private
   * @param uploadToken - The encrypted upload token
   * @param validateTokenFn - Optional custom validation function
   * @returns Promise resolving to the decrypted metadata
   * @throws Error if token is invalid, expired, or fails validation
   */
  private async decryptAndValidateToken(
    uploadToken: string,
    validateTokenFn?: (metadata: any) => {
      isValid: boolean;
      errorMessage?: string;
    }
  ): Promise<UploadMetadata> {
    try {
      // Decrypt the token
      const decryptedToken = decrypt(uploadToken);
      const uploadMetadata = JSON.parse(decryptedToken) as UploadMetadata;

      // Validate token expiry
      if (Date.now() > uploadMetadata.expiresAt) {
        throw new Error("Upload token has expired");
      }

      // Run custom validation if provided
      if (validateTokenFn) {
        const validationResult = validateTokenFn(uploadMetadata);

        if (!validationResult.isValid) {
          throw new Error(
            validationResult.errorMessage || "Invalid upload token"
          );
        }
      }

      return uploadMetadata;
    } catch (error: any) {
      console.error(
        "Error decrypting or validating upload token:",
        error.message
      );
      throw new Error(error.message || "Invalid upload token");
    }
  }

  /**
   * Upload a file to S3 using a presigned URL
   *
   * @private
   * @param presignedUrl - The presigned S3 URL
   * @param fileBuffer - The file buffer to upload
   * @param mimeType - The file's MIME type
   * @throws Error if S3 upload fails
   */
  private async uploadToS3(
    presignedUrl: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<void> {
    try {
      const uploadResponse = await axios.put(presignedUrl, fileBuffer, {
        headers: {
          "Content-Type": mimeType,
        },
        maxRedirects: 0, // Prevent following redirects
      });

      if (uploadResponse.status !== 200) {
        throw new Error(
          `S3 upload failed with status: ${uploadResponse.status}`
        );
      }
    } catch (error: any) {
      console.error("Error uploading file to S3:", error.message);
      throw new Error(error.message || "Failed to upload file to storage");
    }
  }
}
