import type { Finding } from '../types/finding.js';

// --- Tool System ---

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  isError: boolean;
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

// --- Agent Events ---

export type AgentEvent =
  | { type: 'agent_tool_call'; expertId: string; toolName: string; params: Record<string, unknown>; iteration: number }
  | { type: 'agent_tool_result'; expertId: string; toolName: string; resultSummary: string; iteration: number }
  | { type: 'agent_thinking'; expertId: string; text: string; iteration: number }
  | { type: 'agent_iteration'; expertId: string; iteration: number; findingsSoFar: number }
  | { type: 'agent_finding'; expertId: string; finding: Finding; iteration: number }
  | { type: 'agent_context_reset'; expertId: string; reason: string; iteration: number };

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (value === null || typeof value !== 'object' || !('type' in value)) return false;
  const typeVal = (value as Record<string, unknown>)['type'];
  return typeof typeVal === 'string' && typeVal.startsWith('agent_');
}

// --- Agent Loop Config ---

export interface AgentLoopConfig {
  maxIterations: number;
  maxTokens: number;
  contextWindowSize: number;
  contextResetThreshold: number;
  expertId: string;
  model: string;
  repoPath: string;
  memoryDir: string;
}

export const DEFAULT_AGENT_CONFIG: Omit<AgentLoopConfig, 'expertId' | 'model' | 'repoPath' | 'memoryDir'> = {
  maxIterations: 10,
  maxTokens: 8192,
  contextWindowSize: 200_000,
  contextResetThreshold: 0.8,
};

// --- SDK Adapter Interface ---

export interface AdapterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: unknown;
}

export interface AdapterResponse {
  stopReason: 'tool_use' | 'end_turn' | 'max_tokens' | 'error';
  toolCalls: ToolCall[];
  textContent: string;
  inputTokens: number;
  outputTokens: number;
  rawAssistantMessage: unknown;
}

export interface SDKAdapter {
  formatTools(tools: ToolDefinition[]): unknown;
  sendRequest(messages: AdapterMessage[], tools: unknown, maxTokens: number, signal?: AbortSignal): Promise<AdapterResponse>;
  formatToolResults(rawAssistantMessage: unknown, results: ToolResult[]): AdapterMessage[];
  formatInitialMessages(systemPrompt: string, userPrompt: string, memoryContext: string): AdapterMessage[];
}

// --- Agent Loop Result ---

export interface AgentLoopResult {
  findings: Finding[];
  totalInputTokens: number;
  totalOutputTokens: number;
  iterations: number;
  toolCallCount: number;
}
