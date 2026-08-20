import type { Request, Response } from "express";
import prisma from "../../../config/prisma/prisma.js";
import { ProfileStatus } from "@prisma/client";

function extractSafeFileName(s3Key: string): string {
  if (!s3Key) return "candidate_resume.pdf";
  const parts = s3Key.split("/");
  const rawFileName = parts[parts.length - 1] || "candidate_resume.pdf";
  return rawFileName.replace(/^\d+_/, "");
}

export async function shortlistProfile(req: Request, res: Response) {
  try {
    const tenantId = req.user?.tenant?.tenantId;
    const managerId = req.user?.id;
    const profileId = parseInt(req.params.id as string, 10);

    if (!tenantId || !managerId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required with valid tenant and manager context",
      });
    }

    if (isNaN(profileId)) {
      return res.status(400).json({
        status: "error",
        message: "Valid numeric profile ID is required",
      });
    }

    // 1. Fetch profile with opening relation to verify tenant and manager ownership
    const profile = await prisma.hiringProfile.findUnique({
      where: { id: profileId },
      include: {
        opening: {
          select: {
            id: true,
            tenantId: true,
            hiringManagerId: true,
          },
        },
      },
    });

    if (
      !profile ||
      profile.isDeleted ||
      !profile.opening ||
      profile.opening.tenantId !== tenantId ||
      profile.opening.hiringManagerId !== managerId
    ) {
      return res.status(404).json({
        status: "error",
        message: "Profile not found or access denied",
      });
    }

    // 2. Enforce state transition rules: Cannot shortlist a REJECTED profile
    if (profile.status === ProfileStatus.REJECTED) {
      return res.status(409).json({
        status: "error",
        message: "Cannot shortlist a candidate that has already been rejected",
      });
    }

    // 3. Update in a single Prisma Transaction
    const updatedProfile = await prisma.$transaction(async (tx) => {
      return tx.hiringProfile.update({
        where: { id: profileId },
        data: {
          status: ProfileStatus.SHORTLISTED,
          shortlistedBy: managerId,
          shortlistedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
        },
        select: {
          id: true,
          s3Key: true,
          submittedAt: true,
          status: true,
          shortlistedAt: true,
          shortlistedBy: true,
          rejectedAt: true,
          rejectedBy: true,
          recommended: true,
          recommendationScore: true,
          recommendationReason: true,
          recommendationConfidence: true,
          recommendationVersion: true,
          recommendationLatencyMs: true,
          recommendedAt: true,
          recommendationStatus: true,
        },
      });
    });

    return res.status(200).json({
      status: "success",
      message: "Profile shortlisted successfully",
      data: {
        profile: {
          id: updatedProfile.id,
          fileName: extractSafeFileName(updatedProfile.s3Key),
          submittedAt: updatedProfile.submittedAt,
          status: updatedProfile.status,
          shortlistedAt: updatedProfile.shortlistedAt,
          shortlistedBy: updatedProfile.shortlistedBy,
          rejectedAt: updatedProfile.rejectedAt,
          rejectedBy: updatedProfile.rejectedBy,
          recommended: updatedProfile.recommended,
          recommendationStatus: updatedProfile.recommendationStatus,
          recommendationScore: updatedProfile.recommendationScore,
          recommendationConfidence: updatedProfile.recommendationConfidence,
          recommendationReason: updatedProfile.recommendationReason,
          recommendationLatencyMs: updatedProfile.recommendationLatencyMs,
          recommendedAt: updatedProfile.recommendedAt,
        },
      },
    });
  } catch (error: any) {
    console.error("[shortlistProfile] Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error shortlisting profile",
    });
  }
}
