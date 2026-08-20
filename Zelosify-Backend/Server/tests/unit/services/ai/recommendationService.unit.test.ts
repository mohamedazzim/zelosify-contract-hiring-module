import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecommendationService, MAX_RECOMMENDATION_ATTEMPTS, MAX_ATTEMPTS_ERROR_CODE } from "@/services/ai/recommendationService.js";
import { RecommendationStatus } from "@prisma/client";

// Hoisted mock objects (must be referenced inside vi.mock factory)
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    hiringProfile: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    agentRun: {
      create: vi.fn(),
    },
    opening: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

// Mock the Prisma singleton so NO test writes to the development database.
vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

describe("RecommendationService & Persistence (mocked Prisma)", () => {
  let mockOrchestrator: any;

  const successResult = {
    success: true,
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    startedAt: new Date(),
    completedAt: new Date(),
    latencyMs: 650,
    status: "COMPLETED",
    retryCount: 0,
    tokenUsage: { promptTokens: 300, completionTokens: 60, totalTokens: 360 },
    toolInvocations: [
      {
        tool: "parse_resume_document",
        success: true,
        durationMs: 110,
        inputBounded: { s3Key: "test/key.pdf" },
        outputBounded: { rawTextSanitized: "[BOUNDED_TEXT: length=500 chars]" },
      },
      {
        tool: "calculate_deterministic_score",
        success: true,
        durationMs: 5,
        inputBounded: { candidateExp: 5, minExp: 3 },
        outputBounded: { finalScore: 0.95 },
      },
    ],
    structuredOutput: {
      recommended: true,
      score: 0.95,
      confidence: 0.94,
      reason: "Candidate has 5 years experience matching 3-6 range with 100% skill match.",
    },
    deterministicBreakdown: {
      skillMatchScore: 1.0,
      experienceMatchScore: 1.0,
      locationMatchScore: 1.0,
      finalScore: 0.95,
      thresholdCategory: "RECOMMENDED",
    },
  };

  const failedResult = {
    success: false,
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    startedAt: new Date(),
    completedAt: new Date(),
    latencyMs: 120,
    status: "FAILED",
    retryCount: 2,
    tokenUsage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
    toolInvocations: [],
    errorCode: "MISSING_DETERMINISTIC_SCORER",
    errorMessage: "Scoring tool not executed",
  };

  const baseCriteria = {
    title: "Full Stack Engineer",
    requiredSkills: ["React", "Node.js"],
    location: "Remote",
    experienceMin: 3,
    experienceMax: 6,
    s3Key: "test/resume.pdf",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrchestrator = {
      evaluateProfile: vi.fn(),
    };

    // Default claim: the atomic UPDATE ... RETURNING returns one row (claim succeeded).
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 1 }]);

    // Default opening lookup — service uses select.opening (not include)
    mockPrisma.hiringProfile.findUnique.mockImplementation((args: any) => {
      if (args?.select?.opening) {
        return Promise.resolve({
          id: 1,
          s3Key: "test/resume.pdf",
          opening: {
            title: "Full Stack Engineer",
            requiredSkills: ["React", "Node.js"],
            location: "Remote",
            experienceMin: 3,
            experienceMax: 6,
          },
        });
      }
      return Promise.resolve({ id: 1, recommendationStatus: "PROCESSING", recommendationAttemptCount: 1, isDeleted: false });
    });

    // Default transaction: writes succeed
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: {
          update: vi.fn().mockResolvedValue({ id: 1 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          create: vi.fn().mockResolvedValue({ id: 1 }),
        },
        agentRun: {
          create: vi.fn().mockResolvedValue({ id: "run-1" }),
        },
      };
      return cb(tx);
    });
  });

  function makeService() {
    return new RecommendationService(mockOrchestrator);
  }

  const job = { profileId: 1, openingId: "op1", tenantId: "t1", s3Key: "test/resume.pdf" };

  it("9. atomic claim increments recommendationAttemptCount and rejects duplicate concurrent processing", async () => {
    mockOrchestrator.evaluateProfile.mockResolvedValue(successResult);

    // First call: claim succeeds (1 row returned)
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);

    const service = makeService();
    const firstResult = await service.processRecommendation(job);
    expect(firstResult).toBe(true);

    // Second claim on the same profile returns no rows → claim skipped
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    mockPrisma.hiringProfile.findUnique.mockResolvedValueOnce({
      id: 1,
      recommendationStatus: "PROCESSING",
      recommendationAttemptCount: 1,
      isDeleted: false,
    });

    const secondResult = await service.processRecommendation(job);
    expect(secondResult).toBe(false);

    // The claim SQL must increment the attempt count atomically
    const claimCalls = mockPrisma.$queryRaw.mock.calls;
    expect(claimCalls.length).toBeGreaterThanOrEqual(2);
    const claimSql = String(claimCalls[0][0]);
    expect(claimSql).toContain('"recommendationAttemptCount" = "recommendationAttemptCount" + 1');
    // Max attempts is bound as a parameter
    expect(claimCalls[0]).toContain(MAX_RECOMMENDATION_ATTEMPTS);
  });

  it("10. successful recommendation updates profile and creates AgentRun in one transaction", async () => {
    mockOrchestrator.evaluateProfile.mockResolvedValue(successResult);

    const service = makeService();
    const ok = await service.processRecommendation(job);
    expect(ok).toBe(true);

    // Persistence must run inside a $transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // The tx callback receives a client whose update sets COMPLETED + score
    let capturedUpdate: any;
    let capturedAgentRunCreate: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockImplementation((a: any) => { capturedUpdate = a; return Promise.resolve({ id: 1 }); }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedAgentRunCreate = a; return Promise.resolve({ id: "r1" }); }) },
      };
      return cb(tx);
    });

    // Re-run to capture the tx internals
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);
    await service.processRecommendation(job);

    expect(capturedUpdate.data.recommendationStatus).toBe(RecommendationStatus.COMPLETED);
    expect(capturedUpdate.data.recommendationScore).toBe(0.95);
    expect(capturedUpdate.data.recommended).toBe(true);
    // With a fully mocked orchestrator the wall-clock latency can be 0ms; it
    // must simply be a non-negative number and match the persisted AgentRun.
    expect(typeof capturedUpdate.data.recommendationLatencyMs).toBe("number");
    expect(capturedUpdate.data.recommendationLatencyMs).toBeGreaterThanOrEqual(0);

    expect(capturedAgentRunCreate.data.profileId).toBe(1);
    expect(capturedAgentRunCreate.data.status).toBe("COMPLETED");
    expect(capturedAgentRunCreate.data.model).toBe("llama-3.3-70b-versatile");
    expect(capturedAgentRunCreate.data.totalTokens).toBe(360);
    expect(capturedAgentRunCreate.data.latencyMs).toBe(capturedUpdate.data.recommendationLatencyMs);
  });

  it("11. failed recommendation updates profile to FAILED and creates a failed AgentRun", async () => {
    mockOrchestrator.evaluateProfile.mockResolvedValue(failedResult);

    let capturedUpdate: any;
    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockImplementation((a: any) => { capturedUpdate = a; return Promise.resolve({ id: 1 }); }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r1" }); }) },
      };
      return cb(tx);
    });

    const service = makeService();
    const result = await service.processRecommendation(job);
    expect(result).toBe(false);

    expect(capturedUpdate.data.recommendationStatus).toBe(RecommendationStatus.FAILED);
    expect(capturedRun.data.status).toBe("FAILED");
    expect(capturedRun.data.errorCode).toBe("MISSING_DETERMINISTIC_SCORER");
  });

  it("12. raw resume text and secrets never enter AgentRun table", async () => {
    mockOrchestrator.evaluateProfile.mockResolvedValue({
      ...successResult,
      toolInvocations: [
        {
          tool: "parse_resume_document",
          success: true,
          durationMs: 5,
          inputBounded: { s3Key: "k.pdf" },
          outputBounded: { rawTextSanitized: "[BOUNDED_TEXT: length=100 chars]" },
        },
      ],
    });

    let capturedRun: any;
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        hiringProfile: { update: vi.fn().mockResolvedValue({ id: 1 }) },
        agentRun: { create: vi.fn().mockImplementation((a: any) => { capturedRun = a; return Promise.resolve({ id: "r1" }); }) },
      };
      return cb(tx);
    });

    const service = makeService();
    await service.processRecommendation(job);

    const runJson = JSON.stringify(capturedRun.data);
    expect(runJson).not.toContain("RAW_RESUME_CONTENT");
    expect(runJson).not.toContain("gsk_");
    expect(runJson).toContain("[BOUNDED_TEXT");
  });

  it("14. startup recovery is imported and exported (unit-level smoke)", async () => {
    // The recovery module is covered in its own dedicated test; here we just
    // assert the constants used by recovery are exported from the service.
    expect(MAX_RECOMMENDATION_ATTEMPTS).toBe(3);
    expect(MAX_ATTEMPTS_ERROR_CODE).toBe("MAX_RECOMMENDATION_ATTEMPTS_EXCEEDED");
  });
});
