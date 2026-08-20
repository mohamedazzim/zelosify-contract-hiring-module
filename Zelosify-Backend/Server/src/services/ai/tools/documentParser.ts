// src/services/ai/tools/documentParser.ts

import { Readable } from "stream";
import AdmZip from "adm-zip";
import pdfExtract from "pdf-extraction";
import { createStorageService } from "../../storage/storageFactory.js";
import { sanitizeResumeText } from "../security/promptSanitizer.js";
import {
  DocumentFormat,
  DocumentParserOptions,
  ParsedResumeOutput,
} from "../types/aiTypes.js";

const DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_CHARS = 10000;

export class UnsupportedFileFormatError extends Error {
  constructor(format: string) {
    super(`Unsupported resume document format: "${format}". Only PDF and PPTX are supported.`);
    this.name = "UnsupportedFileFormatError";
  }
}

export class FileSizeExceededError extends Error {
  constructor(size: number, limit: number) {
    super(`File size (${size} bytes) exceeds maximum allowable limit (${limit} bytes).`);
    this.name = "FileSizeExceededError";
  }
}

export class DocumentParsingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DocumentParsingError";
  }
}

/**
 * Converts a readable stream to a Buffer, enforcing a strict maximum byte limit.
 */
export async function streamToBuffer(
  stream: Readable,
  maxSizeBytes: number = DEFAULT_MAX_FILE_SIZE_BYTES
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of stream) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bufferChunk.length;

    if (totalBytes > maxSizeBytes) {
      throw new FileSizeExceededError(totalBytes, maxSizeBytes);
    }
    chunks.push(bufferChunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Decodes standard XML entities without evaluating or executing XML.
 */
export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return "";
      }
    });
}

/**
 * Extracts slide text from a PPTX Buffer using AdmZip.
 * Extracts text from <a:t> nodes across all ppt/slides/slide*.xml files.
 */
export function extractTextFromPptxBuffer(buffer: Buffer): { text: string; slideCount: number } {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (err: any) {
    throw new DocumentParsingError("Malformed PPTX archive: unable to read ZIP structure", err);
  }

  const entries = zip.getEntries();
  const slideEntries = entries
    .filter((e) => !e.isDirectory && /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
    .sort((a, b) => {
      const numA = parseInt(a.entryName.match(/\d+/)![0], 10);
      const numB = parseInt(b.entryName.match(/\d+/)![0], 10);
      return numA - numB;
    });

  if (slideEntries.length === 0) {
    // If no slide*.xml found, check if there's any ppt/ presentation xml
    const anyPpt = entries.some((e) => e.entryName.startsWith("ppt/"));
    if (!anyPpt) {
      throw new DocumentParsingError("Malformed PPTX archive: missing presentation components");
    }
    return { text: "", slideCount: 0 };
  }

  const slideTexts: string[] = [];

  for (const slide of slideEntries) {
    const xmlContent = slide.getData().toString("utf8");
    // Extract text inside <a:t> or <a:t xml:space="..."> tags
    const textMatches = xmlContent.match(/<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>/gi) || [];
    const extractedWords = textMatches.map((tag) => {
      const inner = tag.replace(/<a:t(?:\s+[^>]*)?>/i, "").replace(/<\/a:t>/i, "");
      return decodeXmlEntities(inner);
    });

    if (extractedWords.length > 0) {
      slideTexts.push(extractedWords.join(" "));
    }
  }

  return {
    text: slideTexts.join("\n\n"),
    slideCount: slideEntries.length,
  };
}

/**
 * Extracts text from a PDF Buffer using pdf-extraction.
 */
export async function extractTextFromPdfBuffer(
  buffer: Buffer
): Promise<{ text: string; pageCount: number }> {
  try {
    const data = await pdfExtract(buffer);
    return {
      text: data.text || "",
      pageCount: data.numpages || 1,
    };
  } catch (err: any) {
    throw new DocumentParsingError("Failed to parse PDF document: invalid or corrupted PDF structure", err);
  }
}

/**
 * Detects the document format from the S3 key file extension.
 */
export function detectFormatFromS3Key(s3Key: string): DocumentFormat {
  const cleanKey = s3Key.split("?")[0].toLowerCase();
  if (cleanKey.endsWith(".pdf")) return "PDF";
  if (cleanKey.endsWith(".pptx")) return "PPTX";

  const extMatch = cleanKey.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : "unknown";
  throw new UnsupportedFileFormatError(ext);
}

/**
 * Main Document Parser Tool entrypoint.
 * Retrieves S3 object, converts to buffer, parses PDF/PPTX, sanitizes output.
 */
export async function parseResumeDocument(
  s3Key: string,
  options: DocumentParserOptions = {}
): Promise<ParsedResumeOutput> {
  const maxBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const maxChars = options.maxCharacterLimit ?? DEFAULT_MAX_CHARS;

  // 1. Detect format before reading to fail fast on invalid extensions
  const format = detectFormatFromS3Key(s3Key);

  // 2. Fetch object stream via storage service
  const storageService = createStorageService();
  const stream = await storageService.getObjectStream(s3Key);

  // 3. Convert stream to buffer with size enforcement
  const buffer = await streamToBuffer(stream, maxBytes);

  // 4. Extract raw text according to format
  let rawText = "";
  let pageCount = 1;

  if (format === "PDF") {
    const res = await extractTextFromPdfBuffer(buffer);
    rawText = res.text;
    pageCount = res.pageCount;
  } else if (format === "PPTX") {
    const res = extractTextFromPptxBuffer(buffer);
    rawText = res.text;
    pageCount = res.slideCount;
  }

  // 5. Sanitize, redact PII, and bound output length
  const sanitized = sanitizeResumeText(rawText, { maxCharacterLimit: maxChars });

  return {
    rawTextSanitized: sanitized.sanitizedText,
    pageCount,
    format,
    characterCount: sanitized.characterCount,
    truncated: sanitized.truncated,
  };
}
