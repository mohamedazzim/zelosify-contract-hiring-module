import type { Request, Response } from "express";
import prisma from "../../../config/prisma/prisma.js";
import { RecommendationStatus } from "@prisma/client";

function extractSafeFileName(s3Key: string): string {
  if (!s3Key) return "candidate_resume.pdf";
  const parts = s3Key.split("/");
  const rawFileName = parts[parts.length - 1] || "candidate_resume.pdf";
  // Strip leading timestamps if formatted as `<timestamp>_<actualName>`
  return rawFileName.replace(/^\d+_/, "");
}

export async function getOpeningProfiles(req: Request, res: Response) {
  try {
    const tenantId = req.user?.tenant?.tenantId;
    const managerId = req.user?.id;
    const openingId = req.params.id as string;

    if (!tenantId || !managerId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required with valid tenant and manager context",
      });
    }

    if (!openingId) {
      return res.status(400).json({
        status: "error",
        message: "Opening ID parameter is required",
      });
    }

    // 1. Enforce strict ownership & tenant isolation
    const opening = await prisma.opening.findFirst({
      where: {
        id: openingId,
        hiringManagerId: managerId,
        tenantId: tenantId,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    if (!opening) {
      return res.status(404).json({
        status: "error",
        message: "Opening not found or access denied",
      });
    }

    // 2. Pagination & Sorting
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const whereClause = {
      openingId: openingId,
      isDeleted: false,
    };

    const [total, profiles] = await Promise.all([
      prisma.hiringProfile.count({ where: whereClause }),
      prisma.hiringProfile.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
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
      }),
    ]);

    // 3. Format safe response representation
    const formattedProfiles = profiles.map((p) => {
      let safeReason = p.recommendationReason;
      if (p.recommendationStatus === RecommendationStatus.FAILED) {
        safeReason = "Automated AI recommendation could not be completed for this profile";
      }

      return {
        id: p.id,
        fileName: extractSafeFileName(p.s3Key),
        submittedAt: p.submittedAt,
        status: p.status,
        shortlistedAt: p.shortlistedAt,
        shortlistedBy: p.shortlistedBy,
        rejectedAt: p.rejectedAt,
        rejectedBy: p.rejectedBy,
        recommended: p.recommendationStatus === RecommendationStatus.COMPLETED ? p.recommended : null,
        recommendationStatus: p.recommendationStatus,
        recommendationScore: p.recommendationStatus === RecommendationStatus.COMPLETED ? p.recommendationScore : null,
        recommendationConfidence:
          p.recommendationStatus === RecommendationStatus.COMPLETED ? p.recommendationConfidence : null,
        recommendationReason: safeReason,
        recommendationLatencyMs: p.recommendationLatencyMs,
        recommendedAt: p.recommendedAt,
      };
    });

    return res.status(200).json({
      status: "success",
      data: {
        opening: {
          id: opening.id,
          title: opening.title,
          status: opening.status,
        },
        profiles: formattedProfiles,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error: any) {
    console.error("[getOpeningProfiles] Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error retrieving profiles",
    });
  }
}
