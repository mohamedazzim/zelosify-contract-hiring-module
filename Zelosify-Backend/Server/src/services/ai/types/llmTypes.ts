// src/services/ai/types/llmTypes.ts

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LlmMessage {
  role: LlmRole;
  content: string | null;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCompletionResponse {
  provider: string;
  model: string;
  content: string | null;
  toolCalls?: LlmToolCall[];
  tokenUsage: LlmTokenUsage;
  finishReason: string;
}

export interface LlmClient {
  readonly providerName: string;
  complete(request: LlmCompletionRequest, signal?: AbortSignal): Promise<LlmCompletionResponse>;
}

// Bounded trace metadata for observability and persistence in Phase 4E
export interface ToolInvocationTrace {
  tool: string;
  success: boolean;
  durationMs: number;
  inputBounded: Record<string, any>;
  outputBounded?: Record<string, any>;
  error?: string;
}

export interface AgentExecutionResult {
  success: boolean;
  provider: string;
  model: string;
  startedAt: Date;
  completedAt: Date;
  latencyMs: number;
  status: "COMPLETED" | "FAILED" | "TIMEOUT";
  retryCount: number;
  tokenUsage: LlmTokenUsage;
  toolInvocations: ToolInvocationTrace[];
  structuredOutput?: {
    recommended: boolean;
    score: number;
    confidence: number;
    reason: string;
  };
  deterministicBreakdown?: {
    skillMatchScore: number;
    experienceMatchScore: number;
    locationMatchScore: number;
    finalScore: number;
    thresholdCategory: "RECOMMENDED" | "BORDERLINE" | "NOT_RECOMMENDED";
  };
  errorCode?: string;
  errorMessage?: string;
}
