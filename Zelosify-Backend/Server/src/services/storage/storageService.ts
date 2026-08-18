// abstract class
import { Readable } from "stream";

export abstract class StorageService {
  abstract getObjectURL(key: string): Promise<string>;

  abstract getObjectStream(key: string): Promise<Readable>;

  abstract putObject(
    key: string,
    file: Buffer | Uint8Array | Blob | string,
    contentType?: string
  ): Promise<{ message: string }>;

  abstract listObjects(prefix: string): Promise<any[]>;

  abstract getUploadURL(key: string): Promise<string>;
}
