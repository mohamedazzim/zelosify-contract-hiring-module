import { describe, it, expect } from "vitest";
import {
  validateDeterministicScore,
  validateExtractedFeatures,
  validateFinalRecommendation,
  validateNormalizedSkills,
  validateParsedResume,
} from "@/services/ai/validators/agentValidators.js";

describe("AJV Schema Validators for AI Agent", () => {
  describe("validateParsedResume", () => {
    it("accepts valid parsed resume payload", () => {
      const valid = {
        rawTextSanitized: "Candidate resume content",
        pageCount: 2,
        format: "PDF",
        characterCount: 24,
        truncated: false,
      };
      const result = validateParsedResume(valid);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(valid);
    });

    it("rejects invalid format enum and extra properties", () => {
      const invalid = {
        rawTextSanitized: "Resume",
        pageCount: 1,
        format: "DOCX", // Not PDF or PPTX
        characterCount: 6,
        truncated: false,
        extraProperty: "not allowed",
      };
      const result = validateParsedResume(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe("validateExtractedFeatures", () => {
    it("accepts valid extracted features", () => {
      const valid = {
        experienceYears: 5,
        skills: ["react", "typescript"],
        location: "San Francisco",
        education: ["B.S. CS"],
        keywords: ["frontend"],
      };
      const result = validateExtractedFeatures(valid);
      expect(result.valid).toBe(true);
      expect(result.data?.experienceYears).toBe(5);
    });

    it("rejects negative experience or missing required fields", () => {
      const invalid = {
        experienceYears: -2,
        skills: ["react"],
        // missing location, education, keywords
      };
      const result = validateExtractedFeatures(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.message.includes("must be >= 0"))).toBe(true);
    });
  });

  describe("validateNormalizedSkills", () => {
    it("accepts valid normalized skills payload", () => {
      const valid = {
        normalizedSkills: ["react", "nodejs"],
        originalCount: 4,
        normalizedCount: 2,
      };
      const result = validateNormalizedSkills(valid);
      expect(result.valid).toBe(true);
    });

    it("rejects negative counts", () => {
      const invalid = {
        normalizedSkills: ["react"],
        originalCount: -1,
        normalizedCount: 1,
      };
      const result = validateNormalizedSkills(invalid);
      expect(result.valid).toBe(false);
    });
  });

  describe("validateDeterministicScore", () => {
    it("accepts valid deterministic score breakdown", () => {
      const valid = {
        skillMatchScore: 0.8,
        experienceMatchScore: 1.0,
        locationMatchScore: 1.0,
        finalScore: 0.9,
        thresholdCategory: "RECOMMENDED",
      };
      const result = validateDeterministicScore(valid);
      expect(result.valid).toBe(true);
    });

    it("rejects scores outside [0, 1] range or invalid threshold categories", () => {
      const invalid = {
        skillMatchScore: 1.5, // > 1
        experienceMatchScore: 1.0,
        locationMatchScore: 1.0,
        finalScore: 1.25,
        thresholdCategory: "SUPER_MATCH", // Invalid enum
      };
      const result = validateDeterministicScore(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("validateFinalRecommendation", () => {
    it("accepts valid final recommendation output", () => {
      const valid = {
        recommended: true,
        score: 0.82,
        confidence: 0.91,
        reason: "Strong skill match (80%) and experience within required range.",
      };
      const result = validateFinalRecommendation(valid);
      expect(result.valid).toBe(true);
      expect(result.data?.recommended).toBe(true);
    });

    it("rejects short reasons or extra fields", () => {
      const invalid = {
        recommended: true,
        score: 0.82,
        confidence: 0.91,
        reason: "Short", // < 10 chars
        unauthorizedField: "hacked",
      };
      const result = validateFinalRecommendation(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.field === "unauthorizedField" || e.field === "reason")).toBe(true);
    });
  });
});
