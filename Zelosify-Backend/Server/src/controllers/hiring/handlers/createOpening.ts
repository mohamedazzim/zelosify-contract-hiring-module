import type { Request, Response } from "express";
import prisma from "../../../config/prisma/prisma.js";
import { OpeningStatus } from "@prisma/client";

export async function createOpening(req: Request, res: Response) {
  try {
    const tenantId = req.user?.tenant?.tenantId;
    const managerId = req.user?.id;

    if (!tenantId || !managerId) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required with valid tenant and manager context",
      });
    }

    const {
      title,
      description,
      location,
      contractType,
      experienceMin,
      experienceMax,
      requiredSkills,
      expectedCompletionDate,
    } = req.body;

    // Validate required fields
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Title is required and must be a non-empty string",
      });
    }

    if (experienceMin === undefined || experienceMin === null || typeof experienceMin !== "number" || experienceMin < 0) {
      return res.status(400).json({
        status: "error",
        message: "Experience minimum is required and must be a non-negative number",
      });
    }

    // Validate optional fields
    if (experienceMax !== undefined && experienceMax !== null) {
      if (typeof experienceMax !== "number" || experienceMax < experienceMin) {
        return res.status(400).json({
          status: "error",
          message: "Experience maximum must be a number greater than or equal to minimum",
        });
      }
    }

    if (requiredSkills !== undefined && !Array.isArray(requiredSkills)) {
      return res.status(400).json({
        status: "error",
        message: "Required skills must be an array",
      });
    }

    // Create the opening
    const opening = await prisma.opening.create({
      data: {
        tenantId,
        title: title.trim(),
        description: description?.trim() || null,
        location: location?.trim() || null,
        contractType: contractType?.trim() || null,
        hiringManagerId: managerId,
        experienceMin,
        experienceMax: experienceMax || null,
        requiredSkills: requiredSkills || [],
        expectedCompletionDate: expectedCompletionDate ? new Date(expectedCompletionDate) : null,
        status: OpeningStatus.OPEN,
      },
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
        status: true,
      },
    });

    return res.status(201).json({
      status: "success",
      message: "Opening created successfully",
      data: opening,
    });
  } catch (error: any) {
    console.error("[createOpening] Error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error creating opening",
    });
  }
}
