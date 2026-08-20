import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentOrchestrator } from "@/services/ai/agent/agentOrchestrator.js";
import { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "@/services/ai/types/llmTypes.js";
import { ToolRegistry } from "@/services/ai/tools/toolRegistry.js";
import * as docParser from "@/services/ai/tools/documentParser.js";

function createMockLlmClient(responses: LlmCompletionResponse[]): LlmClient {
  let callIndex = 0;
  return {
    providerName: "mock-groq",
    complete: vi.fn().mockImplementation(async (req: LlmCompletionRequest) => {
      const resp = responses[callIndex] || {
        provider: "mock-groq",
        model: "mock-model",
        content: JSON.stringify({
          recommended: false,
          score: 0.1,
          confidence: 0.5,
          reason: "Fallback mock response",
        }),
        tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        finishReason: "stop",
      };
      callIndex++;
      return resp;
    }),
  };
}

describe("Security, Score Integrity & Log Secrecy Review", () => {
  const defaultCriteria = {
    title: "Senior Backend Engineer",
    requiredSkills: ["Node.js", "TypeScript", "PostgreSQL"],
    location: "Remote",
    experienceMin: 4,
    experienceMax: 8,
    s3Key: "tenant1/opening1/resume.pdf",
  };

  describe("1. Score Integrity", () => {
    it("rejects final recommendation if reported score differs by 0.002 (strict tolerance)", async () => {
      const mockResponses: LlmCompletionResponse[] = [
        // Turn 1: Scoring tool runs, returning finalScore = 0.85
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_score",
              name: "calculate_deterministic_score",
              arguments: {
                candidateExp: 5,
                minExp: 4,
                maxExp: 8,
                candidateSkills: ["Node.js", "TypeScript", "PostgreSQL"],
                requiredSkills: ["Node.js", "TypeScript", "PostgreSQL"],
                candidateLocation: "Remote",
                openingLocation: "Remote",
              },
            },
          ],
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "tool_calls",
        },
        // Turn 2: LLM returns score = 0.852 (0.002 difference => exceeds 0.001 tolerance)
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: JSON.stringify({
            recommended: true,
            score: 0.852, // 0.002 higher than 0.850
            confidence: 0.9,
            reason: "Slightly altered score",
          }),
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "stop",
        },
      ];

      const mockClient = createMockLlmClient(mockResponses);
      const orchestrator = new AgentOrchestrator({ llmClient: mockClient, maxTurns: 2 });

      const registry = (orchestrator as any).toolRegistry as ToolRegistry;
      vi.spyOn(registry, "execute").mockResolvedValue({
        success: true,
        data: {
          skillMatchScore: 1.0,
          experienceMatchScore: 1.0,
          locationMatchScore: 1.0,
          finalScore: 0.85,
          thresholdCategory: "RECOMMENDED",
        },
      });

      const result = await orchestrator.evaluateProfile(defaultCriteria);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("SCORE_MISMATCH");
    });

    it("rejects final recommendation if reported score differs by 0.02", async () => {
      const mockResponses: LlmCompletionResponse[] = [
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_score",
              name: "calculate_deterministic_score",
              arguments: {
                candidateExp: 5,
                minExp: 4,
                candidateSkills: ["Node.js"],
                requiredSkills: ["Node.js"],
                candidateLocation: "Remote",
              },
            },
          ],
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "tool_calls",
        },
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: JSON.stringify({
            recommended: true,
            score: 0.87, // 0.02 off from 0.85
            confidence: 0.9,
            reason: "Score differs significantly",
          }),
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "stop",
        },
      ];

      const mockClient = createMockLlmClient(mockResponses);
      const orchestrator = new AgentOrchestrator({ llmClient: mockClient, maxTurns: 2 });

      const registry = (orchestrator as any).toolRegistry as ToolRegistry;
      vi.spyOn(registry, "execute").mockResolvedValue({
        success: true,
        data: {
          skillMatchScore: 1.0,
          experienceMatchScore: 1.0,
          locationMatchScore: 1.0,
          finalScore: 0.85,
          thresholdCategory: "RECOMMENDED",
        },
      });

      const result = await orchestrator.evaluateProfile(defaultCriteria);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("SCORE_MISMATCH");
    });

    it("prevents recommended: false from overriding a RECOMMENDED score (>= 0.75)", async () => {
      const mockResponses: LlmCompletionResponse[] = [
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_score",
              name: "calculate_deterministic_score",
              arguments: {
                candidateExp: 5,
                minExp: 4,
                candidateSkills: ["Node.js"],
                requiredSkills: ["Node.js"],
                candidateLocation: "Remote",
              },
            },
          ],
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "tool_calls",
        },
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: JSON.stringify({
            recommended: false, // Disagrees with score 0.95 (RECOMMENDED)
            score: 0.95,
            confidence: 0.9,
            reason: "Arbitrary rejection despite high score",
          }),
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "stop",
        },
      ];

      const mockClient = createMockLlmClient(mockResponses);
      const orchestrator = new AgentOrchestrator({ llmClient: mockClient, maxTurns: 2 });

      const registry = (orchestrator as any).toolRegistry as ToolRegistry;
      vi.spyOn(registry, "execute").mockResolvedValue({
        success: true,
        data: {
          skillMatchScore: 1.0,
          experienceMatchScore: 1.0,
          locationMatchScore: 1.0,
          finalScore: 0.95,
          thresholdCategory: "RECOMMENDED",
        },
      });

      const result = await orchestrator.evaluateProfile(defaultCriteria);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("DECISION_THRESHOLD_MISMATCH");
    });

    it("prevents recommended: true from overriding a NOT_RECOMMENDED score (< 0.50)", async () => {
      const mockResponses: LlmCompletionResponse[] = [
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_score",
              name: "calculate_deterministic_score",
              arguments: {
                candidateExp: 1,
                minExp: 5,
                candidateSkills: ["Ruby"],
                requiredSkills: ["Node.js"],
                candidateLocation: "London",
              },
            },
          ],
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "tool_calls",
        },
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: JSON.stringify({
            recommended: true, // Disagrees with score 0.20 (NOT_RECOMMENDED)
            score: 0.20,
            confidence: 0.9,
            reason: "Arbitrary approval despite failing score",
          }),
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "stop",
        },
      ];

      const mockClient = createMockLlmClient(mockResponses);
      const orchestrator = new AgentOrchestrator({ llmClient: mockClient, maxTurns: 2 });

      const registry = (orchestrator as any).toolRegistry as ToolRegistry;
      vi.spyOn(registry, "execute").mockResolvedValue({
        success: true,
        data: {
          skillMatchScore: 0.0,
          experienceMatchScore: 0.0,
          locationMatchScore: 0.5,
          finalScore: 0.20,
          thresholdCategory: "NOT_RECOMMENDED",
        },
      });

      const result = await orchestrator.evaluateProfile(defaultCriteria);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("DECISION_THRESHOLD_MISMATCH");
    });

    it("guarantees returned structuredOutput.score is exactly deterministicScoreResult.finalScore", async () => {
      const mockResponses: LlmCompletionResponse[] = [
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_score",
              name: "calculate_deterministic_score",
              arguments: {
                candidateExp: 5,
                minExp: 4,
                candidateSkills: ["Node.js"],
                requiredSkills: ["Node.js"],
                candidateLocation: "Remote",
              },
            },
          ],
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "tool_calls",
        },
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: JSON.stringify({
            recommended: true,
            score: 0.88,
            confidence: 0.91,
            reason: "Valid evaluation with matching score",
          }),
          tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
          finishReason: "stop",
        },
      ];

      const mockClient = createMockLlmClient(mockResponses);
      const orchestrator = new AgentOrchestrator({ llmClient: mockClient });

      const registry = (orchestrator as any).toolRegistry as ToolRegistry;
      vi.spyOn(registry, "execute").mockResolvedValue({
        success: true,
        data: {
          skillMatchScore: 1.0,
          experienceMatchScore: 0.8,
          locationMatchScore: 1.0,
          finalScore: 0.88,
          thresholdCategory: "RECOMMENDED",
        },
      });

      const result = await orchestrator.evaluateProfile(defaultCriteria);

      expect(result.success).toBe(true);
      expect(result.structuredOutput?.score).toBe(0.88);
      expect(result.deterministicBreakdown).toEqual({
        skillMatchScore: 1.0,
        experienceMatchScore: 0.8,
        locationMatchScore: 1.0,
        finalScore: 0.88,
        thresholdCategory: "RECOMMENDED",
      });
    });
  });

  describe("2. Log and Trace Secrecy", () => {
    let logSpy: any;
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
      logSpy = vi.spyOn(console, "log");
      warnSpy = vi.spyOn(console, "warn");
      errorSpy = vi.spyOn(console, "error");
    });

    afterEach(() => {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("guarantees no raw resume text, API keys, auth headers, presigned URLs, or tenant IDs appear in logs or trace", async () => {
      const RAW_RESUME_SENTINEL = "raw_resume_sentinel_xyz123_sensitive_content_untrusted";
      const API_KEY_SENTINEL = "gsk_api_key_sentinel_secret_999999";
      const AUTH_HEADER_SENTINEL = "Bearer auth_header_sentinel_bearer_token_xyz";
      const PRESIGNED_URL_SENTINEL = "https://s3.amazonaws.com/test-bucket/presigned_url_sentinel_secret_key";
      const TENANT_ID_SENTINEL = "tenant_id_sentinel_uuid_32884f64";

      const mockResponses: LlmCompletionResponse[] = [
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_parse",
              name: "parse_resume_document",
              arguments: { s3Key: defaultCriteria.s3Key },
            },
          ],
          tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          finishReason: "tool_calls",
        },
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_score",
              name: "calculate_deterministic_score",
              arguments: {
                candidateExp: 5,
                minExp: 4,
                candidateSkills: ["Node.js"],
                requiredSkills: ["Node.js"],
                candidateLocation: "Remote",
              },
            },
          ],
          tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          finishReason: "tool_calls",
        },
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: JSON.stringify({
            recommended: true,
            score: 0.90,
            confidence: 0.95,
            reason: "Strong fit",
          }),
          tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
          finishReason: "stop",
        },
      ];

      const mockClient = createMockLlmClient(mockResponses);
      const orchestrator = new AgentOrchestrator({ llmClient: mockClient });

      const registry = (orchestrator as any).toolRegistry as ToolRegistry;
      vi.spyOn(registry, "execute").mockImplementation(async (name: string) => {
        if (name === "parse_resume_document") {
          return {
            success: true,
            data: {
              rawTextSanitized: RAW_RESUME_SENTINEL,
              pageCount: 1,
              format: "PDF",
              characterCount: RAW_RESUME_SENTINEL.length,
              truncated: false,
            },
          };
        }
        if (name === "calculate_deterministic_score") {
          return {
            success: true,
            data: {
              skillMatchScore: 1.0,
              experienceMatchScore: 1.0,
              locationMatchScore: 1.0,
              finalScore: 0.90,
              thresholdCategory: "RECOMMENDED",
            },
          };
        }
        return { success: false };
      });

      const result = await orchestrator.evaluateProfile(defaultCriteria);

      expect(result.success).toBe(true);

      // 1. Check Console Logs
      const allConsoleCalls = [
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
      ].flat().join(" ");

      expect(allConsoleCalls).not.toContain(RAW_RESUME_SENTINEL);
      expect(allConsoleCalls).not.toContain(API_KEY_SENTINEL);
      expect(allConsoleCalls).not.toContain(AUTH_HEADER_SENTINEL);
      expect(allConsoleCalls).not.toContain(PRESIGNED_URL_SENTINEL);
      expect(allConsoleCalls).not.toContain(TENANT_ID_SENTINEL);

      // 2. Check Bounded Tool Invocation Trace
      const serializedTrace = JSON.stringify(result.toolInvocations);
      expect(serializedTrace).not.toContain(RAW_RESUME_SENTINEL);
      expect(serializedTrace).not.toContain(API_KEY_SENTINEL);
      expect(serializedTrace).not.toContain(AUTH_HEADER_SENTINEL);
      expect(serializedTrace).not.toContain(PRESIGNED_URL_SENTINEL);

      // 3. Confirm metadata bounding: raw text replaced by bounded summary
      const parseTrace = result.toolInvocations.find((t) => t.tool === "parse_resume_document");
      expect(parseTrace).toBeDefined();
      expect(parseTrace?.outputBounded?.rawTextSanitized).toContain("[BOUNDED_TEXT: length=");

      // 4. Token counts and tool names remain intact
      expect(result.tokenUsage.totalTokens).toBe(360);
      expect(result.toolInvocations.map((t) => t.tool)).toEqual([
        "parse_resume_document",
        "calculate_deterministic_score",
      ]);
    });
  });

  describe("3. Dynamic Tool Calling in Arbitrary Order", () => {
    it("executes non-standard order: normalize -> parse -> extract -> score -> final recommendation", async () => {
      vi.spyOn(docParser, "parseResumeDocument").mockResolvedValue({
        rawTextSanitized: "5 years experience in React and Node.js in Remote",
        pageCount: 1,
        format: "PDF",
        characterCount: 49,
        truncated: false,
      });

      const mockResponses: LlmCompletionResponse[] = [
        // Turn 1: LLM decides to normalize skills first
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_norm",
              name: "normalize_skills",
              arguments: { rawSkills: ["ReactJS", "NodeJS"] },
            },
          ],
          tokenUsage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
          finishReason: "tool_calls",
        },
        // Turn 2: LLM then decides to parse the resume document
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_parse",
              name: "parse_resume_document",
              arguments: { s3Key: defaultCriteria.s3Key },
            },
          ],
          tokenUsage: { promptTokens: 60, completionTokens: 20, totalTokens: 80 },
          finishReason: "tool_calls",
        },
        // Turn 3: LLM calls feature extraction
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_extract",
              name: "extract_candidate_features",
              arguments: { sanitizedResumeText: "5 years experience in React and Node.js in Remote" },
            },
          ],
          tokenUsage: { promptTokens: 80, completionTokens: 20, totalTokens: 100 },
          finishReason: "tool_calls",
        },
        // Turn 4: LLM calls deterministic scoring
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: null,
          toolCalls: [
            {
              id: "call_score",
              name: "calculate_deterministic_score",
              arguments: {
                candidateExp: 5,
                minExp: 4,
                maxExp: 8,
                candidateSkills: ["Node.js", "TypeScript", "PostgreSQL"],
                requiredSkills: ["Node.js", "TypeScript", "PostgreSQL"],
                candidateLocation: "Remote",
                openingLocation: "Remote",
              },
            },
          ],
          tokenUsage: { promptTokens: 90, completionTokens: 30, totalTokens: 120 },
          finishReason: "tool_calls",
        },
        // Turn 5: Final recommendation
        {
          provider: "mock-groq",
          model: "llama-3.3-70b-versatile",
          content: JSON.stringify({
            recommended: true,
            score: 1.0,
            confidence: 0.96,
            reason: "Candidate meets all criteria in custom tool order evaluation.",
          }),
          tokenUsage: { promptTokens: 110, completionTokens: 40, totalTokens: 150 },
          finishReason: "stop",
        },
      ];

      const mockClient = createMockLlmClient(mockResponses);
      const orchestrator = new AgentOrchestrator({ llmClient: mockClient });

      const result = await orchestrator.evaluateProfile(defaultCriteria);

      expect(result.success).toBe(true);
      expect(result.status).toBe("COMPLETED");
      expect(result.toolInvocations.length).toBe(4);

      // Verify exact non-standard sequence executed dynamically
      expect(result.toolInvocations[0].tool).toBe("normalize_skills");
      expect(result.toolInvocations[1].tool).toBe("parse_resume_document");
      expect(result.toolInvocations[2].tool).toBe("extract_candidate_features");
      expect(result.toolInvocations[3].tool).toBe("calculate_deterministic_score");
      expect(result.structuredOutput?.score).toBe(1.0);
    });
  });
});
