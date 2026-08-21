// src/services/ai/client/geminiClient.ts

import {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmToolCall,
} from "../types/llmTypes.js";

export class GeminiClientError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = "GeminiClientError";
  }
}

export class GeminiAuthenticationError extends GeminiClientError {
  constructor(message = "Gemini authentication failed: invalid or missing GEMINI_API_KEY") {
    super(message, "LLM_AUTHENTICATION_ERROR", 401);
    this.name = "GeminiAuthenticationError";
  }
}

export class GeminiRateLimitError extends GeminiClientError {
  constructor(message = "Gemini rate limit exceeded") {
    super(message, "LLM_RATE_LIMIT_ERROR", 429);
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiTimeoutError extends GeminiClientError {
  constructor(message = "Gemini API request timed out") {
    super(message, "LLM_TIMEOUT_ERROR", 408);
    this.name = "GeminiTimeoutError";
  }
}

export class GeminiMalformedResponseError extends GeminiClientError {
  constructor(message = "Malformed or unparseable response from Gemini API") {
    super(message, "LLM_MALFORMED_RESPONSE_ERROR", 502);
    this.name = "GeminiMalformedResponseError";
  }
}

export interface GeminiClientOptions {
  apiKey?: string;
  defaultModel?: string;
  defaultTimeoutMs?: number;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

export class GeminiLlmClient implements LlmClient {
  public readonly providerName = "gemini";
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;

  constructor(options: GeminiClientOptions = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new GeminiAuthenticationError(
        "GEMINI_API_KEY is not configured in environment variables."
      );
    }

    this.apiKey = apiKey;
    this.defaultModel = options.defaultModel || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    this.defaultTimeoutMs = options.defaultTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Translates provider-neutral LlmMessage to Gemini format.
   */
  private mapMessagesToGemini(messages: LlmMessage[]): any[] {
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // System messages go as user messages in Gemini
        contents.push({
          role: "user",
          parts: [{ text: `[System Instruction]: ${msg.content}` }],
        });
        contents.push({
          role: "model",
          parts: [{ text: "Understood. I will follow these instructions." }],
        });
      } else if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content || "" }],
        });
      } else if (msg.role === "assistant") {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Tool calls from assistant
          const functionCalls = msg.toolCalls.map((tc) => ({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          }));
          contents.push({
            role: "model",
            parts: functionCalls,
          });
        } else {
          contents.push({
            role: "model",
            parts: [{ text: msg.content || "" }],
          });
        }
      } else if (msg.role === "tool") {
        // Tool results
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.name || "unknown",
                response: {
                  content: msg.content || "",
                },
              },
            },
          ],
        });
      }
    }

    return contents;
  }

  /**
   * Translates provider-neutral LlmToolDefinition to Gemini format.
   */
  private mapToolsToGemini(tools?: LlmCompletionRequest["tools"]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    // Convert OpenAI-style schema to Gemini-style schema (uppercase types)
    const convertSchema = (schema: any): any => {
      if (!schema) return schema;

      const result: any = {};

      // Map lowercase types to uppercase Gemini types
      const typeMap: Record<string, string> = {
        "string": "STRING",
        "number": "NUMBER",
        "integer": "INTEGER",
        "boolean": "BOOLEAN",
        "array": "ARRAY",
        "object": "OBJECT",
      };

      if (schema.type) {
        // Handle JSON Schema nullable types like ["number", "null"]
        if (Array.isArray(schema.type)) {
          const primaryType = schema.type.find((t: string) => t !== "null");
          result.type = typeMap[primaryType] || primaryType;
        } else {
          result.type = typeMap[schema.type] || schema.type;
        }
      }

      if (schema.description) {
        result.description = schema.description;
      }

      if (schema.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          result.properties[key] = convertSchema(value);
        }
      }

      if (schema.items) {
        result.items = convertSchema(schema.items);
      }

      if (schema.required) {
        result.required = schema.required;
      }

      if (schema.enum) {
        result.enum = schema.enum;
      }

      return result;
    };

    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: convertSchema(t.parameters),
        })),
      },
    ];
  }

  /**
   * Normalizes tool calls returned by Gemini.
   */
  private parseGeminiToolCalls(functionCalls?: any[]): LlmToolCall[] | undefined {
    if (!functionCalls || functionCalls.length === 0) return undefined;

    return functionCalls.map((fc, idx) => ({
      id: `gemini_tool_call_${idx}`,
      name: fc.name,
      arguments: fc.args || {},
    }));
  }

  /**
   * Executes a chat completion via Gemini REST API with timeout and error classification.
   */
  async complete(request: LlmCompletionRequest, signal?: AbortSignal): Promise<LlmCompletionResponse> {
    const model = request.model || this.defaultModel;
    const contents = this.mapMessagesToGemini(request.messages);
    const geminiTools = this.mapToolsToGemini(request.tools);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeoutMs);

    // Merge external signal if supplied
    if (signal) {
      signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      const body: any = {
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.1,
          maxOutputTokens: request.maxTokens ?? 512,
        },
      };

      if (geminiTools) {
        body.tools = geminiTools;
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Gemini API Error: HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          // Use raw error text
        }

        if (response.status === 401 || response.status === 403) {
          throw new GeminiAuthenticationError(errorMessage);
        }
        if (response.status === 429) {
          throw new GeminiRateLimitError(errorMessage);
        }
        throw new GeminiClientError(errorMessage, "GEMINI_API_ERROR", response.status);
      }

      const data = await response.json();

      const candidates = data.candidates;
      if (!candidates || candidates.length === 0) {
        throw new GeminiMalformedResponseError("Gemini response contained no candidates");
      }

      const candidate = candidates[0];
      const parts = candidate.content?.parts || [];

      let content: string | null = null;
      const toolCalls: LlmToolCall[] = [];

      for (const part of parts) {
        if (part.text) {
          content = (content || "") + part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `gemini_tool_call_${toolCalls.length}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          });
        }
      }

      // Estimate token usage
      const tokenUsage = {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      };

      return {
        provider: this.providerName,
        model: model,
        content: content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        tokenUsage,
        finishReason: candidate.finishReason || "stop",
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      // Classify error type cleanly
      if (err.name === "AbortError" || controller.signal.aborted) {
        throw new GeminiTimeoutError(`Gemini request timed out after ${this.defaultTimeoutMs}ms`);
      }

      if (err instanceof GeminiClientError) {
        throw err;
      }

      throw new GeminiClientError(`Gemini API Error: ${err.message}`, "GEMINI_API_ERROR");
    }
  }
}
