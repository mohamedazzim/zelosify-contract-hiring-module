import type { Request, Response } from "express";
import prisma from "../../../../config/prisma/prisma.js";

export async function getOpeningById(req: Request, res: Response) {
  const tenantId = req.user?.tenant?.tenantId;
  const userId = req.user?.id;
  const openingId = req.params.id as string;

  if (!tenantId) {
    return res.status(400).json({
      status: "error",
      message: "Tenant ID is required",
    });
  }

  // Tenant isolation is enforced in the WHERE clause — a 404 is returned
  // without distinguishing between "belongs to another tenant" and "doesn't exist",
  // preventing information leakage.
  const opening = await prisma.opening.findFirst({
    where: { id: openingId, tenantId },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      contractType: true,
      hiringManagerId: true,
      experienceMin: true,
      experienceMax: true,
      postedDate: true,
      expectedCompletionDate: true,
      actionDate: true,
      status: true,
    },
  });

  if (!opening) {
    return res.status(404).json({
      status: "error",
      message: "Opening not found",
    });
  }

  // Count total profiles for this opening (informational)
  const profilesCount = await prisma.hiringProfile.count({
    where: { openingId },
  });

  // Separate lookup for hiring manager name — hiringManagerId is a plain String
  const hiringManager = await prisma.user.findUnique({
    where: { id: opening.hiringManagerId },
    select: { username: true, email: true, firstName: true, lastName: true },
  });

  const mgrName = hiringManager?.firstName || hiringManager?.lastName
    ? `${hiringManager?.firstName || ""} ${hiringManager?.lastName || ""}`.trim()
    : hiringManager?.username || hiringManager?.email || "Unknown";

  // Fetch only profiles uploaded by THIS vendor — other vendors' uploads
  // are never visible, per the RBAC requirement.
  const profiles = await prisma.hiringProfile.findMany({
    where: {
      openingId: openingId,
      uploadedBy: userId,
      isDeleted: false,
    },
    select: {
      id: true,
      s3Key: true,
      submittedAt: true,
      status: true,
      recommended: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  return res.status(200).json({
    status: "success",
    data: {
      opening: {
        id: opening.id,
        title: opening.title,
        description: opening.description,
        location: opening.location,
        contractType: opening.contractType,
        experienceMin: opening.experienceMin,
        experienceMax: opening.experienceMax,
        postedDate: opening.postedDate,
        expectedCompletionDate: opening.expectedCompletionDate,
        actionDate: opening.actionDate,
        status: opening.status,
        hiringManager: {
          name: mgrName,
        },
        profilesCount,
      },
      profiles,
    },
  });
}
