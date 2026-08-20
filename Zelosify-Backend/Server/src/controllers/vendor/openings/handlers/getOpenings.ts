import type { Request, Response } from "express";
import prisma from "../../../../config/prisma/prisma.js";

export async function getOpenings(req: Request, res: Response) {
  const tenantId = req.user?.tenant?.tenantId;

  if (!tenantId) {
    return res.status(400).json({
      status: "error",
      message: "Tenant ID is required",
    });
  }

  const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string || "10", 10)));
  const skip = (page - 1) * limit;

  const [openings, total] = await Promise.all([
    prisma.opening.findMany({
      where: { tenantId },
      skip,
      take: limit,
      orderBy: { postedDate: "desc" },
      select: {
        id: true,
        title: true,
        location: true,
        contractType: true,
        postedDate: true,
        hiringManagerId: true,
      },
    }),
    prisma.opening.count({ where: { tenantId } }),
  ]);

  // Batch-fetch hiring manager names in a single query to avoid N+1.
  // hiringManagerId is a plain String (not a Prisma relation), so we
  // do a separate lookup rather than including it directly.
  const managerIds = [...new Set(openings.map((o) => o.hiringManagerId))];
  const managers = await prisma.user.findMany({
    where: { id: { in: managerIds } },
    select: { id: true, username: true, email: true, firstName: true, lastName: true },
  });
  const managerMap = new Map(managers.map((m) => [m.id, m]));

  const data = openings.map((o) => {
    const mgr = managerMap.get(o.hiringManagerId);
    const mgrName = mgr?.firstName || mgr?.lastName
      ? `${mgr?.firstName || ""} ${mgr?.lastName || ""}`.trim()
      : mgr?.username || mgr?.email || "Unknown";

    return {
      id: o.id,
      title: o.title,
      location: o.location,
      contractType: o.contractType,
      postedDate: o.postedDate,
      hiringManager: {
        id: o.hiringManagerId,
        name: mgrName,
      },
    };
  });

  return res.status(200).json({
    status: "success",
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
