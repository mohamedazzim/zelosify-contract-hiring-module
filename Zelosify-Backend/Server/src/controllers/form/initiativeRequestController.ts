import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import prisma from "../../config/prisma/prisma.js"; // Ensure your Prisma client is correctly configured
import Ajv from "ajv";
import type {
  AuthenticatedRequest,
  DigitalInitiativeRequest,
  DigitalInitiativeResponse,
  FormValidationError,
  ApiResponse,
} from "../../types/typeIndex.js";
// import { sendLogToLoki } from "../../services/logger/lokiLogger.js";

// Initialize AJV
const ajv = new Ajv();
// Define the JSON schema for validation with type properties and required fields
const initiativeSchema = {
  type: "object",
  properties: {
    initiativeTitle: { type: "string" },
    businessRationale: { type: "string" },
    enterpriseResourceCount: { type: "integer", minimum: 1 },
    resourceDuration: { type: "integer", minimum: 1 },
    successCriteria: { anyOf: [{ type: "string" }, { type: "object" }] },
    timeline: { anyOf: [{ type: "string" }, { type: "object" }] },
    additionalComments: { type: "string" },
  },
  required: [
    "initiativeTitle",
    "businessRationale",
    "enterpriseResourceCount",
    "resourceDuration",
    "successCriteria",
    "timeline",
  ],
  additionalProperties: false,
};

const validateInitiative = ajv.compile(initiativeSchema);

/**
 * Create a new digital initiative request
 * @param req - Express request with DigitalInitiativeRequest body
 * @param res - Express response with DigitalInitiativeResponse or error
 */
export const createDigitalInitiative = async (
  req: AuthenticatedRequest & { body: DigitalInitiativeRequest },
  res: Response<DigitalInitiativeResponse | FormValidationError | ApiResponse>
) => {
  // Validate the incoming JSON payload
  const valid = validateInitiative(req.body);
  if (!valid) {
    return res.status(400).json({
      error: "Validation failed",
      details: validateInitiative.errors,
    });
  }
  const {
    initiativeTitle,
    businessRationale,
    enterpriseResourceCount,
    resourceDuration,
    successCriteria,
    timeline,
    additionalComments,
  } = req.body;
  const tenant = req.user?.tenant;
  const userId = req.user?.id;
  // Validate required fields
  if (
    !initiativeTitle ||
    !businessRationale ||
    enterpriseResourceCount === undefined ||
    resourceDuration === undefined ||
    !successCriteria ||
    !timeline
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!tenant?.tenantId) {
    return res.status(400).json({ error: "Missing Tenant id!" });
  }
  if (!userId) {
    return res.status(400).json({ error: "Missing User id!" });
  }

  // Generate a dynamic request identifier
  const requestIdentifier = `${Date.now()}-${uuidv4()}`;

  // sendLogToLoki(`hello from initiative form `, {
  //   app: "mern-app",
  //   component: "node-backend",
  //   environment: "production",
  // });

  // Save the new initiative request with tenant/user details derived from the authenticated request
  // await prisma.digitalInitiativeRequest.create({
  //   data: {
  //     initiativeTitle,
  //     businessRationale,
  //     enterpriseResourceCount,
  //     resourceDuration,
  //     successCriteria,
  //     timeline,
  //     additionalComments,
  //     tenantId: tenant.tenantId,
  //     userId,
  //     requestIdentifier,
  //   },
  // });

  const response: DigitalInitiativeResponse = {
    requestIdentifier,
    message: "Digital initiative request created successfully",
  };

  return res.status(201).json(response);
};
