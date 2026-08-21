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
  private internalS3Client: S3Client;
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

    // S3_ENDPOINT: public endpoint for presigned URLs (browser-facing)
    const endpoint = process.env.S3_ENDPOINT || ("https://s3." + region + ".amazonaws.com");
    // S3_INTERNAL_ENDPOINT: internal endpoint for backend S3 operations (server-facing)
    // Falls back to S3_ENDPOINT if not set (local dev, real AWS, or when public endpoint is reachable)
    const internalEndpoint = process.env.S3_INTERNAL_ENDPOINT || endpoint;

    const clientConfig = {
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true as const,
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
    };

    // Client for presigned URLs (browser uploads/downloads)
    this.s3Client = new S3Client({ ...clientConfig, endpoint });
    // Client for backend operations (AI agent resume fetching, etc.)
    this.internalS3Client = new S3Client({ ...clientConfig, endpoint: internalEndpoint });

    this.bucket = bucketName;

    console.log("[AWS S3] Initialized with:", {
      region,
      bucket: bucketName,
      endpoint,
      internalEndpoint: internalEndpoint !== endpoint ? internalEndpoint : "(same as public)",
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
      const response = await this.internalS3Client.send(command);
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
      await this.internalS3Client.send(command);
      return { message: "File uploaded successfully" };
    } catch (error) {
      console.error("[AWS S3] Error uploading file:", error);
      throw error;
    }
  }

  async listObjects(prefix: string): Promise<any[]> {
    try {
      const command = new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix });
      const response = await this.internalS3Client.send(command);
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
