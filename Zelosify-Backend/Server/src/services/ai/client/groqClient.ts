// src/services/ai/client/groqClient.ts

import Groq from "groq-sdk";
import {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmToolCall,
} from "../types/llmTypes.js";

export class LlmClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = "LlmClientError";
  }
}

export class LlmAuthenticationError extends LlmClientError {
  constructor(message = "Groq authentication failed: invalid or missing GROQ_API_KEY") {
    super(message, "LLM_AUTHENTICATION_ERROR", 401);
    this.name = "LlmAuthenticationError";
  }
}

export class LlmRateLimitError extends LlmClientError {
  constructor(message = "Groq rate limit exceeded (HTTP 429)") {
    super(message, "LLM_RATE_LIMIT_ERROR", 429);
    this.name = "LlmRateLimitError";
  }
}

export class LlmTimeoutError extends LlmClientError {
  constructor(message = "Groq API request timed out") {
    super(message, "LLM_TIMEOUT_ERROR", 408);
    this.name = "LlmTimeoutError";
  }
}

export class LlmMalformedResponseError extends LlmClientError {
  constructor(message = "Malformed or unparseable response from Groq API") {
    super(message, "LLM_MALFORMED_RESPONSE_ERROR", 502);
    this.name = "LlmMalformedResponseError";
  }
}

export interface GroqClientOptions {
  apiKey?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
}

const DEFAULT_GROQ_MODEL = "qwen/qwen3.6-27b"; // Qwen model with tool calling support
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

export class GroqLlmClient implements LlmClient {
  public readonly providerName = "groq";
  private client: Groq;
  private defaultModel: string;
  private defaultTimeoutMs: number;

  constructor(options: GroqClientOptions = {}) {
    const apiKey = options.apiKey || process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new LlmAuthenticationError(
        "GROQ_API_KEY is not configured in environment variables. Real AI tool-calling requires a valid Groq API key."
      );
    }

    this.defaultModel = options.defaultModel || process.env.GROQ_RECOMMENDATION_MODEL || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
    this.defaultTimeoutMs = options.defaultTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;

    this.client = new Groq({
      apiKey,
      timeout: this.defaultTimeoutMs,
    });
  }

  /**
   * Translates provider-neutral LlmMessage to Groq ChatCompletionMessageParam format.
   */
  private mapMessagesToGroq(messages: LlmMessage[]): Groq.Chat.ChatCompletionMessageParam[] {
    return messages.map((m): Groq.Chat.ChatCompletionMessageParam => {
      if (m.role === "tool") {
        return {
          role: "tool",
          tool_call_id: m.toolCallId || "call_unknown",
          content: m.content || "",
        };
      }

      if (m.role === "assistant") {
        const groqMsg: Groq.Chat.ChatCompletionAssistantMessageParam = {
          role: "assistant",
          content: m.content || "",
        };

        if (m.toolCalls && m.toolCalls.length > 0) {
          groqMsg.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
            },
          }));
        }

        return groqMsg;
      }

      if (m.role === "system") {
        return {
          role: "system",
          content: m.content || "",
        };
      }

      // Default to user role
      return {
        role: "user",
        content: m.content || "",
      };
    });
  }

  /**
   * Translates provider-neutral LlmToolDefinition to Groq ChatCompletionTool format.
   */
  private mapToolsToGroq(tools?: LlmCompletionRequest["tools"]): Groq.Chat.ChatCompletionTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Normalizes tool calls returned by Groq.
   */
  private parseGroqToolCalls(groqToolCalls?: Groq.Chat.ChatCompletionMessageToolCall[]): LlmToolCall[] | undefined {
    if (!groqToolCalls || groqToolCalls.length === 0) return undefined;

    return groqToolCalls.map((tc) => {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments || "{}");
      } catch {
        parsedArgs = { _raw: tc.function.arguments };
      }

      return {
        id: tc.id,
        name: tc.function.name,
        arguments: parsedArgs,
      };
    });
  }

  /**
   * Executes a chat completion via Groq with timeout and error classification.
   */
  async complete(request: LlmCompletionRequest, signal?: AbortSignal): Promise<LlmCompletionResponse> {
    const model = request.model || this.defaultModel;
    const groqMessages = this.mapMessagesToGroq(request.messages);
    const groqTools = this.mapToolsToGroq(request.tools);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

    // Merge external signal if supplied
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await this.client.chat.completions.create(
        {
          model,
          messages: groqMessages,
          tools: groqTools,
          tool_choice: groqTools && groqTools.length > 0 ? "auto" : undefined,
          temperature: request.temperature ?? 0.1,
          max_tokens: request.maxTokens ?? 512, // Reduced from1024 for faster response
        },
        {
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const choice = response.choices?.[0];
      if (!choice) {
        throw new LlmMalformedResponseError("Groq response contained no choices");
      }

      const toolCalls = this.parseGroqToolCalls(choice.message.tool_calls);

      return {
        provider: this.providerName,
        model: response.model || model,
        content: choice.message.content || null,
        toolCalls,
        tokenUsage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        finishReason: choice.finish_reason || "stop",
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      // Classify error type cleanly
      if (err.name === "AbortError" || controller.signal.aborted) {
        throw new LlmTimeoutError(`Groq request timed out after ${this.defaultTimeoutMs}ms`);
      }

      const status = err.status || err.statusCode;
      const message = err.message || "Unknown Groq error";

      if (status === 401 || status === 403 || message.includes("API key")) {
        throw new LlmAuthenticationError(`Groq Authentication Failed: ${message}`);
      }

      if (status === 429 || message.toLowerCase().includes("rate limit")) {
        throw new LlmRateLimitError(`Groq Rate Limit Exceeded: ${message}`);
      }

      if (err instanceof LlmClientError) {
        throw err;
      }

      throw new LlmClientError(`Groq API Error: ${message}`, "GROQ_API_ERROR", status);
    }
  }
}
