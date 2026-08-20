import { describe, it, expect } from "vitest";
import {
  calculateDeterministicScore,
  calculateExperienceScore,
  calculateLocationScore,
  calculateSkillScore,
  determineThresholdCategory,
} from "@/services/ai/tools/deterministicScorer.js";

describe("Deterministic Matching & Scoring Engine", () => {
  describe("Experience Matching Logic", () => {
    it("returns 0.0 when candidate experience is below minimum required", () => {
      expect(calculateExperienceScore(2, 5, 8)).toBe(0.0);
      expect(calculateExperienceScore(0, 1, 3)).toBe(0.0);
      expect(calculateExperienceScore(4, 5, null)).toBe(0.0);
    });

    it("returns 1.0 when candidate experience is within the inclusive range", () => {
      expect(calculateExperienceScore(5, 5, 8)).toBe(1.0); // Exact min boundary
      expect(calculateExperienceScore(6, 5, 8)).toBe(1.0); // Mid range
      expect(calculateExperienceScore(8, 5, 8)).toBe(1.0); // Exact max boundary
    });

    it("returns 0.8 when candidate experience exceeds maximum (overqualified penalty)", () => {
      expect(calculateExperienceScore(9, 5, 8)).toBe(0.8);
      expect(calculateExperienceScore(15, 3, 7)).toBe(0.8);
    });

    it("returns 1.0 when maxExp is null/undefined and candidateExp >= minExp", () => {
      expect(calculateExperienceScore(5, 5, null)).toBe(1.0);
      expect(calculateExperienceScore(12, 5, undefined)).toBe(1.0);
    });

    it("handles invalid or negative experience safely", () => {
      expect(calculateExperienceScore(-1, 5, 8)).toBe(0.0);
      expect(calculateExperienceScore(NaN, 5, 8)).toBe(0.0);
    });
  });

  describe("Skill Matching Logic", () => {
    it("returns 1.0 when all required skills are present in candidate skills", () => {
      const candidateSkills = ["React", "TypeScript", "Node.js", "PostgreSQL", "Docker"];
      const requiredSkills = ["react.js", "ts", "postgres"];
      expect(calculateSkillScore(candidateSkills, requiredSkills)).toBe(1.0);
    });

    it("returns proportional overlap score when subset of required skills match", () => {
      const candidateSkills = ["React", "TypeScript"];
      const requiredSkills = ["react", "typescript", "docker", "kubernetes"];
      // 2 / 4 = 0.5
      expect(calculateSkillScore(candidateSkills, requiredSkills)).toBe(0.5);
    });

    it("returns 0.0 when none of the required skills match", () => {
      const candidateSkills = ["Java", "Spring Boot"];
      const requiredSkills = ["React", "Node.js"];
      expect(calculateSkillScore(candidateSkills, requiredSkills)).toBe(0.0);
    });

    it("returns 1.0 (conservative non-penalizing default) when requiredSkills is empty", () => {
      const candidateSkills = ["React", "TypeScript"];
      expect(calculateSkillScore(candidateSkills, [])).toBe(1.0);
      expect(calculateSkillScore(candidateSkills, null as any)).toBe(1.0);
    });
  });

  describe("Location Matching Logic", () => {
    it("returns 1.0 when opening location is Remote", () => {
      expect(calculateLocationScore("San Francisco", "Remote")).toBe(1.0);
      expect(calculateLocationScore("New York", "remote")).toBe(1.0);
    });

    it("returns 1.0 when candidate location is Remote", () => {
      expect(calculateLocationScore("Remote", "New York")).toBe(1.0);
    });

    it("returns 1.0 when opening location is not specified", () => {
      expect(calculateLocationScore("Austin", null)).toBe(1.0);
      expect(calculateLocationScore("Austin", "")).toBe(1.0);
    });

    it("returns 1.0 for exact case-insensitive location match", () => {
      expect(calculateLocationScore("San Francisco, CA", "san francisco, ca")).toBe(1.0);
      expect(calculateLocationScore("Austin", "Austin")).toBe(1.0);
    });

    it("returns 0.5 for onsite location mismatch", () => {
      expect(calculateLocationScore("New York", "San Francisco")).toBe(0.5);
      expect(calculateLocationScore("London", "Berlin")).toBe(0.5);
    });
  });

  describe("Decision Thresholds", () => {
    it("categorizes scores correctly across threshold boundaries", () => {
      expect(determineThresholdCategory(0.75)).toBe("RECOMMENDED");
      expect(determineThresholdCategory(0.92)).toBe("RECOMMENDED");
      expect(determineThresholdCategory(0.749)).toBe("BORDERLINE");
      expect(determineThresholdCategory(0.50)).toBe("BORDERLINE");
      expect(determineThresholdCategory(0.499)).toBe("NOT_RECOMMENDED");
      expect(determineThresholdCategory(0.20)).toBe("NOT_RECOMMENDED");
    });
  });

  describe("Full Score Formula: 0.5*Skill + 0.3*Exp + 0.2*Loc", () => {
    it("computes exact score for a top candidate (1.0, 1.0, 1.0 => 1.0 RECOMMENDED)", () => {
      const result = calculateDeterministicScore({
        candidateExp: 5,
        minExp: 3,
        maxExp: 7,
        candidateSkills: ["React", "TypeScript", "Node.js"],
        requiredSkills: ["react", "typescript"],
        candidateLocation: "San Francisco",
        openingLocation: "San Francisco",
      });

      expect(result.experienceMatchScore).toBe(1.0);
      expect(result.skillMatchScore).toBe(1.0);
      expect(result.locationMatchScore).toBe(1.0);
      expect(result.finalScore).toBe(1.0);
      expect(result.thresholdCategory).toBe("RECOMMENDED");
    });

    it("computes exact score for a borderline candidate (0.5S, 1.0E, 0.5L => 0.65 BORDERLINE)", () => {
      const result = calculateDeterministicScore({
        candidateExp: 4,
        minExp: 3,
        maxExp: 6,
        candidateSkills: ["React", "CSS"],
        requiredSkills: ["react", "typescript"], // 1/2 = 0.5
        candidateLocation: "Boston",
        openingLocation: "New York", // 0.5
      });

      // 0.5 * 0.5 + 0.3 * 1.0 + 0.2 * 0.5 = 0.25 + 0.30 + 0.10 = 0.65
      expect(result.skillMatchScore).toBe(0.5);
      expect(result.experienceMatchScore).toBe(1.0);
      expect(result.locationMatchScore).toBe(0.5);
      expect(result.finalScore).toBe(0.65);
      expect(result.thresholdCategory).toBe("BORDERLINE");
    });

    it("computes exact score for underqualified candidate (0S, 0E, 0.5L => 0.10 NOT_RECOMMENDED)", () => {
      const result = calculateDeterministicScore({
        candidateExp: 1,
        minExp: 5,
        maxExp: 8, // exp = 0
        candidateSkills: ["Ruby"],
        requiredSkills: ["Python", "Go"], // skill = 0
        candidateLocation: "London",
        openingLocation: "Berlin", // loc = 0.5
      });

      // 0.5*0 + 0.3*0 + 0.2*0.5 = 0.10
      expect(result.skillMatchScore).toBe(0);
      expect(result.experienceMatchScore).toBe(0);
      expect(result.locationMatchScore).toBe(0.5);
      expect(result.finalScore).toBe(0.1);
      expect(result.thresholdCategory).toBe("NOT_RECOMMENDED");
    });

    it("computes exact score for overqualified candidate with remote opening (0.8E, 1.0S, 1.0L => 0.94 RECOMMENDED)", () => {
      const result = calculateDeterministicScore({
        candidateExp: 12,
        minExp: 3,
        maxExp: 6, // 0.8
        candidateSkills: ["React", "TypeScript"],
        requiredSkills: ["react", "typescript"], // 1.0
        candidateLocation: "Seattle",
        openingLocation: "Remote", // 1.0
      });

      // 0.5*1.0 + 0.3*0.8 + 0.2*1.0 = 0.5 + 0.24 + 0.2 = 0.94
      expect(result.finalScore).toBe(0.94);
      expect(result.thresholdCategory).toBe("RECOMMENDED");
    });
  });
});
