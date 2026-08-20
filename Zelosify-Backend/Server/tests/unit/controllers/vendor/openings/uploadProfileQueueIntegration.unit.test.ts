import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadProfile } from "@/controllers/vendor/openings/handlers/uploadProfile.js";
import { OpeningStatus } from "@prisma/client";

const { mockPrisma, mockEnqueue } = vi.hoisted(() => ({
  mockPrisma: {
    opening: { findFirst: vi.fn() },
    hiringProfile: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  mockEnqueue: vi.fn().mockReturnValue(true),
}));

vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

vi.mock("@/services/ai/queue/recommendationQueue.js", () => ({
  recommendationQueue: {
    enqueue: (...args: any[]) => mockEnqueue(...args),
    getStatus: vi.fn().mockReturnValue({ activeWorkers: 0, queuedJobs: 0, inFlightCount: 0 }),
  },
}));

vi.mock("@/services/ai/logger/aiLogger.js", () => ({
  aiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("Upload Profile Queue Dispatch (mocked Prisma)", () => {
  const opening = { id: "opening-1", tenantId: "tenant-1-uuid", status: OpeningStatus.OPEN };

  function createMockRes() {
    let statusCode = 0;
    let responseBody: any = null;
    const res: any = {
      status: vi.fn().mockImplementation((code: number) => {
        statusCode = code;
        return {
          json: vi.fn().mockImplementation((body: any) => {
            responseBody = body;
            return body;
          }),
        };
      }),
      json: vi.fn().mockImplementation((body: any) => {
        responseBody = body;
        return body;
      }),
    };
    return { res, getStatus: () => statusCode, getBody: () => responseBody };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.opening.findFirst.mockResolvedValue(opening);
    mockEnqueue.mockReturnValue(true);

    // Transaction returns the created profiles
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: {
          create: vi.fn().mockImplementation((args: any) =>
            Promise.resolve({
              id: Math.floor(Math.random() * 1000) + 1,
              s3Key: args.data.s3Key,
              status: "SUBMITTED",
              submittedAt: new Date(),
            })
          ),
        },
      };
      return cb(tx);
    });
  });

  it("15. upload returns 201 immediately without awaiting recommendation job completion", async () => {
    const req: any = {
      user: {
        id: "vendor-uuid-1",
        tenant: { tenantId: "tenant-1-uuid" },
      },
      params: { id: opening.id },
      body: {
        files: [{ s3Key: "tenant1/open1/123_async_cand.pdf", filename: "async_cand.pdf" }],
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    const start = Date.now();
    await uploadProfile(req, res);
    const elapsed = Date.now() - start;

    expect(getStatus()).toBe(201);
    expect(getBody().status).toBe("success");
    expect(elapsed).toBeLessThan(150);

    // The queue must be dispatched AFTER the transaction — one enqueue per profile
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const enqueued = mockEnqueue.mock.calls[0][0];
    expect(enqueued.openingId).toBe(opening.id);
    expect(enqueued.tenantId).toBe("tenant-1-uuid");
    expect(enqueued.s3Key).toContain("async_cand.pdf");
  });

  it("17. queue overflow or enqueue failure does not roll back profile creation in DB", async () => {
    mockEnqueue.mockReturnValue(false); // Simulate queue overflow

    const req: any = {
      user: {
        id: "vendor-uuid-1",
        tenant: { tenantId: "tenant-1-uuid" },
      },
      params: { id: opening.id },
      body: {
        files: [{ s3Key: "tenant1/open1/123_overflow_cand.pdf", filename: "overflow_cand.pdf" }],
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await uploadProfile(req, res);

    expect(getStatus()).toBe(201);
    // Profile creation still happened (transaction committed) even though enqueue failed
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(getBody().data.profiles.length).toBe(1);
  });

  it("18. multiple uploaded profiles enqueue independently", async () => {
    const req: any = {
      user: {
        id: "vendor-uuid-1",
        tenant: { tenantId: "tenant-1-uuid" },
      },
      params: { id: opening.id },
      body: {
        files: [
          { s3Key: "tenant1/open1/123_multi_1.pdf", filename: "multi_1.pdf" },
          { s3Key: "tenant1/open1/123_multi_2.pdf", filename: "multi_2.pdf" },
          { s3Key: "tenant1/open1/123_multi_3.pdf", filename: "multi_3.pdf" },
        ],
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await uploadProfile(req, res);

    expect(getStatus()).toBe(201);
    expect(mockEnqueue).toHaveBeenCalledTimes(3);
    expect(getBody().data.profiles.length).toBe(3);
  });

  it("only OPEN openings accept profile uploads (409 for CLOSED)", async () => {
    mockPrisma.opening.findFirst.mockResolvedValue({ ...opening, status: OpeningStatus.CLOSED });

    const req: any = {
      user: {
        id: "vendor-uuid-1",
        tenant: { tenantId: "tenant-1-uuid" },
      },
      params: { id: opening.id },
      body: { files: [{ s3Key: "k.pdf", filename: "f.pdf" }] },
    };

    const { res, getStatus } = createMockRes();
    await uploadProfile(req, res);

    expect(getStatus()).toBe(409);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
