import type { Request, Response } from "express";
import prisma from "../../../../config/prisma/prisma.js";

/**
 * Fetch paginated vendor resource requests scoped to the authenticated
 * VENDOR_MANAGER's tenant. Enforces tenant isolation on every query.
 */
export async function fetchRequestData(req: Request, res: Response) {
  try {
    const tenantId = (req as any).user?.tenant?.tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string || "10", 10)));
    const skip = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const where = {
      tenantId,
      ...(status ? { status } : {}),
    };

    const [requests, total] = await Promise.all([
      prisma.vendorRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          requestIdentifier: true,
          title: true,
          description: true,
          requestedSkills: true,
          contractType: true,
          location: true,
          experienceMin: true,
          experienceMax: true,
          resourceCount: true,
          status: true,
          vendorManagerId: true,
          createdAt: true,
        },
      }),
      prisma.vendorRequest.count({ where }),
    ]);

    return res.status(200).json({
      status: "success",
      data: requests,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err: any) {
    if (err.code === "P2025") {
      // Prisma record not found
      return res.status(404).json({ message: "Data not found" });
    }
    console.error("Unknown error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
