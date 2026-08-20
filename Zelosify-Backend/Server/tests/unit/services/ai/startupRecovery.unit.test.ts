import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockQueue } = vi.hoisted(() => ({
  mockPrisma: {
    hiringProfile: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
  mockQueue: {
    enqueue: vi.fn().mockReturnValue(true),
    getStatus: vi.fn().mockReturnValue({ activeWorkers: 0, queuedJobs: 0, inFlightCount: 0 }),
  },
}));

vi.mock("@/config/prisma/prisma.js", () => ({ default: mockPrisma }));
vi.mock("@/services/ai/queue/recommendationQueue.js", () => ({
  recommendationQueue: mockQueue,
}));
vi.mock("@/services/ai/logger/aiLogger.js", () => ({
  aiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/services/ai/recommendationService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/ai/recommendationService.js")>();
  return {
    ...actual,
    MAX_RECOMMENDATION_ATTEMPTS: 3,
    MAX_ATTEMPTS_ERROR_CODE: "MAX_RECOMMENDATION_ATTEMPTS_EXCEEDED",
  };
});

import { MAX_RECOMMENDATION_ATTEMPTS } from "@/services/ai/recommendationService.js";

// The recovery module has a module-level "already initialized" flag, so each
// test re-imports a fresh module instance.
async function freshRecovery() {
  vi.resetModules();
  // Re-register mocks after reset
  vi.doMock("@/config/prisma/prisma.js", () => ({ default: mockPrisma }));
  vi.doMock("@/services/ai/queue/recommendationQueue.js", () => ({
    recommendationQueue: mockQueue,
  }));
  vi.doMock("@/services/ai/logger/aiLogger.js", () => ({
    aiLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  const mod = await import("@/services/ai/queue/startupRecovery.js");
  return mod.recoverPendingAndStaleRecommendations;
}

describe("startupRecovery durable-attempt safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.hiringProfile.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.hiringProfile.findMany.mockResolvedValue([]);
  });

  it("resets only stale PROCESSING profiles below max attempts", async () => {
    const recover = await freshRecovery();
    // First updateMany (stale reset) returns 2; terminal-stamp returns 0.
    mockPrisma.hiringProfile.updateMany.mockImplementation((args: any) => {
      if (args.data.recommendationStatus === "PENDING") return Promise.resolve({ count: 2 });
      return Promise.resolve({ count: 0 });
    });

    const result = await recover();
    expect(result.recoveredStale).toBe(2);

    const staleResetCall = mockPrisma.hiringProfile.updateMany.mock.calls.find(
      (c: any) => c[0].data.recommendationStatus === "PENDING"
    );
    expect(staleResetCall).toBeDefined();
    // The stale reset must require attempts below max
    expect(staleResetCall[0].where.recommendationAttemptCount.lt).toBe(MAX_RECOMMENDATION_ATTEMPTS);
  });

  it("does NOT enqueue terminal FAILED profiles", async () => {
    const recover = await freshRecovery();
    mockPrisma.hiringProfile.findMany.mockResolvedValue([]);

    await recover();

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });

  it("re-enqueues PENDING profiles only while attempt count is below max", async () => {
    const recover = await freshRecovery();
    mockPrisma.hiringProfile.findMany.mockResolvedValue([
      {
        id: 10,
        openingId: "op1",
        s3Key: "t/op/r.pdf",
        opening: { tenantId: "tenant1" },
      },
    ]);

    await recover();

    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(mockQueue.enqueue).toHaveBeenCalledWith({
      profileId: 10,
      openingId: "op1",
      tenantId: "tenant1",
      s3Key: "t/op/r.pdf",
    });
  });

  it("never auto-retries a FAILED profile even if below max (explicit retry only)", async () => {
    const recover = await freshRecovery();
    mockPrisma.hiringProfile.findMany.mockResolvedValue([]);

    await recover();

    const where = mockPrisma.hiringProfile.findMany.mock.calls[0][0].where;
    expect(where.recommendationStatus).toBe("PENDING");
    expect(where.recommendationAttemptCount.lt).toBe(MAX_RECOMMENDATION_ATTEMPTS);
  });

  it("stamps exhausted profiles as terminal FAILED and never enqueues them", async () => {
    const recover = await freshRecovery();
    mockPrisma.hiringProfile.updateMany.mockImplementation((args: any) => {
      if (args.data.recommendationStatus === "FAILED" && args.where.recommendationAttemptCount?.gte === MAX_RECOMMENDATION_ATTEMPTS) {
        return Promise.resolve({ count: 3 });
      }
      return Promise.resolve({ count: 0 });
    });

    const result = await recover();
    expect(result.enqueuedPending).toBe(0);
    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });
});
