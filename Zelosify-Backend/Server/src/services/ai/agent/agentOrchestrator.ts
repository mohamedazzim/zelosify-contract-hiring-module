// src/services/ai/agent/agentOrchestrator.ts

import {
  AgentExecutionResult,
  LlmClient,
  LlmMessage,
  LlmTokenUsage,
  ToolInvocationTrace,
} from "../types/llmTypes.js";
import { ToolRegistry } from "../tools/toolRegistry.js";
import { validateFinalRecommendation } from "../validators/agentValidators.js";
import { buildInitialUserMessage, buildSystemPrompt, OpeningCriteriaInput } from "./agentPrompts.js";
import { DeterministicScoreBreakdown, FinalRecommendationOutput } from "../types/aiTypes.js";

const MAX_AGENT_TURNS = 6;
const MAX_VALIDATION_RETRIES = 2;
const SCORE_FLOAT_TOLERANCE = 0.001; // Strict tolerance: rejects any deviation > 0.001

export interface AgentOrchestratorOptions {
  llmClient: LlmClient;
  toolRegistry?: ToolRegistry;
  maxTurns?: number;
}

/**
 * Truncates and bounds tool argument / output payloads for safe observability logging.
 * Guarantees that raw resume text, full prompts, and credentials are never captured.
 */
function createBoundedMetadata(obj: any, maxStringLength = 150): Record<string, any> {
  if (!obj || typeof obj !== "object") return {};
  const bounded: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Redact or bound raw resume text and sensitive fields
    if (key === "rawTextSanitized" || key === "sanitizedResumeText" || key === "resumeText") {
      bounded[key] = `[BOUNDED_TEXT: length=${typeof value === "string" ? value.length : 0} chars]`;
    } else if (typeof value === "string") {
      bounded[key] = value.length > maxStringLength ? value.slice(0, maxStringLength) + "... [TRUNCATED]" : value;
    } else if (Array.isArray(value)) {
      bounded[key] = value.slice(0, 8).map((v) => (typeof v === "string" && v.length > 40 ? v.slice(0, 40) + "..." : v));
    } else if (typeof value === "object" && value !== null) {
      bounded[key] = createBoundedMetadata(value, maxStringLength);
    } else {
      bounded[key] = value;
    }
  }

  return bounded;
}

export class AgentOrchestrator {
  private llmClient: LlmClient;
  private toolRegistry: ToolRegistry;
  private maxTurns: number;

  constructor(options: AgentOrchestratorOptions) {
    this.llmClient = options.llmClient;
    this.toolRegistry = options.toolRegistry || new ToolRegistry();
    this.maxTurns = options.maxTurns || MAX_AGENT_TURNS;
  }

  /**
   * Executes the dynamic multi-turn recommendation agent loop.
   */
  async evaluateProfile(criteria: OpeningCriteriaInput, signal?: AbortSignal): Promise<AgentExecutionResult> {
    const startedAt = new Date();
    const startTimeMs = Date.now();

    const toolInvocations: ToolInvocationTrace[] = [];
    const aggregatedTokens: LlmTokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    let retryCount = 0;
    let deterministicScoreResult: DeterministicScoreBreakdown | undefined;
    let validatedFinalOutput: FinalRecommendationOutput | undefined;
    let lastValidationErrorCode: string | undefined;
    let lastValidationErrorMessage: string | undefined;

    // Check early abort
    if (signal?.aborted) {
      return {
        success: false,
        provider: this.llmClient?.providerName || "groq",
        model: "llama-3.3-70b-versatile",
        startedAt,
        completedAt: new Date(),
        latencyMs: Date.now() - startTimeMs,
        status: "TIMEOUT",
        retryCount: 0,
        tokenUsage: aggregatedTokens,
        toolInvocations,
        errorCode: "RECOMMENDATION_SLA_EXCEEDED",
        errorMessage: "Evaluation aborted due to SLA deadline",
      };
    }

    // 1. Build initial conversation state
    const messages: LlmMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      buildInitialUserMessage(criteria),
    ];

    const toolDefinitions = this.toolRegistry.getToolDefinitions();

