import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecommendationQueue } from "@/services/ai/queue/recommendationQueue.js";
import { RecommendationService } from "@/services/ai/recommendationService.js";

// The RecommendationService module imports the real Prisma singleton which
// instantiates PrismaClient at module load. Mock it so this unit test never
// touches the development database (test isolation guard requirement).
vi.mock("@/config/prisma/prisma.js", () => ({
  default: {
    hiringProfile: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    agentRun: { create: vi.fn() },
    opening: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

describe("RecommendationQueue (In-Process Bounded Queue)", () => {
  let mockService: RecommendationService;

  beforeEach(() => {
    mockService = {
      processRecommendation: vi.fn().mockResolvedValue(true),
    } as any;
  });

  it("1. enqueue returns immediately without awaiting the recommendation agent", () => {
    let agentStarted = false;
    (mockService.processRecommendation as any).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      agentStarted = true;
      return true;
    });

    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 3,
      maxQueueSize: 100,
    });

    const start = Date.now();
    const result = queue.enqueue({
      profileId: 101,
      openingId: "op1",
      tenantId: "t1",
      s3Key: "key1.pdf",
    });
    const elapsed = Date.now() - start;

    expect(result).toBe(true);
    expect(elapsed).toBeLessThan(20); // Immediate return
    expect(agentStarted).toBe(false); // Has not finished yet
  });

  it("2. enforces maximum concurrency of 3 workers", async () => {
    let concurrentCount = 0;
    let maxObservedConcurrent = 0;

    (mockService.processRecommendation as any).mockImplementation(async () => {
      concurrentCount++;
      if (concurrentCount > maxObservedConcurrent) {
        maxObservedConcurrent = concurrentCount;
      }
      await new Promise((r) => setTimeout(r, 30));
      concurrentCount--;
      return true;
    });

    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 3,
      maxQueueSize: 100,
    });

    // Enqueue 6 jobs
    for (let i = 1; i <= 6; i++) {
      queue.enqueue({
        profileId: i,
        openingId: "op1",
        tenantId: "t1",
        s3Key: `key${i}.pdf`,
      });
    }

    // Wait for all to finish
    await new Promise((r) => setTimeout(r, 200));

    expect(maxObservedConcurrent).toBeLessThanOrEqual(3);
    expect(queue.getStatus().queuedJobs).toBe(0);
  });

  it("3. processes jobs in FIFO order", async () => {
    const processedOrder: number[] = [];

    (mockService.processRecommendation as any).mockImplementation(async (job: any) => {
      processedOrder.push(job.profileId);
      await new Promise((r) => setTimeout(r, 10));
      return true;
    });

    // Concurrency 1 to test strict FIFO sequencing
    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 1,
      maxQueueSize: 100,
    });

    queue.enqueue({ profileId: 10, openingId: "op1", tenantId: "t1", s3Key: "k1.pdf" });
    queue.enqueue({ profileId: 20, openingId: "op1", tenantId: "t1", s3Key: "k2.pdf" });
    queue.enqueue({ profileId: 30, openingId: "op1", tenantId: "t1", s3Key: "k3.pdf" });

    await new Promise((r) => setTimeout(r, 150));

    expect(processedOrder).toEqual([10, 20, 30]);
  });

  it("4. coalesces duplicate profile jobs", () => {
    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 3,
      maxQueueSize: 100,
    });

    const first = queue.enqueue({ profileId: 55, openingId: "op1", tenantId: "t1", s3Key: "k1.pdf" });
    const duplicate = queue.enqueue({ profileId: 55, openingId: "op1", tenantId: "t1", s3Key: "k1.pdf" });

    expect(first).toBe(true);
    expect(duplicate).toBe(false);
    expect(queue.getStatus().inFlightCount).toBe(1);
  });

  it("5. handles queue overflow safely when capacity is reached", () => {
    // Queue with max size 2
    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 0,
      maxQueueSize: 2,
    });

    const job1 = queue.enqueue({ profileId: 1, openingId: "op1", tenantId: "t1", s3Key: "k1.pdf" });
    const job2 = queue.enqueue({ profileId: 2, openingId: "op1", tenantId: "t1", s3Key: "k2.pdf" });
    const job3 = queue.enqueue({ profileId: 3, openingId: "op1", tenantId: "t1", s3Key: "k3.pdf" }); // Overflow!

    expect(job1).toBe(true);
    expect(job2).toBe(true);
    expect(job3).toBe(false);
  });

  it("6. retries transient failures with bounded retry count", async () => {
    let attempts = 0;
    (mockService.processRecommendation as any).mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        const err: any = new Error("Rate limit hit");
        err.code = "LLM_RATE_LIMIT_ERROR";
        throw err;
      }
      return true;
    });

    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 1,
      maxQueueSize: 100,
      baseRetryDelayMs: 20, // Fast delay for test
    });

    queue.enqueue({ profileId: 77, openingId: "op1", tenantId: "t1", s3Key: "k1.pdf" });

    await new Promise((r) => setTimeout(r, 450));

    expect(attempts).toBe(3); // 1 initial + 2 retries
  });

  it("7. does not endlessly retry fatal authentication errors", async () => {
    let attempts = 0;
    (mockService.processRecommendation as any).mockImplementation(async () => {
      attempts++;
      const err: any = new Error("Invalid API Key");
      err.code = "LLM_AUTHENTICATION_ERROR";
      throw err;
    });

    const queue = new RecommendationQueue({
      recommendationService: mockService,
      maxConcurrency: 1,
      maxQueueSize: 100,
    });

    queue.enqueue({ profileId: 88, openingId: "op1", tenantId: "t1", s3Key: "k1.pdf" });

    await new Promise((r) => setTimeout(r, 100));

    expect(attempts).toBe(1); // Fails immediately, no retries
  });
});
