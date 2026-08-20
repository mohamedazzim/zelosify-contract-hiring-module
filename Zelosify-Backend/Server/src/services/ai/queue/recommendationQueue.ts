// src/services/ai/queue/recommendationQueue.ts

import { RecommendationJobPayload, RecommendationService } from "../recommendationService.js";
import { aiLogger } from "../logger/aiLogger.js";

const MAX_CONCURRENCY = 3;
const MAX_QUEUE_SIZE = 1000;
const ABSOLUTE_SAFETY_TIMEOUT_MS = 15000;
const MAX_TRANSIENT_RETRIES = 2;
const DEFAULT_BASE_RETRY_DELAY_MS = 500;

export interface QueueStatus {
  activeWorkers: number;
  queuedJobs: number;
  inFlightCount: number;
}

export interface RecommendationQueueOptions {
  recommendationService?: RecommendationService;
  maxConcurrency?: number;
  maxQueueSize?: number;
  baseRetryDelayMs?: number;
}

export class RecommendationQueue {
  private queue: RecommendationJobPayload[] = [];
  private activeWorkers = 0;
  private inFlightOrQueuedProfileIds: Set<number> = new Set();
  private recommendationService: RecommendationService;
  private maxConcurrency: number;
  private maxQueueSize: number;
  private baseRetryDelayMs: number;

  constructor(options: RecommendationQueueOptions = {}) {
    this.recommendationService = options.recommendationService || new RecommendationService();
    this.maxConcurrency = options.maxConcurrency ?? MAX_CONCURRENCY;
    this.maxQueueSize = options.maxQueueSize ?? MAX_QUEUE_SIZE;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
  }

  /**
   * Enqueues a job into the recommendation queue. Returns immediately (non-blocking).
   * Coalesces duplicate jobs and protects against queue overflow.
   */
  public enqueue(job: RecommendationJobPayload): boolean {
    // 1. Coalesce duplicate profile jobs
    if (this.inFlightOrQueuedProfileIds.has(job.profileId)) {
      aiLogger.info("QUEUE_DUPLICATE_COALESCED", {
        profileId: job.profileId,
        openingId: job.openingId,
      });
      return false;
    }

    // 2. Bound queue growth
    if (this.queue.length >= this.maxQueueSize) {
      aiLogger.error("QUEUE_OVERFLOW", {
        profileId: job.profileId,
        currentQueueLength: this.queue.length,
        maxQueueSize: this.maxQueueSize,
      });
      return false;
    }

    this.inFlightOrQueuedProfileIds.add(job.profileId);
    this.queue.push(job);

    aiLogger.info("QUEUE_JOB_ENQUEUED", {
      profileId: job.profileId,
      openingId: job.openingId,
      queuePosition: this.queue.length,
    });

    // 3. Trigger worker loop asynchronously in next tick
    setImmediate(() => this.processNext());
    return true;
  }

  /**
   * Returns current queue status.
   */
  public getStatus(): QueueStatus {
    return {
      activeWorkers: this.activeWorkers,
      queuedJobs: this.queue.length,
      inFlightCount: this.inFlightOrQueuedProfileIds.size,
    };
  }

  /**
   * Internal worker loop dispatcher.
   */
  private async processNext(): Promise<void> {
    if (this.activeWorkers >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeWorkers++;

    // Execute worker in background without blocking dispatcher
    (async () => {
      let attempt = 1;
      let isCompleted = false;

      // Queue-level retries are TRANSIENT-ONLY and bounded (MAX_TRANSIENT_RETRIES).
      // They handle ONE worker execution: a returned `false` means the job was
      // processed (terminal FAILED, attempt budget exhausted, or SLA timeout) and
      // must NOT be retried here — durable attempt limits in RecommendationService
      // govern cross-restart behavior, and the queue must never loop on `false`.
      while (attempt <= MAX_TRANSIENT_RETRIES + 1 && !isCompleted) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ABSOLUTE_SAFETY_TIMEOUT_MS);

        try {
          isCompleted = await this.recommendationService.processRecommendation(job, controller.signal);
          clearTimeout(timeoutId);
          // A false result is a DEFINITIVE outcome (failed/terminal). Do not loop.
          break;
        } catch (err: any) {
          clearTimeout(timeoutId);
          const isTransient =
            err.code === "LLM_RATE_LIMIT_ERROR" ||
            err.code === "LLM_TIMEOUT_ERROR" ||
            err.name === "AbortError";

          // Auth/config errors are terminal — never retry through the queue.
          const isTerminalAuthError =
            err.code === "LLM_AUTHENTICATION_ERROR" ||
            err.code === "LLM_CLIENT_ERROR" ||
            err.code === "GROQ_API_ERROR";

          if (isTransient && attempt <= MAX_TRANSIENT_RETRIES) {
            const delayMs = this.baseRetryDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
            aiLogger.warn("QUEUE_TRANSIENT_RETRY", {
              profileId: job.profileId,
              attempt,
              retryDelayMs: delayMs,
              error: err.message,
            });
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            attempt++;
            continue;
          } else {
            // Fatal, auth, or retry budget exhausted: do not endlessly retry
            aiLogger.error("QUEUE_FATAL_JOB_ERROR", {
              profileId: job.profileId,
              attempt,
              errorCode: err.code || "UNKNOWN_ERROR",
              error: err.message,
              terminal: isTerminalAuthError,
            });
            break;
          }
        }
      }

      // Cleanup job state
      this.inFlightOrQueuedProfileIds.delete(job.profileId);
      this.activeWorkers--;

      // Process next waiting job
      this.processNext();
    })();

    // Check if more workers can be spawned concurrently
    if (this.activeWorkers < this.maxConcurrency && this.queue.length > 0) {
      setImmediate(() => this.processNext());
    }
  }
}

// Global singleton instance for application runtime
export const recommendationQueue = new RecommendationQueue();