    // 2. Dynamic Agent Execution Loop
    for (let turn = 1; turn <= this.maxTurns; turn++) {
      if (signal?.aborted) {
        lastValidationErrorCode = "RECOMMENDATION_SLA_EXCEEDED";
        lastValidationErrorMessage = "Evaluation aborted due to SLA deadline";
        break;
      }

      let response;
      try {
        response = await this.llmClient.complete(
          {
            messages,
            tools: toolDefinitions,
          },
          signal
        );
      } catch (err: any) {
        const completedAt = new Date();
        const isTimeout = err.code === "LLM_TIMEOUT_ERROR" || signal?.aborted || err.name === "AbortError";
        return {
          success: false,
          provider: this.llmClient?.providerName || "groq",
          model: "unknown",
          startedAt,
          completedAt,
          latencyMs: Date.now() - startTimeMs,
          status: isTimeout ? "TIMEOUT" : "FAILED",
          retryCount,
          tokenUsage: aggregatedTokens,
          toolInvocations,
          errorCode: isTimeout ? "RECOMMENDATION_SLA_EXCEEDED" : err.code || "LLM_CLIENT_ERROR",
          errorMessage: isTimeout ? "Recommendation exceeded SLA timeout deadline" : err.message,
        };
      }

      // Aggregate token usage
      aggregatedTokens.promptTokens += response.tokenUsage.promptTokens;
      aggregatedTokens.completionTokens += response.tokenUsage.completionTokens;
      aggregatedTokens.totalTokens += response.tokenUsage.totalTokens;

      // Append assistant message to state
      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // 3. Handle Tool Calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          if (signal?.aborted) {
            lastValidationErrorCode = "RECOMMENDATION_SLA_EXCEEDED";
            lastValidationErrorMessage = "Evaluation aborted due to SLA deadline";
            break;
          }

          const toolStart = Date.now();
          const executionResult = await this.toolRegistry.execute(toolCall.name, toolCall.arguments, criteria);
          const toolDuration = Date.now() - toolStart;

          // Record bounded trace for safe persistence
          toolInvocations.push({
            tool: toolCall.name,
            success: executionResult.success,
            durationMs: toolDuration,
            inputBounded: createBoundedMetadata(toolCall.arguments),
            outputBounded: executionResult.success ? createBoundedMetadata(executionResult.data) : undefined,
            error: executionResult.error,
          });

          // If calculate_deterministic_score succeeded, record state
          if (toolCall.name === "calculate_deterministic_score" && executionResult.success) {
            deterministicScoreResult = executionResult.data as DeterministicScoreBreakdown;
          }

