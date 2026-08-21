// src/services/ai/client/nvidiaClient.ts

import {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmToolCall,
} from "../types/llmTypes.js";

export class NvidiaClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = "NvidiaClientError";
  }
}

export class NvidiaAuthenticationError extends NvidiaClientError {
  constructor(message = "NVIDIA authentication failed: invalid or missing NVIDIA_KEY") {
    super(message, "LLM_AUTHENTICATION_ERROR", 401);
    this.name = "NvidiaAuthenticationError";
  }
}

export class NvidiaRateLimitError extends NvidiaClientError {
  constructor(message = "NVIDIA rate limit exceeded") {
    super(message, "LLM_RATE_LIMIT_ERROR", 429);
    this.name = "NvidiaRateLimitError";
  }
}

export class NvidiaTimeoutError extends NvidiaClientError {
  constructor(message = "NVIDIA API request timed out") {
    super(message, "LLM_TIMEOUT_ERROR", 408);
    this.name = "NvidiaTimeoutError";
  }
}

export class NvidiaMalformedResponseError extends NvidiaClientError {
  constructor(message = "Malformed or unparseable response from NVIDIA API") {
    super(message, "LLM_MALFORMED_RESPONSE_ERROR", 502);
    this.name = "NvidiaMalformedResponseError";
  }
}

export interface NvidiaClientOptions {
  apiKey?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
}

const DEFAULT_NVIDIA_MODEL = "meta/llama-3.1-8b-instruct";
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;
const NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1";

export class NvidiaLlmClient implements LlmClient {
  public readonly providerName = "nvidia";
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;

  constructor(options: NvidiaClientOptions = {}) {
    const apiKey = options.apiKey || process.env.NVIDIA_KEY;

    if (!apiKey) {
      throw new NvidiaAuthenticationError(
        "NVIDIA_KEY is not configured in environment variables."
      );
    }

    this.apiKey = apiKey;
    this.defaultModel = options.defaultModel || process.env.NVIDIA_MODEL || DEFAULT_NVIDIA_MODEL;
    this.defaultTimeoutMs = options.defaultTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Translates provider-neutral LlmMessage to OpenAI-compatible format.
   */
  private mapMessages(messages: LlmMessage[]): any[] {
    return messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          tool_call_id: m.toolCallId || "call_unknown",
          content: m.content || "",
        };
      }

      if (m.role === "assistant") {
        const msg: any = {
          role: "assistant",
          content: m.content || "",
        };

        if (m.toolCalls && m.toolCalls.length > 0) {
          msg.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
            },
          }));
        }

        return msg;
      }

      if (m.role === "system") {
        return { role: "system", content: m.content || "" };
      }

      return { role: "user", content: m.content || "" };
    });
  }

  /**
   * Translates provider-neutral tool definitions to OpenAI-compatible format.
   */
  private mapTools(tools?: LlmCompletionRequest["tools"]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * Normalizes tool calls returned by the API.
   */
  private parseToolCalls(toolCalls?: any[]): LlmToolCall[] | undefined {
    if (!toolCalls || toolCalls.length === 0) return undefined;

    return toolCalls.map((tc) => {
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
   * Executes a chat completion via NVIDIA NIM API.
   */
  async complete(request: LlmCompletionRequest, signal?: AbortSignal): Promise<LlmCompletionResponse> {
    const model = request.model || this.defaultModel;
    const messages = this.mapMessages(request.messages);
    const tools = this.mapTools(request.tools);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

    // Merge external signal if supplied
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const body: any = {
        model,
        messages,
        temperature: request.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? 512,
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const response = await fetch(`${NVIDIA_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `NVIDIA API Error: HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          // Use raw error text
        }

        if (response.status === 401 || response.status === 403) {
          throw new NvidiaAuthenticationError(errorMessage);
        }
        if (response.status === 429) {
          throw new NvidiaRateLimitError(errorMessage);
        }
        throw new NvidiaClientError(errorMessage, "NVIDIA_API_ERROR", response.status);
      }

      const data = await response.json();

      const choice = data.choices?.[0];
      if (!choice) {
        throw new NvidiaMalformedResponseError("NVIDIA response contained no choices");
      }

      const toolCalls = this.parseToolCalls(choice.message?.tool_calls);

      return {
        provider: this.providerName,
        model: data.model || model,
        content: choice.message?.content || null,
        toolCalls,
        tokenUsage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        finishReason: choice.finish_reason || "stop",
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === "AbortError" || controller.signal.aborted) {
        throw new NvidiaTimeoutError(`NVIDIA request timed out after ${this.defaultTimeoutMs}ms`);
      }

      if (err instanceof NvidiaClientError) {
        throw err;
      }

      throw new NvidiaClientError(`NVIDIA API Error: ${err.message}`, "NVIDIA_API_ERROR");
    }
  }
}
