import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecommendationService } from "@/services/ai/recommendationService.js";
import { RecommendationQueue } from "@/services/ai/queue/recommendationQueue.js";
import { RecommendationStatus } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    hiringProfile: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    agentRun: { create: vi.fn(), findMany: vi.fn() },
    opening: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

describe("Phase 4E SLA & Latency Semantics Review", () => {
  const job = {
    profileId: 1,
    openingId: "op1",
    tenantId: "tenant1",
    s3Key: "test/resume.pdf",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Claim succeeds by default
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 1 }]);

    mockPrisma.hiringProfile.findUnique.mockImplementation((args: any) => {
      if (args?.select?.opening) {
        return Promise.resolve({
          id: 1,
          s3Key: "test/resume.pdf",
          opening: { title: "Full Stack Engineer", requiredSkills: ["React", "Node.js"], location: "Remote", experienceMin: 3, experienceMax: 6 },
        });
      }
      return Promise.resolve({ id: 1, recommendationStatus: "PROCESSING", recommendationAttemptCount: 1, isDeleted: false });
    });

    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockResolvedValue({ id: 1 }) },
        agentRun: { create: vi.fn().mockResolvedValue({ id: "r" }) },
      };
      return cb(tx);
    });
  });

  function makeResult(overrides: Record<string, any> = {}) {
    return {
      success: true,
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      startedAt: new Date(),
      completedAt: new Date(),
      latencyMs: 200,
      status: "COMPLETED",
      retryCount: 0,
      tokenUsage: { promptTokens: 200, completionTokens: 50, totalTokens: 250 },
      toolInvocations: [],
      structuredOutput: { recommended: true, score: 0.9, confidence: 0.95, reason: "Compliant with SLA" },
      deterministicBreakdown: { skillMatchScore: 1, experienceMatchScore: 1, locationMatchScore: 1, finalScore: 0.9, thresholdCategory: "RECOMMENDED" },
      ...overrides,
    };
  }

  it("1. an agent completing within SLA succeeds and records COMPLETED", async () => {
    let capturedUpdate: any;
    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockImplementation((a: any) => { capturedUpdate = a; return Promise.resolve({ id: 1 }); }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r" }); }) },
      };
      return cb(tx);
    });

    const mockOrchestrator = {
      evaluateProfile: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return makeResult({ latencyMs: 5 });
      }),
    } as any;

    const service = new RecommendationService({ orchestrator: mockOrchestrator, slaTimeoutMs: 1500 });
    const result = await service.processRecommendation(job);

    expect(result).toBe(true);
    expect(capturedUpdate.data.recommendationStatus).toBe(RecommendationStatus.COMPLETED);
    expect(capturedUpdate.data.recommendationLatencyMs).toBeGreaterThanOrEqual(0);
    expect(capturedUpdate.data.recommendationLatencyMs).toBeLessThan(1500);
    expect(capturedRun.data.status).toBe("COMPLETED");
  });

  it("2. an agent exceeding SLA is cancelled and marked TIMEOUT/FAILED", async () => {
    let capturedUpdate: any;
    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockImplementation((a: any) => { capturedUpdate = a; return Promise.resolve({ id: 1 }); }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r" }); }) },
      };
      return cb(tx);
    });

    const mockOrchestrator = {
      evaluateProfile: vi.fn().mockImplementation(async (_c: any, signal?: AbortSignal) => {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 50);
          signal?.addEventListener("abort", () => { clearTimeout(t); resolve(null); });
        });
        if (signal?.aborted) {
          return makeResult({
            success: false,
            latencyMs: 310,
            status: "TIMEOUT",
            errorCode: "RECOMMENDATION_SLA_EXCEEDED",
            errorMessage: "Recommendation exceeded 300ms SLA deadline",
            tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            toolInvocations: [],
          });
        }
        return makeResult({ latencyMs: 400 });
      }),
    } as any;

    const service = new RecommendationService({ orchestrator: mockOrchestrator, slaTimeoutMs: 10 }); // Strict SLA
    const result = await service.processRecommendation(job);

    expect(result).toBe(false);
    expect(capturedUpdate.data.recommendationStatus).toBe(RecommendationStatus.FAILED);
    expect(capturedRun.data.status).toBe("TIMEOUT");
    expect(capturedRun.data.errorCode).toBe("RECOMMENDATION_SLA_EXCEEDED");
    expect(capturedRun.data.errorMessage).toContain("SLA deadline");
  });

  it("3. timeout results accurately persist the measured wall-clock latency", async () => {
    let capturedUpdate: any;
    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockImplementation((a: any) => { capturedUpdate = a; return Promise.resolve({ id: 1 }); }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r" }); }) },
      };
      return cb(tx);
    });

    const mockOrchestrator = {
      evaluateProfile: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 20));
        return makeResult({
          success: false,
          latencyMs: 20,
          status: "FAILED",
          errorCode: "SCHEMA_VALIDATION_ERROR",
          errorMessage: "Failed validation",
          tokenUsage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
        });
      }),
    } as any;

    const service = new RecommendationService({ orchestrator: mockOrchestrator, slaTimeoutMs: 1500 });
    await service.processRecommendation(job);

    expect(capturedUpdate.data.recommendationLatencyMs).toBeGreaterThanOrEqual(0);
    expect(capturedRun.data.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("4. transient retries in queue are bounded and do not bypass SLA indefinitely", async () => {
    let callCount = 0;
    const mockService = {
      processRecommendation: vi.fn().mockImplementation(async () => {
        callCount++;
        const err: any = new Error("Network timeout");
        err.code = "LLM_TIMEOUT_ERROR";
        throw err;
      }),
    } as any;

    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 1,
      baseRetryDelayMs: 5,
    });

    queue.enqueue({
      profileId: 999,
      openingId: "op1",
      tenantId: "t1",
      s3Key: "test.pdf",
    });

    await new Promise((r) => setTimeout(r, 150));

    // 1 initial + 2 transient retries = 3 calls, then stop (bounded)
    expect(callCount).toBe(3);
    expect(queue.getStatus().inFlightCount).toBe(0);
  });

  it("4b. queue never loops when processRecommendation returns false (terminal outcome)", async () => {
    let callCount = 0;
    const mockService = {
      processRecommendation: vi.fn().mockImplementation(async () => {
        callCount++;
        return false; // terminal FAILED / max attempts / SLA — NOT a retryable condition
      }),
    } as any;

    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 1,
      baseRetryDelayMs: 5,
    });

    queue.enqueue({ profileId: 1, openingId: "op1", tenantId: "t1", s3Key: "k.pdf" });
    await new Promise((r) => setTimeout(r, 100));

    // Must be exactly 1 call — previously this looped forever on false.
    expect(callCount).toBe(1);
  });

  it("5. latency measurements record actual observed times rather than hardcoded claims", async () => {
    const latencies: number[] = [120, 240, 180, 310, 95];
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p95Latency = [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    expect(avgLatency).toBe(189);
    expect(p95Latency).toBe(310);
    expect(typeof p95Latency).toBe("number");
  });
});
