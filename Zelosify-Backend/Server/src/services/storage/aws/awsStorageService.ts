// awsStorageService.ts

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import * as dotenv from "dotenv";
import { StorageService } from "../storageService.js";

dotenv.config();

export class AwsStorageService extends StorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    super();

    const region = process.env.S3_AWS_REGION;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucketName = process.env.S3_BUCKET_NAME;

    if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
      throw new Error("Missing required AWS S3 configuration");
    }

    // S3_ENDPOINT allows local MinIO/LocalStack in dev; falls back to real AWS
    const endpoint = process.env.S3_ENDPOINT || ("https://s3." + region + ".amazonaws.com");

    this.s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      endpoint,
      forcePathStyle: true,
      // AWS SDK v3.700+ defaults to adding x-amz-checksum-* query params to
      // presigned URLs (WHEN_SUPPORTED). MinIO validates those checksums and
      // rejects the placeholder value, causing SignatureDoesNotMatch. Restore
      // the legacy behavior: only send checksums when the caller requires them.
      requestChecksumCalculation: "WHEN_REQUIRED",
    });

    this.bucket = bucketName;

    console.log("[AWS S3] Initialized with:", {
      region,
      bucket: bucketName,
      endpoint,
      hasCredentials: !!accessKeyId && !!secretAccessKey,
    });
  }

  async getObjectURL(key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600,
        signableHeaders: new Set(["host"]),
      });
    } catch (error) {
      console.error("[AWS S3] Error generating get URL:", error);
      throw error;
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    try {
      console.log("[AWS S3] Getting object stream for:", { bucket: this.bucket, key });
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const response = await this.s3Client.send(command);
      if (!response.Body) throw new Error("No body returned from S3 object");
      const body = response.Body;
      if (body instanceof Readable) return body;
      return Readable.fromWeb(body as any);
    } catch (error) {
      console.error("[AWS S3] Error getting object stream:", error);
      throw error;
    }
  }

  async putObject(
    key: string,
    file: Buffer | Uint8Array | Blob | string,
    contentType = "application/pdf"
  ): Promise<{ message: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket, Key: key, Body: file, ContentType: contentType,
      });
      await this.s3Client.send(command);
      return { message: "File uploaded successfully" };
    } catch (error) {
      console.error("[AWS S3] Error uploading file:", error);
      throw error;
    }
  }

  async listObjects(prefix: string): Promise<any[]> {
    try {
      const command = new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix });
      const response = await this.s3Client.send(command);
      return response.Contents || [];
    } catch (error) {
      console.error("[AWS S3] Error listing objects:", error);
      throw error;
    }
  }

  async getUploadURL(key: string, contentType = "application/pdf"): Promise<string> {
    try {
      console.log("[AWS S3] Generating upload URL for:", {
        bucket: this.bucket, key, contentType, region: process.env.S3_AWS_REGION,
      });
      const command = new PutObjectCommand({
        Bucket: this.bucket, Key: key, ContentType: contentType,
      });
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: 3600,
        signableHeaders: new Set(["host"]),
      });
      console.log("[AWS S3] Generated upload URL successfully");
      return url;
    } catch (error) {
      console.error("[AWS S3] Error generating upload URL:", error);
      throw error;
    }
  }
}
