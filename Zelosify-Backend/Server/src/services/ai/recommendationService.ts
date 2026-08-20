// src/services/ai/recommendationService.ts

import prisma from "../../config/prisma/prisma.js";
import { RecommendationStatus } from "@prisma/client";
import { AgentOrchestrator } from "./agent/agentOrchestrator.js";
import { GroqLlmClient } from "./client/groqClient.js";
import { ToolRegistry } from "./tools/toolRegistry.js";
import { aiLogger } from "./logger/aiLogger.js";
import type { AgentExecutionResult } from "./types/llmTypes.js";

const DEFAULT_RECOMMENDATION_SLA_MS = 1500; // 1500ms SLA deadline

/**
 * Maximum total recommendation attempts per profile, INCLUDING attempts across
 * process restarts. The attempt count is persisted on hiringProfile and
 * incremented atomically on each claim, so a profile cannot be processed more
 * than this many times in total. Once exhausted the profile is terminal FAILED.
 */
export const MAX_RECOMMENDATION_ATTEMPTS = 3;

/**
 * Terminal error code set when a profile has exhausted its durable attempt budget.
 * Such profiles are never re-claimed by the queue or startup recovery.
 */
export const MAX_ATTEMPTS_ERROR_CODE = "MAX_RECOMMENDATION_ATTEMPTS_EXCEEDED";

export interface RecommendationJobPayload {
  profileId: number;
  openingId: string;
  tenantId: string;
  s3Key: string;
}

export interface RecommendationServiceOptions {
  orchestrator?: AgentOrchestrator;
  slaTimeoutMs?: number;
}

export class RecommendationService {
  private orchestrator: AgentOrchestrator;
  private slaTimeoutMs: number;

  constructor(optionsOrOrchestrator?: RecommendationServiceOptions | AgentOrchestrator) {
    if (optionsOrOrchestrator && "evaluateProfile" in optionsOrOrchestrator) {
      this.orchestrator = optionsOrOrchestrator as AgentOrchestrator;
      this.slaTimeoutMs = DEFAULT_RECOMMENDATION_SLA_MS;
    } else {
      const opts = (optionsOrOrchestrator as RecommendationServiceOptions) || {};
      this.slaTimeoutMs = opts.slaTimeoutMs ?? DEFAULT_RECOMMENDATION_SLA_MS;
      if (opts.orchestrator) {
        this.orchestrator = opts.orchestrator;
      } else {
        let client: GroqLlmClient;
        try {
          client = new GroqLlmClient();
        } catch {
          client = null as any;
        }
        this.orchestrator = new AgentOrchestrator({
          llmClient: client,
          toolRegistry: new ToolRegistry(),
        });
      }
    }
  }

