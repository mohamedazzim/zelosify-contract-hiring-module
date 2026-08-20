// src/services/ai/validators/schemaDefinitions.ts

/**
 * JSON Schemas for Agent Tools and Final Output Validation
 */

export const parsedResumeSchema = {
  type: "object",
  properties: {
    rawTextSanitized: { type: "string" },
    pageCount: { type: "integer", minimum: 1 },
    format: { type: "string", enum: ["PDF", "PPTX"] },
    characterCount: { type: "integer", minimum: 0 },
    truncated: { type: "boolean" },
  },
  required: ["rawTextSanitized", "pageCount", "format", "characterCount", "truncated"],
  additionalProperties: false,
};

export const extractedFeaturesSchema = {
  type: "object",
  properties: {
    experienceYears: { type: "number", minimum: 0, maximum: 60 },
    skills: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    location: { type: "string" },
    education: {
      type: "array",
      items: { type: "string" },
    },
    keywords: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["experienceYears", "skills", "location", "education", "keywords"],
  additionalProperties: false,
};

export const normalizedSkillsSchema = {
  type: "object",
  properties: {
    normalizedSkills: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    originalCount: { type: "integer", minimum: 0 },
    normalizedCount: { type: "integer", minimum: 0 },
  },
  required: ["normalizedSkills", "originalCount", "normalizedCount"],
  additionalProperties: false,
};

export const deterministicScoreSchema = {
  type: "object",
  properties: {
    skillMatchScore: { type: "number", minimum: 0, maximum: 1 },
    experienceMatchScore: { type: "number", minimum: 0, maximum: 1 },
    locationMatchScore: { type: "number", minimum: 0, maximum: 1 },
    finalScore: { type: "number", minimum: 0, maximum: 1 },
    thresholdCategory: {
      type: "string",
      enum: ["RECOMMENDED", "BORDERLINE", "NOT_RECOMMENDED"],
    },
  },
  required: [
    "skillMatchScore",
    "experienceMatchScore",
    "locationMatchScore",
    "finalScore",
    "thresholdCategory",
  ],
  additionalProperties: false,
};

export const finalRecommendationSchema = {
  type: "object",
  properties: {
    recommended: { type: "boolean" },
    score: { type: "number", minimum: 0, maximum: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", minLength: 10, maxLength: 2000 },
  },
  required: ["recommended", "score", "confidence", "reason"],
  additionalProperties: false,
};
