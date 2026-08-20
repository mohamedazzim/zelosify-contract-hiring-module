/**
 * @fileoverview Unit tests for the BUSINESS_USER digital initiative handler.
 * Covers AJV validation, tenant/user context, and DB persistence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    digitalInitiative: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

import { createDigitalInitiative } from "@/controllers/form/initiativeRequestController.js";

function mockReq(overrides = {}) {
  return {
    user: { id: "user-1", tenant: { tenantId: "tenant-1" } },
    body: {},
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const validBody = {
  initiativeTitle: "Cloud Migration",
  businessRationale: "Reduce infra cost",
  enterpriseResourceCount: 3,
  resourceDuration: 6,
  successCriteria: "Cut cloud spend by 30%",
  timeline: "Q1-Q2 2026",
  additionalComments: "High priority",
};

describe("createDigitalInitiative (BUSINESS_USER)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when required fields are missing", async () => {
    const req = mockReq({ body: { initiativeTitle: "X" } });
    const res = mockRes();
    await createDigitalInitiative(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when tenant context is missing", async () => {
    const req = mockReq({ user: { id: "user-1", tenant: {} }, body: validBody });
    const res = mockRes();
    await createDigitalInitiative(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("persists a tenant-scoped initiative and returns 201 with request identifier", async () => {
    mockPrisma.digitalInitiative.create.mockResolvedValue({ id: "di-1" });

    const req = mockReq({ body: validBody });
    const res = mockRes();
    await createDigitalInitiative(req, res);

    expect(mockPrisma.digitalInitiative.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          userId: "user-1",
          initiativeTitle: "Cloud Migration",
          enterpriseResourceCount: 3,
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toContain("created successfully");
    expect(payload.requestIdentifier).toBeTruthy();
  });
});
