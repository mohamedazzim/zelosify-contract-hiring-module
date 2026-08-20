import type { Request, Response } from "express";
import Ajv from "ajv";
import prisma from "../../../../config/prisma/prisma.js";
import { OpeningStatus, ProfileStatus } from "@prisma/client";
import { recommendationQueue } from "../../../../services/ai/queue/recommendationQueue.js";
import { aiLogger } from "../../../../services/ai/logger/aiLogger.js";

const ajv = new Ajv();
const uploadSchema = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          s3Key: { type: "string", minLength: 1 },
          filename: { type: "string", minLength: 1 },
        },
        required: ["s3Key", "filename"],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ["files"],
  additionalProperties: false,
};

const validateUpload = ajv.compile(uploadSchema);

export async function uploadProfile(req: Request, res: Response) {
  const tenantId = req.user?.tenant?.tenantId;
  const userId = req.user?.id;
  const openingId = req.params.id as string;

  if (!tenantId) {
    return res.status(400).json({
      status: "error",
      message: "Tenant ID is required",
    });
  }

  if (!userId) {
    return res.status(400).json({
      status: "error",
      message: "User ID is required",
    });
  }

  const valid = validateUpload(req.body);
  if (!valid) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      details: validateUpload.errors,
    });
  }

  const { files } = req.body;

  // Validate opening exists, belongs to tenant, and accepts submissions
  const opening = await prisma.opening.findFirst({
    where: { id: openingId, tenantId },
    select: { status: true },
  });

  if (!opening) {
    return res.status(404).json({
      status: "error",
      message: "Opening not found",
    });
  }

  // ASSUMPTION: Only OPEN openings accept profile uploads.
  if (opening.status !== OpeningStatus.OPEN) {
    return res.status(409).json({
      status: "error",
      message: `Cannot submit profiles to a ${opening.status} opening. Only OPEN openings accept submissions.`,
    });
  }

  // Create hiringProfile records in a Prisma transaction — all succeed or all fail
  const profiles = await prisma.$transaction(async (tx) => {
    const created = await Promise.all(
      files.map((file: { s3Key: string; filename: string }) =>
        tx.hiringProfile.create({
          data: {
            openingId: openingId,
            s3Key: file.s3Key,
            uploadedBy: userId,
            status: ProfileStatus.SUBMITTED,
          },
        })
      )
    );
    return created;
  });

  // Enqueue recommendation jobs asynchronously AFTER transaction resolves
  // Never await or block the HTTP 201 response with LLM execution
  for (const p of profiles) {
    try {
      const enqueued = recommendationQueue.enqueue({
        profileId: p.id,
        openingId: openingId,
        tenantId: tenantId,
        s3Key: p.s3Key,
      });

      if (!enqueued) {
        aiLogger.warn("UPLOAD_QUEUE_ENQUEUE_SKIPPED", {
          profileId: p.id,
          openingId,
          tenantId,
        });
      }
    } catch (err: any) {
      aiLogger.error("UPLOAD_QUEUE_ENQUEUE_ERROR", {
        profileId: p.id,
        error: err.message,
      });
    }
  }

  return res.status(201).json({
    status: "success",
    message: `${profiles.length} profile(s) submitted successfully`,
    data: {
      profiles: profiles.map((p) => ({
        id: p.id,
        s3Key: p.s3Key,
        status: p.status,
        submittedAt: p.submittedAt,
      })),
    },
  });
}
