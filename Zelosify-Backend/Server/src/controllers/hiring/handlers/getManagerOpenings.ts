import type { Request, Response } from "express";
import prisma from "../../../config/prisma/prisma.js";

export async function getManagerOpenings(req: Request, res: Response) {
  try {
    const tenantId = req.user?.tenant?.tenantId;
    const managerId = req.user?.id;

    if (!tenantId || !managerId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required with valid tenant and manager context",
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const whereClause = {
      hiringManagerId: managerId,
      tenantId: tenantId,
    };

    const [total, openings] = await Promise.all([
      prisma.opening.count({ where: whereClause }),
      prisma.opening.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: [{ postedDate: "desc" }, { id: "desc" }],
        select: {
          id: true,
          title: true,
          description: true,
          location: true,
          contractType: true,
          experienceMin: true,
          experienceMax: true,
          requiredSkills: true,
          postedDate: true,
          expectedCompletionDate: true,
          actionDate: true,
          status: true,
          _count: {
            select: {
              hiringProfiles: {
                where: {
                  isDeleted: false,
                },
              },
            },
          },
        },
      }),
    ]);

    const formattedOpenings = openings.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      location: o.location,
      contractType: o.contractType,
      experienceMin: o.experienceMin,
      experienceMax: o.experienceMax,
      requiredSkills: o.requiredSkills,
      postedDate: o.postedDate,
      expectedCompletionDate: o.expectedCompletionDate,
      actionDate: o.actionDate,
      status: o.status,
      profilesCount: o._count.hiringProfiles,
    }));

    return res.status(200).json({
      status: "success",
      data: {
        openings: formattedOpenings,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error: any) {
    console.error("[getManagerOpenings] Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error retrieving openings",
    });
  }
}
