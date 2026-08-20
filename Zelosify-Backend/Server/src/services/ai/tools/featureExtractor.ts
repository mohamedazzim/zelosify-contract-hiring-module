// src/services/ai/tools/featureExtractor.ts

import { ExtractedFeatures } from "../types/aiTypes.js";
import { CANONICAL_SKILL_MAP, normalizeSkills } from "./skillNormalizer.js";

/**
 * Feature Extraction Tool
 *
 * Extracts structured features (experienceYears, skills, location, education, keywords)
 * from sanitized resume text using deterministic pattern matchers and conservative defaults.
 *
 * NOTE: This tool is callable by the LLM agent and provides deterministic fallback extraction.
 * It never invents candidate facts; unextractable fields return conservative defaults.
 */

// Common tech keywords dictionary for extraction
const TECH_SKILL_PATTERNS = Object.keys(CANONICAL_SKILL_MAP);

// Common degree / education patterns
const EDUCATION_PATTERNS = [
  /(?:^|\s|\b)(?:Bachelor(?:'s)?(?:\s+of\s+[A-Za-z]+)?|B\.?S\.?|B\.?A\.?|B\.?E\.?|B\.?Tech|BCA)(?=$|\s|[.,;:()])/gi,
  /(?:^|\s|\b)(?:Master(?:'s)?(?:\s+of\s+[A-Za-z]+)?|M\.?S\.?|M\.?A\.?|M\.?E\.?|M\.?Tech|MCA|MBA)(?=$|\s|[.,;:()])/gi,
  /(?:^|\s|\b)(?:Ph\.?D\.?|Doctorate|Doctor\s+of\s+Philosophy)(?=$|\s|[.,;:()])/gi,
  /(?:^|\s|\b)(?:Associate(?:'s)?(?:\s+Degree)?|Diploma)(?=$|\s|[.,;:()])/gi,
];

// Experience regex patterns (e.g., "5+ years of experience", "3 yrs exp", "worked from 2018 - 2024")
const EXP_YEARS_REGEX = /\b(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp|work|industry)\b/gi;
const EXP_SENIORITY_PATTERNS = [
  { pattern: /\b(?:Principal|Lead|Staff|Architect)\b/i, defaultExp: 8 },
  { pattern: /\b(?:Senior|Sr\.)\b/i, defaultExp: 5 },
  { pattern: /\b(?:Mid-level|Intermediate)\b/i, defaultExp: 3 },
  { pattern: /\b(?:Junior|Jr\.|Entry-level|Associate|Intern)\b/i, defaultExp: 1 },
];

// Location regex patterns
const LOCATION_PATTERNS = [
  /\b(?:Location|Based in|Residing in|City)\s*:\s*([A-Za-z\s,.-]+?)(?=\n|$|;|\.)/i,
  /\b(Remote|Hybrid|San Francisco|New York|Seattle|Austin|Boston|Chicago|Los Angeles|London|Berlin|Toronto|Bangalore|Hyderabad|Delhi|Singapore|Sydney)\b/i,
];

/**
 * Extracts experience years from candidate text using explicit statements or seniority cues.
 * Conservative default is 0 years.
 */
export function extractExperienceYears(text: string): number {
  if (!text) return 0;

  // 1. Check for explicit statements (e.g. "7 years of experience")
  const matches = [...text.matchAll(EXP_YEARS_REGEX)];
  if (matches.length > 0) {
    const yearsFound = matches.map((m) => parseInt(m[1], 10)).filter((y) => !isNaN(y) && y >= 0 && y <= 50);
    if (yearsFound.length > 0) {
      // Return highest explicit year mentioned in experience context
      return Math.max(...yearsFound);
    }
  }

  // 2. Check for date range heuristics (e.g. "2019 - 2024" => 5 years)
  const dateRanges = [...text.matchAll(/\b(20[0-2]\d|19[89]\d)\s*[-–—to]+\s*(20[0-2]\d|present|current)\b/gi)];
  if (dateRanges.length > 0) {
    let totalYears = 0;
    const currentYear = new Date().getFullYear();
    for (const match of dateRanges) {
      const startYear = parseInt(match[1], 10);
      const endStr = match[2].toLowerCase();
      const endYear = endStr.includes("present") || endStr.includes("current") ? currentYear : parseInt(endStr, 10);
      if (!isNaN(startYear) && !isNaN(endYear) && endYear >= startYear) {
        totalYears += (endYear - startYear);
      }
    }
    if (totalYears > 0) {
      return Math.min(totalYears, 40);
    }
  }

  // 3. Fallback to seniority heuristic if title detected
  for (const { pattern, defaultExp } of EXP_SENIORITY_PATTERNS) {
    if (pattern.test(text)) {
      return defaultExp;
    }
  }

  // Conservative default: 0 years
  return 0;
}

/**
 * Extracts candidate skills by matching against the known tech keyword dictionary.
 */
export function extractSkills(text: string): string[] {
  if (!text) return [];

  const foundSkills: string[] = [];
  const lowerText = " " + text.toLowerCase() + " ";

  for (const skill of TECH_SKILL_PATTERNS) {
    // Exact word boundary matching or punctuation-safe matching
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9#+.-])${escaped}(?:$|[^a-zA-Z0-9#+.-])`, "i");
    if (regex.test(lowerText)) {
      foundSkills.push(skill);
    }
  }

  return normalizeSkills(foundSkills).normalizedSkills;
}

/**
 * Extracts candidate location from text.
 * Conservative default is "Unknown" if not determinable.
 */
export function extractLocation(text: string): string {
  if (!text) return "Unknown";

  for (const pattern of LOCATION_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const loc = match[1].trim().replace(/[\r\n\t]+/g, " ");
      if (loc.length > 0 && loc.length < 50) {
        return loc;
      }
    }
  }

  return "Unknown";
}

/**
 * Extracts degrees and certifications.
 */
export function extractEducation(text: string): string[] {
  if (!text) return [];

  const educationFound = new Set<string>();

  for (const pattern of EDUCATION_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      educationFound.add(match[0].trim());
    }
  }

  return Array.from(educationFound);
}

/**
 * Extracts primary technical keywords and nouns.
 */
export function extractKeywords(text: string, skills: string[]): string[] {
  const keywordSet = new Set<string>(skills);
  const commonKeywords = [
    "frontend", "backend", "fullstack", "full stack", "cloud",
    "architecture", "distributed systems", "database", "security",
    "agile", "scrum", "microservices", "api", "mobile", "devops"
  ];

  const lower = text.toLowerCase();
  for (const kw of commonKeywords) {
    if (lower.includes(kw)) {
      keywordSet.add(kw);
    }
  }

  return Array.from(keywordSet).slice(0, 20);
}

/**
 * Main Feature Extraction entrypoint.
 * Pure deterministic heuristic parser with conservative fallbacks.
 */
export function extractResumeFeatures(sanitizedText: string): ExtractedFeatures {
  const experienceYears = extractExperienceYears(sanitizedText);
  const skills = extractSkills(sanitizedText);
  const location = extractLocation(sanitizedText);
  const education = extractEducation(sanitizedText);
  const keywords = extractKeywords(sanitizedText, skills);

  return {
    experienceYears,
    skills,
    location,
    education,
    keywords,
  };
}
