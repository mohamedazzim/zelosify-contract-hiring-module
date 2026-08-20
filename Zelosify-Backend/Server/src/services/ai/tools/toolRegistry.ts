// src/services/ai/tools/toolRegistry.ts

import Ajv from "ajv";
import { LlmToolDefinition } from "../types/llmTypes.js";
import {
  parseResumeDocument,
} from "./documentParser.js";
import {
  extractResumeFeatures,
} from "./featureExtractor.js";
import {
  normalizeSkills,
} from "./skillNormalizer.js";
import {
  calculateDeterministicScore,
} from "./deterministicScorer.js";
import {
  deterministicScoreSchema,
  extractedFeaturesSchema,
  normalizedSkillsSchema,
  parsedResumeSchema,
} from "../validators/schemaDefinitions.js";
import {
  validateDeterministicScore,
  validateExtractedFeatures,
  validateNormalizedSkills,
  validateParsedResume,
} from "../validators/agentValidators.js";

const ajv = new Ajv({ allErrors: true });

// Input parameter schemas for each tool
export const parseResumeInputSchema = {
  type: "object",
  properties: {
    s3Key: {
      type: "string",
      minLength: 1,
      description: "The secure S3 storage key where the candidate's resume is stored.",
    },
  },
  required: ["s3Key"],
  additionalProperties: false,
};

export const extractFeaturesInputSchema = {
  type: "object",
  properties: {
    sanitizedResumeText: {
      type: "string",
      minLength: 1,
      description: "The sanitized text of the candidate's resume extracted by parse_resume_document.",
    },
  },
  required: ["sanitizedResumeText"],
  additionalProperties: false,
};

export const normalizeSkillsInputSchema = {
  type: "object",
  properties: {
    rawSkills: {
      type: "array",
      items: { type: "string", minLength: 1 },
      description: "Array of raw technical skill names extracted from candidate or opening criteria.",
    },
  },
  required: ["rawSkills"],
  additionalProperties: false,
};

export const calculateScoreInputSchema = {
  type: "object",
  properties: {
    candidateExp: {
      type: "number",
      minimum: 0,
      description: "The total years of relevant experience extracted from the candidate resume.",
    },
    minExp: {
      type: "number",
      minimum: 0,
      description: "The minimum years of experience required by the opening.",
    },
    maxExp: {
      type: ["number", "null"],
      description: "The maximum years of experience desired by the opening (or null if open-ended).",
    },
    candidateSkills: {
      type: "array",
      items: { type: "string" },
      description: "Array of technical skills possessed by the candidate.",
    },
    requiredSkills: {
      type: "array",
      items: { type: "string" },
      description: "Array of mandatory skills specified in the job opening criteria.",
    },
    candidateLocation: {
      type: "string",
      description: "The location/city of the candidate or 'Remote'.",
    },
    openingLocation: {
      type: ["string", "null"],
      description: "The location of the job opening or 'Remote'.",
    },
  },
  required: ["candidateExp", "minExp", "candidateSkills", "requiredSkills", "candidateLocation"],
  additionalProperties: false,
};

export interface ToolExecutionResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  validateInput: (input: any) => boolean;
  validateOutput: (output: any) => { valid: boolean; errors?: any[] };
  execute: (input: any, context?: any) => Promise<any>;
}

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  constructor() {
    this.registerCoreTools();
  }

  private registerCoreTools() {
    // 1. parse_resume_document
    const validateParseInput = ajv.compile(parseResumeInputSchema);
    this.register({
      name: "parse_resume_document",
      description:
        "Securely retrieves the candidate's resume from S3/MinIO (PDF or PPTX), extracts text, sanitizes input, redacts PII, and bounds length.",
      inputSchema: parseResumeInputSchema,
      outputSchema: parsedResumeSchema,
      validateInput: (input) => validateParseInput(input),
      validateOutput: (output) => validateParsedResume(output),
      execute: async (input) => {
        return await parseResumeDocument(input.s3Key);
      },
    });

    // 2. extract_candidate_features
    const validateExtractInput = ajv.compile(extractFeaturesInputSchema);
    this.register({
      name: "extract_candidate_features",
      description:
        "Extracts structured features (experienceYears, skills, location, education, keywords) from sanitized resume text using deterministic heuristics.",
      inputSchema: extractFeaturesInputSchema,
      outputSchema: extractedFeaturesSchema,
      validateInput: (input) => validateExtractInput(input),
      validateOutput: (output) => validateExtractedFeatures(output),
      execute: async (input) => {
        return extractResumeFeatures(input.sanitizedResumeText);
      },
    });

    // 3. normalize_skills
    const validateNormalizeInput = ajv.compile(normalizeSkillsInputSchema);
    this.register({
      name: "normalize_skills",
      description:
        "Normalizes raw skill strings into a canonical taxonomy and deduplicates them using an explicit synonym dictionary.",
      inputSchema: normalizeSkillsInputSchema,
      outputSchema: normalizedSkillsSchema,
      validateInput: (input) => validateNormalizeInput(input),
      validateOutput: (output) => validateNormalizedSkills(output),
      execute: async (input) => {
        return normalizeSkills(input.rawSkills);
      },
    });

    // 4. calculate_deterministic_score
    const validateScoreInput = ajv.compile(calculateScoreInputSchema);
    this.register({
      name: "calculate_deterministic_score",
      description:
        "Computes the mandatory deterministic scoring formula: 0.5*Skill + 0.3*Exp + 0.2*Loc. Returns the full mathematical breakdown and decision threshold.",
      inputSchema: calculateScoreInputSchema,
      outputSchema: deterministicScoreSchema,
      validateInput: (input) => validateScoreInput(input),
      validateOutput: (output) => validateDeterministicScore(output),
      execute: async (input) => {
        return calculateDeterministicScore({
          candidateExp: input.candidateExp,
          minExp: input.minExp,
          maxExp: input.maxExp,
          candidateSkills: input.candidateSkills,
          requiredSkills: input.requiredSkills,
          candidateLocation: input.candidateLocation,
          openingLocation: input.openingLocation,
        });
      },
    });
  }

  public register(tool: RegisteredTool): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  public getToolDefinitions(): LlmToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as LlmToolDefinition["parameters"],
    }));
  }

  /**
   * Executes a tool by name with pre- and post-execution schema validation.
   */
  public async execute(name: string, args: Record<string, any>, context?: any): Promise<ToolExecutionResponse> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: "${name}". Available tools: ${Array.from(this.tools.keys()).join(", ")}`,
      };
    }

    // 1. Validate Input Arguments
    const isInputValid = tool.validateInput(args);
    if (!isInputValid) {
      return {
        success: false,
        error: `Invalid arguments for tool "${name}". Ensure arguments match the required JSON schema.`,
      };
    }

    // 2. Execute Tool
    try {
      const rawResult = await tool.execute(args, context);

      // 3. Validate Output Structure
      const outputValidation = tool.validateOutput(rawResult);
      if (!outputValidation.valid) {
        return {
          success: false,
          error: `Tool "${name}" produced invalid output structure: ${JSON.stringify(outputValidation.errors)}`,
        };
      }

      return {
        success: true,
        data: rawResult,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Tool execution failed in "${name}": ${err.message || "Internal error"}`,
      };
    }
  }
}
