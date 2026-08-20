import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import Ajv from "ajv";
import prisma from "../../../../config/prisma/prisma.js";

const ajv = new Ajv();

const createVendorRequestSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string" },
    requestedSkills: { type: "array", items: { type: "string" } },
    contractType: { type: "string" },
    location: { type: "string" },
    experienceMin: { type: "integer", minimum: 0 },
    experienceMax: { type: ["integer", "null"], minimum: 0 },
    resourceCount: { type: "integer", minimum: 1 },
  },
  required: ["title"],
  additionalProperties: false,
};

const validateCreateVendorRequest = ajv.compile(createVendorRequestSchema);

/**
 * Create a new vendor resource request scoped to the authenticated
 * VENDOR_MANAGER's tenant. Enforces tenant isolation.
 */
export async function createVendorRequest(req: Request, res: Response) {
  try {
    const tenantId = (req as any).user?.tenant?.tenantId;
    const userId = (req as any).user?.id;

    if (!tenantId) {
      return res.status(400).json({ message: "Tenant ID is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const valid = validateCreateVendorRequest(req.body);
    if (!valid) {
      return res.status(400).json({
        status: "error",
        message: "Validation failed",
        details: validateCreateVendorRequest.errors,
      });
    }

    const {
      title,
      description,
      requestedSkills,
      contractType,
      location,
      experienceMin,
      experienceMax,
      resourceCount,
    } = req.body;

    const requestIdentifier = `${Date.now()}-${uuidv4()}`;

    const created = await prisma.vendorRequest.create({
      data: {
        requestIdentifier,
        title,
        description,
        requestedSkills: requestedSkills || [],
        contractType,
        location,
        experienceMin: experienceMin ?? 0,
        experienceMax: experienceMax ?? null,
        resourceCount: resourceCount ?? 1,
        vendorManagerId: userId,
        tenantId,
      },
      select: {
        id: true,
        requestIdentifier: true,
        title: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      status: "success",
      message: "Vendor request created successfully",
      data: created,
    });
  } catch (err: any) {
    console.error("Unknown error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
}
