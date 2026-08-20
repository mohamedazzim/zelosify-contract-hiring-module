/**
 * @fileoverview Unit tests for VENDOR_MANAGER request handlers
 * Covers tenant isolation, pagination, creation validation, and RBAC wiring.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    vendorRequest: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

import { fetchRequestData } from "@/controllers/vendor/resourceRequest/requests/getVendorRequests.js";
import { createVendorRequest } from "@/controllers/vendor/resourceRequest/requests/createVendorRequest.js";

function mockReq(overrides = {}) {
  return {
    user: { id: "mgr-1", tenant: { tenantId: "tenant-1" } },
    query: {},
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

describe("getVendorRequests (VENDOR_MANAGER)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when tenant context is missing", async () => {
    const req = mockReq({ user: { id: "mgr-1", tenant: {} } });
    const res = mockRes();
    await fetchRequestData(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when user context is missing", async () => {
    const req = mockReq({ user: { id: null, tenant: { tenantId: "tenant-1" } } });
    const res = mockRes();
    await fetchRequestData(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("queries only the caller tenant and returns paginated data", async () => {
    const rows = [
      { id: "r1", requestIdentifier: "id-1", title: "React devs", status: "OPEN" },
    ];
    mockPrisma.vendorRequest.findMany.mockResolvedValue(rows);
    mockPrisma.vendorRequest.count.mockResolvedValue(1);

    const req = mockReq({ query: { page: "1", limit: "10" } });
    const res = mockRes();
    await fetchRequestData(req, res);

    expect(mockPrisma.vendorRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-1" }),
        skip: 0,
        take: 10,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        data: rows,
        pagination: expect.objectContaining({ page: 1, limit: 10, total: 1 }),
      })
    );
  });

  it("applies a status filter when provided", async () => {
    mockPrisma.vendorRequest.findMany.mockResolvedValue([]);
    mockPrisma.vendorRequest.count.mockResolvedValue(0);

    const req = mockReq({ query: { status: "OPEN" } });
    const res = mockRes();
    await fetchRequestData(req, res);

    expect(mockPrisma.vendorRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "OPEN" }) })
    );
  });
});

describe("createVendorRequest (VENDOR_MANAGER)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 on invalid payload (missing title)", async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();
    await createVendorRequest(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates a tenant-scoped vendor request with a request identifier", async () => {
    const created = {
      id: "vr-1",
      requestIdentifier: "req-1",
      title: "DevOps contractor",
      status: "OPEN",
      createdAt: new Date(),
    };
    mockPrisma.vendorRequest.create.mockResolvedValue(created);

    const req = mockReq({
      body: {
        title: "DevOps contractor",
        requestedSkills: ["AWS", "K8s"],
        resourceCount: 2,
      },
    });
    const res = mockRes();
    await createVendorRequest(req, res);

    expect(mockPrisma.vendorRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          vendorManagerId: "mgr-1",
          title: "DevOps contractor",
          requestedSkills: ["AWS", "K8s"],
          resourceCount: 2,
        }),
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
