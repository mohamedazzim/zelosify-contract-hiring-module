import { describe, it, expect, vi } from "vitest";
import {
  GroqLlmClient,
  LlmAuthenticationError,
  LlmRateLimitError,
  LlmTimeoutError,
} from "@/services/ai/client/groqClient.js";

describe("Groq LLM Client Adapter", () => {
  it("throws LlmAuthenticationError when GROQ_API_KEY is missing", () => {
    const originalKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    expect(() => new GroqLlmClient({ apiKey: "" })).toThrow(LlmAuthenticationError);

    process.env.GROQ_API_KEY = originalKey;
  });

  it("instantiates successfully when API key is provided", () => {
    const client = new GroqLlmClient({ apiKey: "gsk_test_mock_key_12345" });
    expect(client.providerName).toBe("groq");
  });

  it("classifies rate limit errors (HTTP 429) correctly", async () => {
    const client = new GroqLlmClient({ apiKey: "gsk_test_mock_key_12345" });

    // Mock client internal chat completions
    (client as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            status: 429,
            message: "Rate limit reached for requests per minute",
          }),
        },
      },
    };

    await expect(
      client.complete({
        messages: [{ role: "user", content: "Test" }],
      })
    ).rejects.toThrow(LlmRateLimitError);
  });

  it("classifies timeouts correctly", async () => {
    const client = new GroqLlmClient({ apiKey: "gsk_test_mock_key_12345" });

    (client as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue({
            name: "AbortError",
            message: "The operation was aborted",
          }),
        },
      },
    };

    await expect(
      client.complete({
        messages: [{ role: "user", content: "Test" }],
      })
    ).rejects.toThrow(LlmTimeoutError);
  });

  it("normalizes standard completions, tool calls, and token usage", async () => {
    const client = new GroqLlmClient({ apiKey: "gsk_test_mock_key_12345" });

    (client as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: "chatcmpl-123",
            model: "llama-3.3-70b-versatile",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_abc123",
                      type: "function",
                      function: {
                        name: "parse_resume_document",
                        arguments: JSON.stringify({ s3Key: "test/resume.pdf" }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: {
              prompt_tokens: 150,
              completion_tokens: 45,
              total_tokens: 195,
            },
          }),
        },
      },
    };

    const response = await client.complete({
      messages: [{ role: "user", content: "Parse resume" }],
      tools: [
        {
          name: "parse_resume_document",
          description: "Parses a resume",
          parameters: {
            type: "object",
            properties: { s3Key: { type: "string" } },
            required: ["s3Key"],
          },
        },
      ],
    });

    expect(response.provider).toBe("groq");
    expect(response.model).toBe("llama-3.3-70b-versatile");
    expect(response.content).toBeNull();
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.length).toBe(1);
    expect(response.toolCalls?.[0].name).toBe("parse_resume_document");
    expect(response.toolCalls?.[0].arguments).toEqual({ s3Key: "test/resume.pdf" });
    expect(response.tokenUsage).toEqual({
      promptTokens: 150,
      completionTokens: 45,
      totalTokens: 195,
    });
    expect(response.finishReason).toBe("tool_calls");
  });
});
