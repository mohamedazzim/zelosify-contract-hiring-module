// src/services/ai/tools/deterministicScorer.ts

import {
  DeterministicScoreBreakdown,
  DeterministicScoreInput,
  ScoreThresholdCategory,
} from "../types/aiTypes.js";
import { normalizeSkills } from "./skillNormalizer.js";

/**
 * Computes experience match score based on candidate years vs opening min/max bounds.
 *
 * Rules:
 * - candidateExp < minExp => 0.0
 * - maxExp is null/undefined: candidateExp >= minExp => 1.0
 * - candidateExp >= minExp && candidateExp <= maxExp => 1.0 (within range)
 * - candidateExp > maxExp => 0.8 (overqualified penalty)
 */
export function calculateExperienceScore(
  candidateExp: number,
  minExp: number,
  maxExp?: number | null
): number {
  if (typeof candidateExp !== "number" || isNaN(candidateExp) || candidateExp < 0) {
    return 0.0;
  }
  const safeMin = Math.max(0, minExp ?? 0);

  if (candidateExp < safeMin) {
    return 0.0;
  }

  if (maxExp === null || maxExp === undefined) {
    return 1.0;
  }

  if (candidateExp <= maxExp) {
    return 1.0;
  }

  // Candidate exceeds maximum experience requirement
  return 0.8;
}

/**
 * Computes skill match score as ratio of required skills possessed by the candidate.
 *
 * Rules:
 * - Overlap is computed using normalized skill taxonomy.
 * - Clamped to [0.0, 1.0].
 * - When requiredSkills is empty, returns 1.0 (conservative non-penalizing default).
 */
export function calculateSkillScore(
  candidateSkills: string[],
  requiredSkills: string[]
): number {
  if (!Array.isArray(requiredSkills) || requiredSkills.length === 0) {
    // Documented Conservative Default: If opening specifies 0 required skills,
    // candidate is not penalized for skill matching.
    return 1.0;
  }

  const normCandidate = new Set(normalizeSkills(candidateSkills).normalizedSkills);
  const normRequired = normalizeSkills(requiredSkills).normalizedSkills;

  if (normRequired.length === 0) {
    return 1.0;
  }

  let overlapCount = 0;
  for (const req of normRequired) {
    if (normCandidate.has(req)) {
      overlapCount++;
    }
  }

  const rawScore = overlapCount / normRequired.length;
  return Math.min(1.0, Math.max(0.0, Number(rawScore.toFixed(4))));
}

/**
 * Computes location match score.
 *
 * Rules:
 * - opening is "Remote" (case-insensitive) => 1.0
 * - candidate is "Remote" (case-insensitive) => 1.0
 * - opening is null/empty/undefined => 1.0
 * - exact case-insensitive location match => 1.0
 * - onsite mismatch => 0.5
 */
export function calculateLocationScore(
  candidateLocation: string,
  openingLocation?: string | null
): number {
  if (!openingLocation || typeof openingLocation !== "string" || openingLocation.trim() === "") {
    return 1.0;
  }

  const openingLoc = openingLocation.trim().toLowerCase();
  const candLoc = (candidateLocation || "").trim().toLowerCase();

  if (openingLoc === "remote" || candLoc === "remote") {
    return 1.0;
  }

  if (candLoc === openingLoc) {
    return 1.0;
  }

  // Partial match fallback (e.g. "San Francisco, CA" matches "San Francisco")
  if (candLoc.includes(openingLoc) || openingLoc.includes(candLoc)) {
    return 1.0;
  }

  // Onsite mismatch
  return 0.5;
}

/**
 * Categorizes a final numerical score into mandatory decision thresholds.
 *
 * Thresholds:
 * - score >= 0.75 => RECOMMENDED
 * - 0.50 <= score < 0.75 => BORDERLINE
 * - score < 0.50 => NOT_RECOMMENDED
 */
export function determineThresholdCategory(score: number): ScoreThresholdCategory {
  if (score >= 0.75) {
    return "RECOMMENDED";
  }
  if (score >= 0.50) {
    return "BORDERLINE";
  }
  return "NOT_RECOMMENDED";
}

/**
 * Computes the mandatory weighted final deterministic score and breakdown.
 * Formula: FinalScore = (0.5 * skill) + (0.3 * exp) + (0.2 * location)
 *
 * Pure function: Never accepts a caller-provided final score.
 */
export function calculateDeterministicScore(
  input: DeterministicScoreInput
): DeterministicScoreBreakdown {
  const experienceMatchScore = calculateExperienceScore(
    input.candidateExp,
    input.minExp,
    input.maxExp
  );

  const skillMatchScore = calculateSkillScore(
    input.candidateSkills,
    input.requiredSkills
  );

  const locationMatchScore = calculateLocationScore(
    input.candidateLocation,
    input.openingLocation
  );

  const rawFinalScore =
    0.5 * skillMatchScore +
    0.3 * experienceMatchScore +
    0.2 * locationMatchScore;

  const finalScore = Number(rawFinalScore.toFixed(4));
  const thresholdCategory = determineThresholdCategory(finalScore);

  return {
    skillMatchScore,
    experienceMatchScore,
    locationMatchScore,
    finalScore,
    thresholdCategory,
  };
}