          // Append tool result message
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            name: toolCall.name,
            content: JSON.stringify(executionResult.success ? executionResult.data : { error: executionResult.error }),
          });
        }

        // Continue next turn to allow LLM to process tool results
        continue;
      }

      // 4. Handle Final Recommendation Attempt
      if (response.content) {
        // Strip markdown code fences if LLM wrapped in ```json ... ```
        let cleanedContent = response.content.trim();
        if (cleanedContent.startsWith("```")) {
          cleanedContent = cleanedContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        }

        let parsedJson: any;
        try {
          parsedJson = JSON.parse(cleanedContent);
        } catch {
          lastValidationErrorCode = "MALFORMED_JSON";
          lastValidationErrorMessage = "Assistant output could not be parsed as valid JSON";
          if (retryCount < MAX_VALIDATION_RETRIES) {
            retryCount++;
            messages.push({
              role: "user",
              content: `Malformed JSON error: Your response could not be parsed as valid JSON. Please return ONLY raw JSON matching the schema: {"recommended": boolean, "score": number, "confidence": number, "reason": string}.`,
            });
            continue;
          }
          break;
        }

        // Validate JSON Schema
        const validation = validateFinalRecommendation(parsedJson);
        if (!validation.valid) {
          lastValidationErrorCode = "SCHEMA_VALIDATION_ERROR";
          lastValidationErrorMessage = `Final recommendation failed schema validation: ${JSON.stringify(validation.errors)}`;
          if (retryCount < MAX_VALIDATION_RETRIES) {
            retryCount++;
            messages.push({
              role: "user",
              content: `Schema Validation Error: ${JSON.stringify(validation.errors)}. Ensure your response has all required fields (recommended, score, confidence, reason) with valid numeric bounds.`,
            });
            continue;
          }
          break;
        }

        // Validate that calculate_deterministic_score was executed
        if (!deterministicScoreResult) {
          lastValidationErrorCode = "MISSING_DETERMINISTIC_SCORER";
          lastValidationErrorMessage = "Agent concluded without invoking calculate_deterministic_score tool";
          if (retryCount < MAX_VALIDATION_RETRIES) {
            retryCount++;
            messages.push({
              role: "user",
              content: `Enforcement Error: You must call the 'calculate_deterministic_score' tool before submitting your final recommendation. Please invoke calculate_deterministic_score now with the candidate's extracted features.`,
            });
            continue;
          }
          break;
        }

        // Validate that score matches deterministic score within strict tolerance
        const scoreDiff = Math.abs(validation.data!.score - deterministicScoreResult.finalScore);
        if (scoreDiff > SCORE_FLOAT_TOLERANCE) {
          lastValidationErrorCode = "SCORE_MISMATCH";
          lastValidationErrorMessage = `Reported score (${validation.data!.score}) does not match deterministic tool score (${deterministicScoreResult.finalScore})`;
          if (retryCount < MAX_VALIDATION_RETRIES) {
            retryCount++;
            messages.push({
              role: "user",
              content: `Score Mismatch Error: Your reported score (${validation.data!.score}) does not match the deterministic tool score (${deterministicScoreResult.finalScore}). You must set 'score: ${deterministicScoreResult.finalScore}'.`,
            });
            continue;
          }
          break;
        }

        // Validate recommendation threshold agreement
        const expectedCategory = deterministicScoreResult.thresholdCategory;
        if (expectedCategory === "NOT_RECOMMENDED" && validation.data!.recommended === true) {
          lastValidationErrorCode = "DECISION_THRESHOLD_MISMATCH";
          lastValidationErrorMessage = `Candidate score (${deterministicScoreResult.finalScore}) is NOT_RECOMMENDED, but recommended was true`;
          if (retryCount < MAX_VALIDATION_RETRIES) {
            retryCount++;
            messages.push({
              role: "user",
              content: `Decision Mismatch Error: Candidate final score is ${deterministicScoreResult.finalScore} (< 0.50), which falls in the NOT_RECOMMENDED threshold. You must set 'recommended: false'.`,
            });
            continue;
          }
          break;
        }

        if (expectedCategory === "RECOMMENDED" && validation.data!.recommended === false) {
          lastValidationErrorCode = "DECISION_THRESHOLD_MISMATCH";
          lastValidationErrorMessage = `Candidate score (${deterministicScoreResult.finalScore}) is RECOMMENDED, but recommended was false`;
          if (retryCount < MAX_VALIDATION_RETRIES) {
            retryCount++;
            messages.push({
              role: "user",
              content: `Decision Mismatch Error: Candidate final score is ${deterministicScoreResult.finalScore} (>= 0.75), which falls in the RECOMMENDED threshold. You must set 'recommended: true'.`,
            });
            continue;
          }
          break;
        }

        // All validations passed. Enforce exact deterministic score on output
        validatedFinalOutput = {
          ...validation.data!,
          score: deterministicScoreResult.finalScore, // Always exact deterministic scorer output
        };
        break;
      }
    }

    const completedAt = new Date();
    const totalLatencyMs = Date.now() - startTimeMs;

    if (validatedFinalOutput && deterministicScoreResult && !signal?.aborted) {
      return {
        success: true,
        provider: this.llmClient?.providerName || "groq",
        model: "llama-3.3-70b-versatile",
        startedAt,
        completedAt,
        latencyMs: totalLatencyMs,
        status: "COMPLETED",
        retryCount,
        tokenUsage: aggregatedTokens,
        toolInvocations,
        structuredOutput: validatedFinalOutput,
        deterministicBreakdown: deterministicScoreResult,
      };
    }

    const isTimeout = signal?.aborted || lastValidationErrorCode === "RECOMMENDATION_SLA_EXCEEDED";

    return {
      success: false,
      provider: this.llmClient?.providerName || "groq",
      model: "llama-3.3-70b-versatile",
      startedAt,
      completedAt,
      latencyMs: totalLatencyMs,
      status: isTimeout ? "TIMEOUT" : "FAILED",
      retryCount,
      tokenUsage: aggregatedTokens,
      toolInvocations,
      errorCode: isTimeout ? "RECOMMENDATION_SLA_EXCEEDED" : lastValidationErrorCode || "MAX_TURNS_EXCEEDED",
      errorMessage: isTimeout
        ? "Recommendation exceeded SLA timeout deadline"
        : lastValidationErrorMessage || "Agent exceeded maximum turn limit without producing valid recommendation",
    };
  }
}
