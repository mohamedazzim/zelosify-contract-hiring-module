import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecommendationService, MAX_RECOMMENDATION_ATTEMPTS, MAX_ATTEMPTS_ERROR_CODE } from "@/services/ai/recommendationService.js";
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

vi.mock("@/config/prisma/prisma.js", () => ({ default: mockPrisma }));

describe("Durable bounded recommendation attempts", () => {
  let mockOrchestrator: any;

  const successResult = {
    success: true,
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    startedAt: new Date(),
    completedAt: new Date(),
    latencyMs: 100,
    status: "COMPLETED",
    retryCount: 0,
    tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    toolInvocations: [],
    structuredOutput: { recommended: true, score: 0.9, confidence: 0.9, reason: "ok" },
  };

  const failedResult = {
    success: false,
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    startedAt: new Date(),
    completedAt: new Date(),
    latencyMs: 50,
    status: "FAILED",
    retryCount: 0,
    tokenUsage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    toolInvocations: [],
    errorCode: "SCHEMA_VALIDATION_ERROR",
    errorMessage: "Failed validation",
  };

  const job = { profileId: 1, openingId: "op1", tenantId: "t1", s3Key: "test/resume.pdf" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOrchestrator = { evaluateProfile: vi.fn() };

    mockPrisma.$queryRaw.mockResolvedValue([{ id: 1 }]); // claim succeeds by default

    mockPrisma.hiringProfile.findUnique.mockImplementation((args: any) => {
      if (args?.select?.opening) {
        return Promise.resolve({
          id: 1,
          s3Key: "test/resume.pdf",
          opening: { title: "t", requiredSkills: ["a"], location: "Remote", experienceMin: 1, experienceMax: 5 },
        });
      }
      return Promise.resolve({ id: 1, recommendationStatus: "PROCESSING", recommendationAttemptCount: 1, isDeleted: false });
    });

    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockResolvedValue({ id: 1 }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        agentRun: { create: vi.fn().mockResolvedValue({ id: "r" }) },
      };
      return cb(tx);
    });
  });

  it("increments attempt count atomically on claim (durable across restarts)", async () => {
    mockOrchestrator.evaluateProfile.mockResolvedValue(successResult);
    const service = new RecommendationService(mockOrchestrator);

    await service.processRecommendation(job);

    const call = mockPrisma.$queryRaw.mock.calls[0];
    const claimSql = String(call[0]);
    expect(claimSql).toContain('"recommendationAttemptCount" = "recommendationAttemptCount" + 1');
    // The SQL guard passes the max as a bound parameter (second arg)
    expect(call).toContain(MAX_RECOMMENDATION_ATTEMPTS);
  });

  it("profile with attempt count at max is NOT claimed and is marked terminal", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]); // claim guard rejects
    mockPrisma.hiringProfile.findUnique.mockResolvedValueOnce({
      id: 1,
      recommendationStatus: "FAILED",
      recommendationAttemptCount: MAX_RECOMMENDATION_ATTEMPTS,
      isDeleted: false,
    });
    mockPrisma.hiringProfile.update.mockResolvedValue({ id: 1 });

    mockOrchestrator.evaluateProfile.mockResolvedValue(failedResult);
    const service = new RecommendationService(mockOrchestrator);

    const result = await service.processRecommendation(job);
    expect(result).toBe(false);

    // It must be marked FAILED with the terminal error reason, and NOT processed.
    expect(mockOrchestrator.evaluateProfile).not.toHaveBeenCalled();
    const update = mockPrisma.hiringProfile.update.mock.calls[0][0];
    expect(update.data.recommendationStatus).toBe(RecommendationStatus.FAILED);
    expect(String(update.data.recommendationReason)).toContain("Maximum recommendation attempts");
  });

  it("failed profile below max CAN be explicitly retried (claim still succeeds)", async () => {
    mockOrchestrator.evaluateProfile.mockResolvedValueOnce(failedResult).mockResolvedValueOnce(successResult);
    const service = new RecommendationService(mockOrchestrator);

    // Attempt 1: claim succeeds (count 0 -> 1), fails
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);
    const first = await service.processRecommendation(job);
    expect(first).toBe(false);

    // Attempt 2: claim succeeds again (count 1 -> 2), succeeds
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);
    const second = await service.processRecommendation(job);
    expect(second).toBe(true);

    expect(mockOrchestrator.evaluateProfile).toHaveBeenCalledTimes(2);
    // Each claim increments the durable counter (2 claims total)
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("authentication failure is terminal: profile marked FAILED and not retried", async () => {
    mockOrchestrator.evaluateProfile.mockRejectedValue({
      code: "LLM_AUTHENTICATION_ERROR",
      message: "GROQ_API_KEY is not configured",
    });

    let capturedUpdate: any;
    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockImplementation((a: any) => { capturedUpdate = a; return Promise.resolve({ id: 1 }); }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r" }); }) },
      };
      return cb(tx);
    });

    const service = new RecommendationService(mockOrchestrator);
    const result = await service.processRecommendation(job);
    expect(result).toBe(false);

    expect(capturedUpdate.data.recommendationStatus).toBe(RecommendationStatus.FAILED);
    expect(String(capturedUpdate.data.recommendationReason)).toContain("Terminal failure");
    expect(capturedRun.data.errorCode).toBe("LLM_AUTHENTICATION_ERROR");
  });

  it("LLM_CLIENT_ERROR (missing key config) is also treated as terminal", async () => {
    mockOrchestrator.evaluateProfile.mockRejectedValue({
      code: "LLM_CLIENT_ERROR",
      message: "Groq API Error",
    });

    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockResolvedValue({ id: 1 }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r" }); }) },
      };
      return cb(tx);
    });

    const service = new RecommendationService(mockOrchestrator);
    await service.processRecommendation(job);

    expect(capturedRun.data.errorCode).toBe("LLM_AUTHENTICATION_ERROR");
  });

  it("transient errors (rate limit) remain bounded and do not loop forever", async () => {
    // Simulate a throw that is NOT auth: should be handled as a normal failure
    mockOrchestrator.evaluateProfile.mockRejectedValue({
      code: "LLM_RATE_LIMIT_ERROR",
      message: "429 rate limited",
    });

    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockResolvedValue({ id: 1 }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r" }); }) },
      };
      return cb(tx);
    });

    const service = new RecommendationService(mockOrchestrator);
    const result = await service.processRecommendation(job);
    expect(result).toBe(false);
    // Non-auth errors keep their original code
    expect(capturedRun.data.errorCode).toBe("LLM_RATE_LIMIT_ERROR");
    // Exactly one AgentRun is persisted — no runaway loop at the service level
    expect(mockOrchestrator.evaluateProfile).toHaveBeenCalledTimes(1);
  });

  it("no profile can create unlimited AgentRun rows (attempt budget caps executions)", async () => {
    mockOrchestrator.evaluateProfile.mockResolvedValue(failedResult);
    const service = new RecommendationService(mockOrchestrator);

    // 3 attempts allowed; 4th is rejected by the claim guard.
    for (let i = 0; i < MAX_RECOMMENDATION_ATTEMPTS; i++) {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);
      await service.processRecommendation(job);
    }

    // 4th attempt: claim guard returns nothing, profile at max.
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockPrisma.hiringProfile.findUnique.mockResolvedValueOnce({
      id: 1,
      recommendationStatus: "FAILED",
      recommendationAttemptCount: MAX_RECOMMENDATION_ATTEMPTS,
      isDeleted: false,
    });
    await service.processRecommendation(job);

    // The orchestrator ran at most MAX_RECOMMENDATION_ATTEMPTS times.
    expect(mockOrchestrator.evaluateProfile).toHaveBeenCalledTimes(MAX_RECOMMENDATION_ATTEMPTS);
  });
});
