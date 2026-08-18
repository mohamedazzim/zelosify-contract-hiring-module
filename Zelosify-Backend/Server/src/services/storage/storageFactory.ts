import { AwsStorageService } from "./aws/awsStorageService.js";
import { StorageService } from "./storageService.js";

let storageServiceInstance: StorageService | null = null;

/**
 * Creates or returns the existing singleton storage service instance
 */
export const createStorageService = (): StorageService => {
  if (storageServiceInstance) {
    return storageServiceInstance;
  }

  const provider = process.env.STORAGE_PROVIDER || "aws";

  if (!provider) {
    throw new Error(
      "STORAGE_PROVIDER is not defined in the environment variables"
    );
  }

  switch (provider.toLowerCase()) {
    case "aws":
      storageServiceInstance = new AwsStorageService();
      break;

    default:
      throw new Error(`Unsupported storage provider: ${provider}`);
  }

  return storageServiceInstance;
};