  /**
   * Processes a single recommendation job with atomic claiming, durable attempt
   * accounting, and SLA timeout enforcement.
   *
   * Durable attempts: each claim atomically increments recommendationAttemptCount
   * (persisted). Once a profile's count reaches MAX_RECOMMENDATION_ATTEMPTS it can
   * never be claimed again — across queue retries OR process restarts.
   */
  async processRecommendation(job: RecommendationJobPayload, parentSignal?: AbortSignal): Promise<boolean> {
    const { profileId, openingId, tenantId, s3Key } = job;
    const startTime = Date.now();

    aiLogger.info("RECOMMENDATION_JOB_STARTED", { profileId, openingId, tenantId });

    // 1. Atomically Claim Profile: PENDING / FAILED -> PROCESSING, incrementing the
    //    durable attempt count in the same statement. The SQL guard (a) rejects
    //    profiles that have reached the max attempts, (b) rejects already-claimed
    //    profiles, and (c) makes the increment race-free even across processes.
    const claimResult = await prisma.$queryRaw<{ count: number }[]>`
      UPDATE "hiringProfile"
      SET "recommendationStatus" = ${RecommendationStatus.PROCESSING}::"RecommendationStatus",
          "recommendationAttemptCount" = "recommendationAttemptCount" + 1
      WHERE "id" = ${profileId}
        AND "isDeleted" = false
        AND "recommendationStatus" IN (${RecommendationStatus.PENDING}::"RecommendationStatus", ${RecommendationStatus.FAILED}::"RecommendationStatus")
        AND "recommendationAttemptCount" < ${MAX_RECOMMENDATION_ATTEMPTS}
      RETURNING "id"
    `;

    if (claimResult.length === 0) {
      // Distinguish "already at max attempts" (terminal, unrecoverable) from
      // "already PROCESSING/COMPLETED or deleted" (transient claim race).
      const profile = await prisma.hiringProfile.findUnique({
        where: { id: profileId },
        select: { recommendationStatus: true, recommendationAttemptCount: true, isDeleted: true },
      });

      const attemptBudgetExhausted =
        profile &&
        !profile.isDeleted &&
        profile.recommendationAttemptCount >= MAX_RECOMMENDATION_ATTEMPTS &&
        profile.recommendationStatus !== RecommendationStatus.COMPLETED;

      if (attemptBudgetExhausted) {
        // Terminal: mark with the safe error code once. Never re-enqueued again.
        await prisma.hiringProfile.update({
          where: { id: profileId },
          data: {
            recommendationStatus: RecommendationStatus.FAILED,
            recommendationReason: `Maximum recommendation attempts (${MAX_RECOMMENDATION_ATTEMPTS}) exceeded`,
          },
        });
        aiLogger.warn("RECOMMENDATION_MAX_ATTEMPTS_REACHED", {
          profileId,
          attemptCount: profile.recommendationAttemptCount,
          maxAttempts: MAX_RECOMMENDATION_ATTEMPTS,
        });
      } else {
        aiLogger.info("RECOMMENDATION_CLAIM_SKIPPED", {
          profileId,
          reason: "Profile is already in PROCESSING, COMPLETED, or deleted",
        });
      }
      return false;
    }

    // 2. Fetch Minimal Opening Criteria (Strict Data Isolation)
    const profileWithOpening = await prisma.hiringProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        s3Key: true,
        opening: {
          select: {
            title: true,
            requiredSkills: true,
            location: true,
            experienceMin: true,
            experienceMax: true,
          },
        },
      },
    });

    if (!profileWithOpening || !profileWithOpening.opening) {
      aiLogger.error("RECOMMENDATION_OPENING_NOT_FOUND", { profileId, openingId });
      await this.markProfileFailed(profileId, "OPENING_NOT_FOUND", "Opening data not found for profile", undefined, 0);
      return false;
    }

    const { opening } = profileWithOpening;

    // 3. Build Minimal Agent Criteria (No tenantId, userId, credentials, or presigned URLs)
    const criteria = {
      title: opening.title,
      requiredSkills: opening.requiredSkills,
      location: opening.location,
      experienceMin: opening.experienceMin,
      experienceMax: opening.experienceMax,
      s3Key: profileWithOpening.s3Key,
    };

    // 4. Setup 1500ms SLA AbortController
    const slaController = new AbortController();
    const slaTimer = setTimeout(() => {
      slaController.abort();
    }, this.slaTimeoutMs);

    if (parentSignal) {
      parentSignal.addEventListener("abort", () => slaController.abort());
    }

    // 5. Run Agent Orchestrator with SLA Timer
    let result: AgentExecutionResult | undefined;
    let orchestratorThrew: any = null;
    try {
      result = await this.orchestrator.evaluateProfile(criteria, slaController.signal);
    } catch (err: any) {
      orchestratorThrew = err;
    } finally {
      clearTimeout(slaTimer);
    }

    const totalLatencyMs = Date.now() - startTime;

    // 5b. Orchestrator threw. Classify:
    //   - Auth/config errors are TERMINAL: marking the profile FAILED with a
    //     distinct error code so neither queue retries nor startup recovery
    //     ever re-enqueue it (a missing/invalid LLM key will not fix itself).
    //   - Transient client errors fall through to normal failure handling
    //     (durable attempts still bound total retries).
    if (orchestratorThrew) {
      const code = orchestratorThrew.code || orchestratorThrew.name || "UNKNOWN_ERROR";
      const isAuthConfigError =
        code === "LLM_AUTHENTICATION_ERROR" ||
        code === "LLM_CLIENT_ERROR" ||
        code === "GROQ_API_ERROR" ||
        (typeof orchestratorThrew?.message === "string" &&
          /api[ _-]?key|authentication|unauthorized|invalid.*credential/i.test(orchestratorThrew.message));

      const isTerminal = isAuthConfigError || code === MAX_ATTEMPTS_ERROR_CODE;
      const errorCode = isTerminal ? "LLM_AUTHENTICATION_ERROR" : code;

      aiLogger.warn("RECOMMENDATION_ORCHESTRATOR_ERROR", {
        profileId,
        errorCode: code,
        terminal: isTerminal,
        errorMessage: orchestratorThrew?.message,
      });

      await this.markProfileFailed(
        profileId,
        errorCode,
        orchestratorThrew?.message || "Orchestrator evaluation threw",
        {
          provider: (this.orchestrator as any)?.llmClient?.providerName || "groq",
          model: "unknown",
          startedAt: new Date(startTime),
          completedAt: new Date(),
          status: isTerminal ? "FAILED" : "FAILED",
          retryCount: 0,
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          toolInvocations: [],
        },
        totalLatencyMs,
        isTerminal
      );

      return false;
    }

    // 6. Enforce 1500ms SLA Deadline: If latency exceeded SLA or status is TIMEOUT
    if (totalLatencyMs > this.slaTimeoutMs || result!.status === "TIMEOUT") {
      aiLogger.warn("RECOMMENDATION_SLA_EXCEEDED", {
        profileId,
        tenantId,
        latencyMs: totalLatencyMs,
        slaLimitMs: this.slaTimeoutMs,
      });

      await this.markProfileFailed(
        profileId,
        "RECOMMENDATION_SLA_EXCEEDED",
        `Recommendation processing exceeded ${this.slaTimeoutMs}ms SLA deadline (actual: ${totalLatencyMs}ms)`,
        { ...result, status: "TIMEOUT" },
        totalLatencyMs
      );

      return false;
    }

    // 7. Persist Results on Success (Compliant with SLA)
    if (result!.success && result!.structuredOutput) {
      await prisma.$transaction(async (tx) => {
        await tx.hiringProfile.update({
          where: { id: profileId },
          data: {
            recommendationStatus: RecommendationStatus.COMPLETED,
            recommendationScore: result!.structuredOutput!.score,
            recommendationReason: result!.structuredOutput!.reason,
            recommendationConfidence: result!.structuredOutput!.confidence,
            recommendationVersion: "1.0.0",
            recommendationLatencyMs: totalLatencyMs,
            recommended: result!.structuredOutput!.recommended,
            recommendedAt: new Date(),
          },
        });

        await tx.agentRun.create({
          data: {
            profileId,
            provider: result!.provider,
            model: result!.model,
            startedAt: result!.startedAt,
            completedAt: result!.completedAt,
            status: "COMPLETED",
            retryCount: result!.retryCount,
            latencyMs: totalLatencyMs,
            promptTokens: result!.tokenUsage.promptTokens,
            completionTokens: result!.tokenUsage.completionTokens,
            totalTokens: result!.tokenUsage.totalTokens,
            toolInvocations: (result!.toolInvocations as any) || [],
            structuredOutput: (result!.structuredOutput as any) || null,
          },
        });
      });

      aiLogger.info("RECOMMENDATION_JOB_COMPLETED", {
        profileId,
        tenantId,
        status: "COMPLETED",
        latencyMs: totalLatencyMs,
        score: result!.structuredOutput.score,
        recommended: result!.structuredOutput.recommended,
        totalTokens: result!.tokenUsage.totalTokens,
      });

      return true;
    } else {
      // 8. Handle Standard Failure
      await this.markProfileFailed(
        profileId,
        result!.errorCode || "EVALUATION_FAILED",
        result!.errorMessage || "Agent evaluation failed",
        result,
        totalLatencyMs
      );

      aiLogger.warn("RECOMMENDATION_JOB_FAILED", {
        profileId,
        tenantId,
        status: result!.status,
        latencyMs: totalLatencyMs,
        errorCode: result!.errorCode,
        errorMessage: result!.errorMessage,
      });

      return false;
    }
  }

  private async markProfileFailed(
    profileId: number,
    errorCode: string,
    errorMessage: string,
    result?: any,
    latencyMs?: number,
    terminal = false
  ) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.hiringProfile.update({
          where: { id: profileId },
          data: {
            recommendationStatus: RecommendationStatus.FAILED,
            recommendationReason:
              terminal && errorCode === "LLM_AUTHENTICATION_ERROR"
                ? `Terminal failure: ${errorMessage}`
                : `Processing failed: ${errorMessage}`,
            recommendationLatencyMs: latencyMs ?? null,
          },
        });

        await tx.agentRun.create({
          data: {
            profileId,
            provider: result?.provider || "groq",
            model: result?.model || "llama-3.3-70b-versatile",
            startedAt: result?.startedAt || new Date(),
            completedAt: result?.completedAt || new Date(),
            status: result?.status === "TIMEOUT" ? "TIMEOUT" : "FAILED",
            retryCount: result?.retryCount || 0,
            latencyMs: latencyMs ?? 0,
            promptTokens: result?.tokenUsage?.promptTokens || 0,
            completionTokens: result?.tokenUsage?.completionTokens || 0,
            totalTokens: result?.tokenUsage?.totalTokens || 0,
            toolInvocations: (result?.toolInvocations as any) || [],
            errorCode,
            errorMessage,
          },
        });
      });
    } catch (dbErr) {
      aiLogger.error("RECOMMENDATION_PERSIST_FAILURE_ERROR", { profileId, error: (dbErr as any).message });
    }
  }
}
