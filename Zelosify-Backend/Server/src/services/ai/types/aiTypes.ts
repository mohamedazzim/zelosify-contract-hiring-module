// src/services/ai/types/aiTypes.ts

export type DocumentFormat = "PDF" | "PPTX";

export interface DocumentParserOptions {
  maxFileSizeBytes?: number; // default 10MB (10 * 1024 * 1024)
  maxCharacterLimit?: number; // default 10,000 characters
}

export interface ParsedResumeOutput {
  rawTextSanitized: string;
  pageCount: number;
  format: DocumentFormat;
  characterCount: number;
  truncated: boolean;
}

export interface SanitizationRedactions {
  emailsRedacted: number;
  phonesRedacted: number;
  addressesRedacted: number;
  delimitersNeutralized: number;
  controlCharsRemoved: number;
}

export interface SanitizationResult {
  sanitizedText: string;
  characterCount: number;
  truncated: boolean;
  redactions: SanitizationRedactions;
}

export interface ExtractedFeatures {
  experienceYears: number;
  skills: string[];
  location: string;
  education: string[];
  keywords: string[];
}

export interface NormalizedSkillsOutput {
  normalizedSkills: string[];
  originalCount: number;
  normalizedCount: number;
}

export type ScoreThresholdCategory = "RECOMMENDED" | "BORDERLINE" | "NOT_RECOMMENDED";

export interface DeterministicScoreInput {
  candidateExp: number;
  minExp: number;
  maxExp?: number | null;
  candidateSkills: string[];
  requiredSkills: string[];
  candidateLocation: string;
  openingLocation?: string | null;
}

export interface DeterministicScoreBreakdown {
  skillMatchScore: number;
  experienceMatchScore: number;
  locationMatchScore: number;
  finalScore: number;
  thresholdCategory: ScoreThresholdCategory;
}

export interface FinalRecommendationOutput {
  recommended: boolean;
  score: number;
  confidence: number;
  reason: string;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  schemaPath: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}
