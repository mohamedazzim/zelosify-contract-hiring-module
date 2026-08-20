import { describe, it, expect, vi } from "vitest";
import { Readable } from "stream";
import AdmZip from "adm-zip";
import {
  decodeXmlEntities,
  detectFormatFromS3Key,
  DocumentParsingError,
  extractTextFromPptxBuffer,
  FileSizeExceededError,
  parseResumeDocument,
  streamToBuffer,
  UnsupportedFileFormatError,
} from "@/services/ai/tools/documentParser.js";
import * as storageFactory from "@/services/storage/storageFactory.js";

describe("Resume Document Parser Tool", () => {
  describe("Format Detection", () => {
    it("detects PDF format from file extension", () => {
      expect(detectFormatFromS3Key("tenant/opening/123_resume.pdf")).toBe("PDF");
      expect(detectFormatFromS3Key("resume.PDF")).toBe("PDF");
    });

    it("detects PPTX format from file extension", () => {
      expect(detectFormatFromS3Key("tenant/opening/123_presentation.pptx")).toBe("PPTX");
      expect(detectFormatFromS3Key("slides.PPTX")).toBe("PPTX");
    });

    it("throws UnsupportedFileFormatError for unsupported extensions", () => {
      expect(() => detectFormatFromS3Key("resume.docx")).toThrow(UnsupportedFileFormatError);
      expect(() => detectFormatFromS3Key("resume.txt")).toThrow(UnsupportedFileFormatError);
      expect(() => detectFormatFromS3Key("script.exe")).toThrow(UnsupportedFileFormatError);
    });
  });

  describe("XML Entity Decoding", () => {
    it("decodes standard and numerical XML entities", () => {
      const xml = "Senior &amp; Lead &lt;Engineer&gt; &quot;Specialist&apos; &#65;&#66;&#x43;";
      expect(decodeXmlEntities(xml)).toBe("Senior & Lead <Engineer> \"Specialist' ABC");
    });
  });

  describe("streamToBuffer", () => {
    it("converts readable stream to complete Buffer", async () => {
      const stream = Readable.from([Buffer.from("Hello "), Buffer.from("World")]);
      const buffer = await streamToBuffer(stream, 1024);
      expect(buffer.toString("utf8")).toBe("Hello World");
    });

    it("throws FileSizeExceededError when stream exceeds maximum allowed bytes", async () => {
      const stream = Readable.from([Buffer.from("1234567890"), Buffer.from("1234567890")]);
      await expect(streamToBuffer(stream, 15)).rejects.toThrow(FileSizeExceededError);
    });
  });

  describe("extractTextFromPptxBuffer", () => {
    it("extracts text from ppt/slides/slide*.xml entries in correct numerical order", () => {
      const zip = new AdmZip();
      
      const slide1Xml = `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld><p:spTree><p:sp><p:txBody>
            <a:p><a:r><a:t>Jane Doe - Senior React Developer</a:t></a:r></a:p>
            <a:p><a:r><a:t xml:space="preserve">Skills: React, TypeScript, Node.js</a:t></a:r></a:p>
          </p:txBody></p:sp></p:spTree></p:cSld>
        </p:sld>`;

      const slide2Xml = `<?xml version="1.0" encoding="UTF-8"?>
        <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld><p:spTree><p:sp><p:txBody>
            <a:p><a:r><a:t>Experience: 5 years at CloudCorp</a:t></a:r></a:p>
          </p:txBody></p:sp></p:spTree></p:cSld>
        </p:sld>`;

      zip.addFile("ppt/slides/slide2.xml", Buffer.from(slide2Xml, "utf8"));
      zip.addFile("ppt/slides/slide1.xml", Buffer.from(slide1Xml, "utf8"));
      zip.addFile("ppt/presentation.xml", Buffer.from("<p:presentation/>", "utf8"));

      const buffer = zip.toBuffer();
      const result = extractTextFromPptxBuffer(buffer);

      expect(result.slideCount).toBe(2);
      expect(result.text).toContain("Jane Doe - Senior React Developer");
      expect(result.text).toContain("Skills: React, TypeScript, Node.js");
      expect(result.text).toContain("Experience: 5 years at CloudCorp");
    });

    it("throws DocumentParsingError for malformed or non-zip buffer", () => {
      const badBuffer = Buffer.from("this is definitely not a zip file");
      expect(() => extractTextFromPptxBuffer(badBuffer)).toThrow(DocumentParsingError);
    });

    it("throws DocumentParsingError when zip has no PPT components", () => {
      const zip = new AdmZip();
      zip.addFile("something_else.txt", Buffer.from("hello"));
      const buffer = zip.toBuffer();

      expect(() => extractTextFromPptxBuffer(buffer)).toThrow(DocumentParsingError);
    });
  });

  describe("parseResumeDocument integration with mock storage", () => {
    it("successfully parses PPTX document via storage stream", async () => {
      const zip = new AdmZip();
      const slideXml = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:t>Candidate: Bob Smith</a:t>
        <a:t>Email: bob.smith@example.com</a:t>
        <a:t>Skills: Python, Django, PostgreSQL</a:t>
      </p:sld>`;
      zip.addFile("ppt/slides/slide1.xml", Buffer.from(slideXml, "utf8"));
      const zipBuffer = zip.toBuffer();

      const mockStorage = {
        getObjectStream: vi.fn().mockResolvedValue(Readable.from(zipBuffer)),
        getObjectURL: vi.fn(),
        putObject: vi.fn(),
        listObjects: vi.fn(),
        getUploadURL: vi.fn(),
      };

      vi.spyOn(storageFactory, "createStorageService").mockReturnValue(mockStorage as any);

      const result = await parseResumeDocument("tenant1/opening1/candidate.pptx");

      expect(result.format).toBe("PPTX");
      expect(result.pageCount).toBe(1);
      expect(result.rawTextSanitized).toContain("Candidate: Bob Smith");
      expect(result.rawTextSanitized).toContain("[EMAIL_REDACTED]");
      expect(result.rawTextSanitized).not.toContain("bob.smith@example.com");
      expect(result.truncated).toBe(false);
    });
  });
});
