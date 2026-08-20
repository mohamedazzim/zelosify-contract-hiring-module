import type { Request, Response } from "express";
import prisma from "../../../../config/prisma/prisma.js";
import { createStorageService } from "../../../../services/storage/storageFactory.js";

export async function previewProfile(req: Request, res: Response) {
  const tenantId = req.user?.tenant?.tenantId;
  const userId = req.user?.id;
  const openingId = req.params.openingId as string;
  const profileId = parseInt(req.params.profileId as string, 10);

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

  if (isNaN(profileId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid profile ID",
    });
  }

  // Tenant isolation: opening must belong to vendor's tenant
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

  // Ownership check: profile must belong to this vendor and not be deleted
  const profile = await prisma.hiringProfile.findFirst({
    where: {
      id: profileId,
      openingId,
      uploadedBy: userId,
      isDeleted: false,
    },
    select: { id: true, s3Key: true },
  });

  if (!profile) {
    return res.status(404).json({
      status: "error",
      message: "Profile not found",
    });
  }

  const storageService = createStorageService();
  const presignedUrl = await storageService.getObjectURL(profile.s3Key);

  // DESIGN DECISION: Redirect-to-presigned-URL was chosen over a server-side
  // streaming proxy because authorization (tenant + ownership check) is fully
  // enforced before the redirect is issued, and the S3 URL itself is short-lived
  // (1hr expiry) and scoped to a single object. A streaming proxy remains the
  // stronger choice if this were deployed against a production S3 bucket with
  // strict CORS policy, and could be swapped in later without changing the
  // route contract.
  res.redirect(302, presignedUrl);
}
