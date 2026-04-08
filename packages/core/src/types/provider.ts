import { z } from 'zod';
import type { Finding, Category } from './finding.js';
import type { Result } from './result.js';

// --- Review Payload (what gets sent to experts) ---

export interface FileHunk {
  startLine: number;
  endLine: number;
  content: string;
  context: {
    before: string;
    after: string;
    functionName?: string;
    className?: string;
  };
}

export interface FileChange {
  path: string;
  language: string;
  hunks: FileHunk[];
  additions: number;
  deletions: number;
}

export interface ReviewPayload {
  files: FileChange[];
  repoName: string;
  branchName: string;
  directoryStructure: string;
  totalAdditions: number;
  totalDeletions: number;
}

// --- Provider interface ---

export interface ReviewOptions {
  signal?: AbortSignal;
  maxRetries?: number;
  customRules?: string[];
  focusAreas?: Category[];
}

export interface ExpertRunMeta {
  expertId: string;
  model: string;
  tokenUsage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  durationMs: number;
  rawFindings: number;
  validFindings: number;
}

export interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
}

export const providerErrorCodeEnum = z.enum([
  'auth_failed',
  'rate_limited',
  'timeout',
  'model_not_found',
  'invalid_response',
  'network_error',
  'budget_exceeded',
  'unknown',
]);

export type ProviderErrorCode = z.infer<typeof providerErrorCodeEnum>;

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly providerId: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ExpertProvider {
  readonly id: string;
  readonly name: string;
  readonly model: string;

  review(
    payload: ReviewPayload,
    options?: ReviewOptions,
  ): AsyncGenerator<Finding, ExpertRunMeta, undefined>;

  isAvailable(): Promise<Result<true, ProviderError>>;

  estimateCost(payload: ReviewPayload): CostEstimate;
}

// --- Expert result (after a provider completes) ---

export interface ExpertResult {
  expertId: string;
  findings: Finding[];
  meta: ExpertRunMeta;
}
