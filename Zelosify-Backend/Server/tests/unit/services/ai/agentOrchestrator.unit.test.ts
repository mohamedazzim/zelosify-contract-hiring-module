import { describe, it, expect, vi } from "vitest";
import { AgentOrchestrator } from "@/services/ai/agent/agentOrchestrator.js";
import { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "@/services/ai/types/llmTypes.js";
import { ToolRegistry } from "@/services/ai/tools/toolRegistry.js";
import { buildInitialUserMessage, buildSystemPrompt } from "@/services/ai/agent/agentPrompts.js";

/**
 * Creates a mock LlmClient that returns a scripted sequence of responses.
 */
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

describe("Agent Orchestrator (Dynamic Tool-Calling Loop)", () => {
  const defaultCriteria = {
    title: "Senior Frontend Engineer",
    requiredSkills: ["React", "TypeScript", "Tailwind CSS"],
    location: "Remote",
    experienceMin: 4,
    experienceMax: 8,
    s3Key: "tenant1/opening1/resume.pdf",
  };

  it("executes dynamic multi-turn tool calling and produces valid final recommendation", async () => {
    const mockResponses: LlmCompletionResponse[] = [
      // Turn 1: LLM decides to parse resume
      {
        provider: "mock-groq",
        model: "llama-3.3-70b-versatile",
        content: null,
        toolCalls: [
          {
            id: "call_1",
            name: "parse_resume_document",
            arguments: { s3Key: "tenant1/opening1/resume.pdf" },
          },
        ],
        tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        finishReason: "tool_calls",
      },
      // Turn 2: LLM calls scoring engine directly with candidate details
      {
        provider: "mock-groq",
        model: "llama-3.3-70b-versatile",
        content: null,
        toolCalls: [
          {
            id: "call_2",
            name: "calculate_deterministic_score",
            arguments: {
              candidateExp: 6,
              minExp: 4,
              maxExp: 8,
              candidateSkills: ["React", "TypeScript", "Tailwind CSS"],
              requiredSkills: ["React", "TypeScript", "Tailwind CSS"],
              candidateLocation: "Remote",
              openingLocation: "Remote",
            },
          },
        ],
        tokenUsage: { promptTokens: 150, completionTokens: 30, totalTokens: 180 },
        finishReason: "tool_calls",
      },
      // Turn 3: LLM provides final recommendation matching deterministic score (1.0)
      {
        provider: "mock-groq",
        model: "llama-3.3-70b-versatile",
        content: JSON.stringify({
          recommended: true,
          score: 1.0,
          confidence: 0.95,
          reason: "Candidate has 6 years experience within 4-8 range and 100% skill match on React, TypeScript, Tailwind CSS.",
        }),
        tokenUsage: { promptTokens: 120, completionTokens: 50, totalTokens: 170 },
        finishReason: "stop",
      },
    ];

    const mockClient = createMockLlmClient(mockResponses);
    const orchestrator = new AgentOrchestrator({ llmClient: mockClient });

    // Mock document parser tool inside registry
    const registry = (orchestrator as any).toolRegistry as ToolRegistry;
    vi.spyOn(registry, "execute").mockImplementation(async (name: string, args: any) => {
      if (name === "parse_resume_document") {
        return {
          success: true,
          data: {
            rawTextSanitized: "Candidate resume with 6 years experience in React, TypeScript, Tailwind CSS.",
            pageCount: 1,
            format: "PDF",
            characterCount: 75,
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
            finalScore: 1.0,
            thresholdCategory: "RECOMMENDED",
          },
        };
      }
      return { success: false, error: "Not mocked" };
    });

    const result = await orchestrator.evaluateProfile(defaultCriteria);

    expect(result.success).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(result.structuredOutput?.recommended).toBe(true);
    expect(result.structuredOutput?.score).toBe(1.0);
    expect(result.toolInvocations.length).toBe(2);
    expect(result.toolInvocations[0].tool).toBe("parse_resume_document");
    expect(result.toolInvocations[1].tool).toBe("calculate_deterministic_score");
    // Token usage aggregated across all 3 turns: 120 + 180 + 170 = 470
    expect(result.tokenUsage.totalTokens).toBe(470);
  });

  it("rejects final recommendation if calculate_deterministic_score was never invoked", async () => {
    const mockResponses: LlmCompletionResponse[] = [
      // LLM tries to immediately return final score without calling scoring tool
      {
        provider: "mock-groq",
        model: "llama-3.3-70b-versatile",
        content: JSON.stringify({
          recommended: true,
          score: 0.9,
          confidence: 0.8,
          reason: "I guessed the candidate is good.",
        }),
        tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        finishReason: "stop",
      },
    ];

    const mockClient = createMockLlmClient(mockResponses);
    const orchestrator = new AgentOrchestrator({ llmClient: mockClient, maxTurns: 2 });

    const result = await orchestrator.evaluateProfile(defaultCriteria);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("MISSING_DETERMINISTIC_SCORER");
    expect(result.errorMessage).toContain("calculate_deterministic_score");
  });

  it("rejects final recommendation if reported score mismatches the deterministic tool output", async () => {
    const mockResponses: LlmCompletionResponse[] = [
      // Turn 1: Call scoring tool
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
              minExp: 3,
              candidateSkills: ["React"],
              requiredSkills: ["React"],
              candidateLocation: "Remote",
            },
          },
        ],
        tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        finishReason: "tool_calls",
      },
      // Turn 2: LLM claims score is 0.40 while tool computed 1.0
      {
        provider: "mock-groq",
        model: "llama-3.3-70b-versatile",
        content: JSON.stringify({
          recommended: false,
          score: 0.40, // Mismatch!
          confidence: 0.8,
          reason: "Candidate has 5 years experience.",
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
        finalScore: 1.0,
        thresholdCategory: "RECOMMENDED",
      },
    });

    const result = await orchestrator.evaluateProfile(defaultCriteria);

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
  });

  it("handles malformed JSON on turn 1 and recovers on retry", async () => {
    const mockResponses: LlmCompletionResponse[] = [
      // Turn 1: Call scoring tool
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
              minExp: 3,
              candidateSkills: ["React"],
              requiredSkills: ["React"],
              candidateLocation: "Remote",
            },
          },
        ],
        tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        finishReason: "tool_calls",
      },
      // Turn 2: Malformed JSON output
      {
        provider: "mock-groq",
        model: "llama-3.3-70b-versatile",
        content: "Here is your result: { recommended: true, score: 1.0 (malformed json...",
        tokenUsage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        finishReason: "stop",
      },
      // Turn 3: Clean valid JSON on retry
      {
        provider: "mock-groq",
        model: "llama-3.3-70b-versatile",
        content: JSON.stringify({
          recommended: true,
          score: 1.0,
          confidence: 0.9,
          reason: "Cleaned up valid response with strong skill match.",
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
        experienceMatchScore: 1.0,
        locationMatchScore: 1.0,
        finalScore: 1.0,
        thresholdCategory: "RECOMMENDED",
      },
    });

    const result = await orchestrator.evaluateProfile(defaultCriteria);

    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(1);
    expect(result.structuredOutput?.recommended).toBe(true);
  });

  it("fails with MAX_TURNS_EXCEEDED when agent loops indefinitely", async () => {
    // LLM keeps calling tools without ever returning final recommendation
    const loopingResponses: LlmCompletionResponse[] = Array(8).fill({
      provider: "mock-groq",
      model: "llama-3.3-70b-versatile",
      content: null,
      toolCalls: [
        {
          id: "call_norm",
          name: "normalize_skills",
          arguments: { rawSkills: ["React"] },
        },
      ],
      tokenUsage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      finishReason: "tool_calls",
    });

    const mockClient = createMockLlmClient(loopingResponses);
    const orchestrator = new AgentOrchestrator({ llmClient: mockClient, maxTurns: 4 });

    const result = await orchestrator.evaluateProfile(defaultCriteria);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("MAX_TURNS_EXCEEDED");
  });

  it("verifies security: prompt-injection is never placed in system prompt and minimal criteria passed", () => {
    const sysPrompt = buildSystemPrompt();
    expect(sysPrompt).toContain("UNTRUSTED DATA BOUNDARY");
    expect(sysPrompt).toContain("calculate_deterministic_score");
    expect(sysPrompt).not.toContain("tenantId");
    expect(sysPrompt).not.toContain("userId");

    const userMsg = buildInitialUserMessage(defaultCriteria);
    expect(userMsg.content).toContain(defaultCriteria.title);
    expect(userMsg.content).toContain("React");
    expect(userMsg.content).not.toContain("password");
    expect(userMsg.content).not.toContain("accessToken");
  });
});
