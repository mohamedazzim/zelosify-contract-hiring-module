// src/services/ai/tools/skillNormalizer.ts

import { NormalizedSkillsOutput } from "../types/aiTypes.js";

/**
 * Explicit canonical skill dictionary.
 * Maps common variations, abbreviations, and synonyms to their canonical name.
 */
export const CANONICAL_SKILL_MAP: Record<string, string> = {
  // JavaScript / TypeScript ecosystem
  "js": "javascript",
  "javascript": "javascript",
  "es6": "javascript",
  "ts": "typescript",
  "typescript": "typescript",
  "react": "react",
  "reactjs": "react",
  "react.js": "react",
  "react native": "react native",
  "nextjs": "nextjs",
  "next.js": "nextjs",
  "next": "nextjs",
  "vue": "vue",
  "vuejs": "vue",
  "vue.js": "vue",
  "angular": "angular",
  "angularjs": "angular",
  "angular.js": "angular",
  "node": "nodejs",
  "nodejs": "nodejs",
  "node.js": "nodejs",
  "express": "express",
  "expressjs": "express",
  "express.js": "express",
  "nest": "nestjs",
  "nestjs": "nestjs",
  "nest.js": "nestjs",
  "redux": "redux",
  "redux-toolkit": "redux",
  "rtk": "redux",
  "tailwind": "tailwind css",
  "tailwindcss": "tailwind css",
  "tailwind css": "tailwind css",

  // Python ecosystem
  "py": "python",
  "python": "python",
  "python3": "python",
  "django": "django",
  "flask": "flask",
  "fastapi": "fastapi",
  "numpy": "numpy",
  "pandas": "pandas",
  "pytorch": "pytorch",
  "tensorflow": "tensorflow",

  // Java & JVM
  "java": "java",
  "spring": "spring boot",
  "springboot": "spring boot",
  "spring boot": "spring boot",
  "kotlin": "kotlin",
  "scala": "scala",

  // C / C++ / C# / .NET
  "c": "c",
  "c++": "c++",
  "cpp": "c++",
  "c#": "c#",
  "csharp": "c#",
  "dotnet": ".net",
  ".net": ".net",
  ".net core": ".net core",
  "asp.net": "asp.net",

  // Go / Rust / PHP / Ruby
  "go": "golang",
  "golang": "golang",
  "rust": "rust",
  "php": "php",
  "laravel": "laravel",
  "ruby": "ruby",
  "rails": "ruby on rails",
  "ruby on rails": "ruby on rails",

  // Databases
  "postgres": "postgresql",
  "postgresql": "postgresql",
  "psql": "postgresql",
  "mysql": "mysql",
  "mongo": "mongodb",
  "mongodb": "mongodb",
  "redis": "redis",
  "elasticsearch": "elasticsearch",
  "cassandra": "cassandra",
  "dynamodb": "dynamodb",
  "prisma": "prisma",

  // Cloud & DevOps
  "aws": "aws",
  "amazon web services": "aws",
  "gcp": "gcp",
  "google cloud": "gcp",
  "google cloud platform": "gcp",
  "azure": "azure",
  "microsoft azure": "azure",
  "docker": "docker",
  "containerization": "docker",
  "k8s": "kubernetes",
  "kubernetes": "kubernetes",
  "terraform": "terraform",
  "ci/cd": "ci/cd",
  "cicd": "ci/cd",
  "git": "git",
  "github": "git",

  // Testing & Tooling
  "vitest": "vitest",
  "jest": "jest",
  "cypress": "cypress",
  "playwright": "playwright",
  "graphql": "graphql",
  "rest": "rest api",
  "rest api": "rest api",
  "restful": "rest api",
};

/**
 * Cleans a single skill string by trimming, lowercasing, and normalizing punctuation.
 */
export function cleanSkillString(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let cleaned = raw.trim().toLowerCase();
  // Collapse multiple spaces/dashes
  cleaned = cleaned.replace(/[\t\r\n]+/g, " ").replace(/\s{2,}/g, " ");
  return cleaned;
}

/**
 * Normalizes a single skill using the canonical dictionary or fallback clean string.
 */
export function normalizeSingleSkill(skill: string): string {
  const cleaned = cleanSkillString(skill);
  if (!cleaned) return "";
  return CANONICAL_SKILL_MAP[cleaned] || cleaned;
}

/**
 * Normalizes an array of skills, deduplicates them, and preserves unknown skills.
 */
export function normalizeSkills(skills: string[]): NormalizedSkillsOutput {
  if (!Array.isArray(skills)) {
    return {
      normalizedSkills: [],
      originalCount: 0,
      normalizedCount: 0,
    };
  }

  const seen = new Set<string>();
  const normalizedList: string[] = [];

  for (const raw of skills) {
    const canonical = normalizeSingleSkill(raw);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      normalizedList.push(canonical);
    }
  }

  return {
    normalizedSkills: normalizedList,
    originalCount: skills.length,
    normalizedCount: normalizedList.length,
  };
}
