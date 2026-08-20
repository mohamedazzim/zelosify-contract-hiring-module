import type { Request, Response } from "express";
import prisma from "../../../../config/prisma/prisma.js";

export async function deleteProfile(req: Request, res: Response) {
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

  // Ownership check: profile must belong to this vendor and not be already deleted
  const profile = await prisma.hiringProfile.findFirst({
    where: {
      id: profileId,
      openingId,
      uploadedBy: userId,
      isDeleted: false,
    },
    select: { id: true },
  });

  if (!profile) {
    return res.status(404).json({
      status: "error",
      message: "Profile not found",
    });
  }

  await prisma.hiringProfile.update({
    where: { id: profileId },
    data: { isDeleted: true },
  });

  return res.status(200).json({
    status: "success",
    message: "Profile deleted successfully",
  });
}
