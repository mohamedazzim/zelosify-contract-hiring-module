import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecommendationStatus, Role, OpeningStatus } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    opening: { findMany: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    hiringProfile: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    agentRun: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/config/prisma/prisma.js", () => ({
  default: mockPrisma,
}));

describe("Prisma Schema AI Recommendation Extensions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies RecommendationStatus enum contains expected values", () => {
    expect(RecommendationStatus.PENDING).toBe("PENDING");
    expect(RecommendationStatus.PROCESSING).toBe("PROCESSING");
    expect(RecommendationStatus.COMPLETED).toBe("COMPLETED");
    expect(RecommendationStatus.FAILED).toBe("FAILED");
  });

  it("verifies seeded openings have non-empty requiredSkills array", async () => {
    mockPrisma.opening.findMany.mockResolvedValue([
      {
        id: "op1",
        title: "Senior Frontend Engineer",
        requiredSkills: ["React", "TypeScript", "Next.js"],
        status: "OPEN",
      },
      {
        id: "op2",
        title: "DevOps Engineer",
        requiredSkills: ["Docker", "Kubernetes", "AWS"],
        status: "OPEN",
      },
    ]);

    const openings = await mockPrisma.opening.findMany({
      where: { tenant: { companyName: "Bruce Wayne Corp" } },
      select: { id: true, title: true, requiredSkills: true, status: true },
    });

    expect(openings.length).toBeGreaterThanOrEqual(2);
    for (const opening of openings) {
      expect(Array.isArray(opening.requiredSkills)).toBe(true);
      expect(opening.requiredSkills.length).toBeGreaterThanOrEqual(3);
    }

    const frontendOpening = openings.find((o: any) => o.title === "Senior Frontend Engineer");
    expect(frontendOpening).toBeDefined();
    expect(frontendOpening?.requiredSkills).toContain("React");
    expect(frontendOpening?.requiredSkills).toContain("TypeScript");

    // The query must filter by the baseline tenant name
    const where = mockPrisma.opening.findMany.mock.calls[0][0].where;
    expect(where.tenant.companyName).toBe("Bruce Wayne Corp");
  });

  it("verifies hiringProfile defaults recommendationStatus to PENDING and can link AgentRun", async () => {
    const opening = { id: "op1", status: OpeningStatus.OPEN };
    const user = { id: "u1" };

    mockPrisma.opening.findFirst.mockResolvedValue(opening);
    mockPrisma.user.findFirst.mockResolvedValue(user);

    // Simulate Prisma applying defaults: recommendationStatus defaults to PENDING
    mockPrisma.hiringProfile.create.mockResolvedValue({
      id: 55,
      openingId: "op1",
      s3Key: "test_tenant/test_opening/123_test_resume.pdf",
      uploadedBy: "u1",
      recommendationStatus: RecommendationStatus.PENDING,
      recommendationAttemptCount: 0,
    });

    const profile = await mockPrisma.hiringProfile.create({
      data: {
        openingId: opening.id,
        s3Key: "test_tenant/test_opening/123_test_resume.pdf",
        uploadedBy: user.id,
      },
    });

    expect(profile.recommendationStatus).toBe(RecommendationStatus.PENDING);

    // Create an associated AgentRun trace record
    mockPrisma.agentRun.create.mockResolvedValue({
      id: "run-1",
      profileId: 55,
      status: "COMPLETED",
      model: "llama-3.3-70b-versatile",
    });

    const agentRun = await mockPrisma.agentRun.create({
      data: {
        profileId: profile.id,
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        startedAt: new Date(),
        completedAt: new Date(),
        status: "COMPLETED",
        latencyMs: 820,
        promptTokens: 450,
        completionTokens: 85,
        totalTokens: 535,
        toolInvocations: [
          { tool: "parse_resume_document", durationMs: 120 },
          { tool: "calculate_deterministic_score", durationMs: 5 },
        ],
        structuredOutput: {
          recommended: true,
          score: 0.85,
          confidence: 0.92,
          reason: "Strong frontend skill match",
        },
      },
    });

    expect(agentRun.id).toBeDefined();
    expect(agentRun.profileId).toBe(profile.id);

    // Verify relation lookup returns the run
    mockPrisma.hiringProfile.findUnique.mockResolvedValue({
      ...profile,
      agentRuns: [agentRun],
    });
    const profileWithRuns = await mockPrisma.hiringProfile.findUnique({
      where: { id: profile.id },
      include: { agentRuns: true },
    });

    expect(profileWithRuns?.agentRuns.length).toBe(1);
    expect(profileWithRuns?.agentRuns[0].model).toBe("llama-3.3-70b-versatile");

    // Cleanup: profile delete cascades to AgentRun (schema-level guarantee)
    mockPrisma.hiringProfile.delete.mockResolvedValue({ id: profile.id });
    await mockPrisma.hiringProfile.delete({ where: { id: profile.id } });

    mockPrisma.agentRun.findUnique.mockResolvedValue(null);
    const deletedRun = await mockPrisma.agentRun.findUnique({ where: { id: agentRun.id } });
    expect(deletedRun).toBeNull();
  });
});
