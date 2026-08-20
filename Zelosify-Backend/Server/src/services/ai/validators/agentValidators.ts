// src/services/ai/validators/agentValidators.ts

import Ajv, { ErrorObject } from "ajv";
import {
  DeterministicScoreBreakdown,
  ExtractedFeatures,
  FinalRecommendationOutput,
  NormalizedSkillsOutput,
  ParsedResumeOutput,
  ValidationErrorDetail,
  ValidationResult,
} from "../types/aiTypes.js";
import {
  deterministicScoreSchema,
  extractedFeaturesSchema,
  finalRecommendationSchema,
  normalizedSkillsSchema,
  parsedResumeSchema,
} from "./schemaDefinitions.js";

const ajv = new Ajv({ allErrors: true, coerceTypes: false });

const validateParsedResumeFn = ajv.compile(parsedResumeSchema);
const validateExtractedFeaturesFn = ajv.compile(extractedFeaturesSchema);
const validateNormalizedSkillsFn = ajv.compile(normalizedSkillsSchema);
const validateDeterministicScoreFn = ajv.compile(deterministicScoreSchema);
const validateFinalRecommendationFn = ajv.compile(finalRecommendationSchema);

function formatAjvErrors(errors?: ErrorObject[] | null): ValidationErrorDetail[] {
  if (!errors || errors.length === 0) return [];
  return errors.map((err) => ({
    field: err.instancePath ? err.instancePath.replace(/^\//, "") : (err.params as any)?.missingProperty || "root",
    message: err.message || "Invalid value",
    schemaPath: err.schemaPath,
  }));
}

/**
 * Validates parsed resume output against parsedResumeSchema.
 */
export function validateParsedResume(data: unknown): ValidationResult<ParsedResumeOutput> {
  const valid = validateParsedResumeFn(data);
  if (!valid) {
    return {
      valid: false,
      errors: formatAjvErrors(validateParsedResumeFn.errors),
    };
  }
  return {
    valid: true,
    data: data as unknown as ParsedResumeOutput,
  };
}

/**
 * Validates extracted features against extractedFeaturesSchema.
 */
export function validateExtractedFeatures(data: unknown): ValidationResult<ExtractedFeatures> {
  const valid = validateExtractedFeaturesFn(data);
  if (!valid) {
    return {
      valid: false,
      errors: formatAjvErrors(validateExtractedFeaturesFn.errors),
    };
  }
  return {
    valid: true,
    data: data as unknown as ExtractedFeatures,
  };
}

/**
 * Validates normalized skills against normalizedSkillsSchema.
 */
export function validateNormalizedSkills(data: unknown): ValidationResult<NormalizedSkillsOutput> {
  const valid = validateNormalizedSkillsFn(data);
  if (!valid) {
    return {
      valid: false,
      errors: formatAjvErrors(validateNormalizedSkillsFn.errors),
    };
  }
  return {
    valid: true,
    data: data as unknown as NormalizedSkillsOutput,
  };
}

/**
 * Validates deterministic score output against deterministicScoreSchema.
 */
export function validateDeterministicScore(data: unknown): ValidationResult<DeterministicScoreBreakdown> {
  const valid = validateDeterministicScoreFn(data);
  if (!valid) {
    return {
      valid: false,
      errors: formatAjvErrors(validateDeterministicScoreFn.errors),
    };
  }
  return {
    valid: true,
    data: data as unknown as DeterministicScoreBreakdown,
  };
}

/**
 * Validates final agent recommendation output against finalRecommendationSchema.
 */
export function validateFinalRecommendation(data: unknown): ValidationResult<FinalRecommendationOutput> {
  const valid = validateFinalRecommendationFn(data);
  if (!valid) {
    return {
      valid: false,
      errors: formatAjvErrors(validateFinalRecommendationFn.errors),
    };
  }
  return {
    valid: true,
    data: data as unknown as FinalRecommendationOutput,
  };
}
