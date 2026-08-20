import type { Request, Response } from "express";
import Ajv from "ajv";
import { createStorageService } from "../../../../services/storage/storageFactory.js";
import { sanitizeFilename } from "../../../../helpers/vendorRequestValidation.js";
import prisma from "../../../../config/prisma/prisma.js";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const ajv = new Ajv();
const presignSchema = {
  type: "object",
  properties: {
    filenames: {
      type: "array",
      items: { type: "string", minLength: 1 },
      minItems: 1,
      maxItems: 10,
    },
  },
  required: ["filenames"],
  additionalProperties: false,
};

const validatePresign = ajv.compile(presignSchema);

function getMimeType(filename: string): string | null {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return EXTENSION_TO_MIME[ext] || null;
}

export async function presignUploadUrl(req: Request, res: Response) {
  const tenantId = req.user?.tenant?.tenantId;
  const openingId = req.params.id as string;

  if (!tenantId) {
    return res.status(400).json({
      status: "error",
      message: "Tenant ID is required",
    });
  }

  const valid = validatePresign(req.body);
  if (!valid) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      details: validatePresign.errors,
    });
  }

  const { filenames } = req.body;

  // Validate opening exists and belongs to the requester's tenant
  const opening = await prisma.opening.findFirst({
    where: { id: openingId, tenantId },
    select: { id: true },
  });

  if (!opening) {
    return res.status(404).json({
      status: "error",
      message: "Opening not found",
    });
  }

  // Validate MIME types — restrict to PDF/PPTX only
  const mimeTypes: string[] = [];
  for (const filename of filenames) {
    const mimeType = getMimeType(filename);
    if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({
        status: "error",
        message: `Invalid file type: ${filename}. Only PDF and PPTX files are allowed.`,
      });
    }
    mimeTypes.push(mimeType);
  }

  // Generate presigned URLs using the existing storage service
  const storageService = createStorageService();
  const timestamp = Date.now();

  const urls = await Promise.all(
    filenames.map(async (filename: string, idx: number) => {
      const mimeType = mimeTypes[idx];
      const key = `${tenantId}/${openingId}/${timestamp}_${sanitizeFilename(filename)}`;
      const uploadUrl = await storageService.getUploadURL(key, mimeType);

      return {
        filename,
        s3Key: key,
        url: uploadUrl,
        mimeType,
      };
    })
  );

  return res.status(200).json({
    status: "success",
    data: urls,
  });
}
