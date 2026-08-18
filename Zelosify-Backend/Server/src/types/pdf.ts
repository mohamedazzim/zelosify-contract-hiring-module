/**
 * File listing response
 */
export interface FileListResponse {
  /** Array of file objects */
  files: Array<{
    /** File key/path */
    key: string;
    /** Last modified timestamp */
    lastModified: Date;
    /** File size in bytes */
    size: number;
  }>;
}
