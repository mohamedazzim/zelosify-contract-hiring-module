// src/services/ai/queue/startupRecovery.ts

import prisma from "../../../config/prisma/prisma.js";
import { ProfileStatus, RecommendationStatus } from "@prisma/client";
import { recommendationQueue } from "./recommendationQueue.js";
import { aiLogger } from "../logger/aiLogger.js";
import { MAX_RECOMMENDATION_ATTEMPTS, MAX_ATTEMPTS_ERROR_CODE } from "../recommendationService.js";

const STALE_PROCESSING_THRESHOLD_MS = 60000; // 60 seconds

let isRecoveryInitialized = false;

/**
 * Recovers stale PROCESSING and unhandled PENDING recommendation profiles on server startup.
 * Idempotent: Only executes once per process lifetime.
 *
 * Durable-attempt safety:
 *  - Only genuinely stale PROCESSING records (older than the threshold) are reset.
 *  - PENDING profiles are re-enqueued ONLY while their persisted attempt count is
 *    below MAX_RECOMMENDATION_ATTEMPTS.
 *  - Terminal FAILED profiles are NEVER re-enqueued automatically. A profile whose
 *    attempt count reached the max is additionally stamped with the terminal
 *    MAX_RECOMMENDATION_ATTEMPTS_EXCEEDED error so it is clearly unrecoverable.
 *  - The attempt counter is durable, so a process restart cannot reset it.
 */
export async function recoverPendingAndStaleRecommendations(): Promise<{
  recoveredStale: number;
  enqueuedPending: number;
}> {
  if (isRecoveryInitialized) {
    aiLogger.info("STARTUP_RECOVERY_ALREADY_INITIALIZED", {});
    return { recoveredStale: 0, enqueuedPending: 0 };
  }

  isRecoveryInitialized = true;
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);

  try {
    // 1. Reset stale PROCESSING records to PENDING — but only those still within
    //    their durable attempt budget. Profiles that already exhausted their
    //    attempts stay PROCESSING-free (they get stamped terminal below).
    const resetResult = await prisma.hiringProfile.updateMany({
      where: {
        recommendationStatus: RecommendationStatus.PROCESSING,
        status: ProfileStatus.SUBMITTED,
        isDeleted: false,
        submittedAt: { lt: staleCutoff },
        recommendationAttemptCount: { lt: MAX_RECOMMENDATION_ATTEMPTS },
      },
      data: {
        recommendationStatus: RecommendationStatus.PENDING,
      },
    });

    if (resetResult.count > 0) {
      aiLogger.info("STARTUP_STALE_PROFILES_RESET", {
        count: resetResult.count,
      });
    }

    // 1b. Stamp exhausted profiles (at max attempts and still not COMPLETED) as
    //     terminal FAILED with the explicit error code. This makes their terminal
    //     state visible and guarantees recovery never touches them again.
    const exhausted = await prisma.hiringProfile.updateMany({
      where: {
        recommendationStatus: { in: [RecommendationStatus.PENDING, RecommendationStatus.PROCESSING, RecommendationStatus.FAILED] },
        isDeleted: false,
        recommendationAttemptCount: { gte: MAX_RECOMMENDATION_ATTEMPTS },
        NOT: { recommendationStatus: RecommendationStatus.COMPLETED },
      },
      data: {
        recommendationStatus: RecommendationStatus.FAILED,
        recommendationReason: `Maximum recommendation attempts (${MAX_RECOMMENDATION_ATTEMPTS}) exceeded`,
      },
    });
    if (exhausted.count > 0) {
      aiLogger.warn("STARTUP_EXHAUSTED_PROFILES_TERMINAL", {
        count: exhausted.count,
        maxAttempts: MAX_RECOMMENDATION_ATTEMPTS,
        errorCode: MAX_ATTEMPTS_ERROR_CODE,
      });
    }

    // 2. Fetch only PENDING profiles that still have durable attempt budget left.
    //    FAILED profiles are intentionally excluded — they are never auto-retried.
    const pendingProfiles = await prisma.hiringProfile.findMany({
      where: {
        recommendationStatus: RecommendationStatus.PENDING,
        status: ProfileStatus.SUBMITTED,
        isDeleted: false,
        recommendationAttemptCount: { lt: MAX_RECOMMENDATION_ATTEMPTS },
      },
      select: {
        id: true,
        openingId: true,
        s3Key: true,
        opening: {
          select: {
            tenantId: true,
          },
        },
      },
      take: 200,
    });

    let enqueuedCount = 0;
    for (const p of pendingProfiles) {
      if (p.opening?.tenantId) {
        const enqueued = recommendationQueue.enqueue({
          profileId: p.id,
          openingId: p.openingId,
          tenantId: p.opening.tenantId,
          s3Key: p.s3Key,
        });
        if (enqueued) enqueuedCount++;
      }
    }

    aiLogger.info("STARTUP_RECOVERY_COMPLETED", {
      recoveredStale: resetResult.count,
      enqueuedPending: enqueuedCount,
    });

    return {
      recoveredStale: resetResult.count,
      enqueuedPending: enqueuedCount,
    };
  } catch (err: any) {
    aiLogger.error("STARTUP_RECOVERY_ERROR", {
      error: err.message,
    });
    return { recoveredStale: 0, enqueuedPending: 0 };
  }
}
