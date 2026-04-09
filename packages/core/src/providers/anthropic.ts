import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertRunMeta, CostEstimate } from '../types/provider.js';
import { ProviderError } from '../types/provider.js';
import type { Finding } from '../types/finding.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import type { AgentEvent } from '../agent/types.js';
import { runAgentLoop } from '../agent/agent-loop.js';
import { AnthropicAdapter } from '../agent/adapters/anthropic-adapter.js';
import { ToolExecutor } from '../agent/tools/tool-executor.js';
import { MemoryStore } from '../agent/memory/memory-store.js';
import { buildAgenticSystemPrompt, buildUserPrompt, estimateTokenCount } from './prompt.js';
import { calculateCost } from '../cost/pricing.js';
import { join } from 'node:path';
import { PROJECT_DIR } from '../config/loader.js';

export class AnthropicProvider implements ExpertProvider {
  readonly id = 'claude';
  readonly name: string;
  readonly model: string;
  private maxTokens: number;
  private maxIterations: number;
  private contextWindow: number;

  constructor(config: { model: string; max_tokens?: number; max_iterations?: number; context_window?: number }) {
    this.model = config.model;
    this.name = `Claude (${config.model})`;
    this.maxTokens = config.max_tokens ?? 8192;
    this.maxIterations = config.max_iterations ?? 10;
    this.contextWindow = config.context_window ?? 200_000;
  }

  async *review(
    payload: ReviewPayload,
    options?: ReviewOptions,
  ): AsyncGenerator<Finding | AgentEvent, ExpertRunMeta, undefined> {
    const startTime = Date.now();
    const repoPath = payload.repoPath ?? process.cwd();
    const memoryDir = join(repoPath, PROJECT_DIR, 'memory');
    const systemPrompt = buildAgenticSystemPrompt(this.id, options);
    const userPrompt = buildUserPrompt(payload);

    const adapter = new AnthropicAdapter(this.model);
    const memoryStore = new MemoryStore(memoryDir);
    const toolExecutor = new ToolExecutor(repoPath, memoryStore, this.id);

    const gen = runAgentLoop(adapter, toolExecutor, memoryStore, {
      maxIterations: this.maxIterations,
      maxTokens: this.maxTokens,
      contextWindowSize: this.contextWindow,
      contextResetThreshold: 0.8,
      expertId: this.id,
      model: this.model,
      repoPath,
      memoryDir,
    }, systemPrompt, userPrompt, options?.signal);

    let result = await gen.next();
    while (!result.done) {
      yield result.value;
      result = await gen.next();
    }

    const loopResult = result.value;
    const costUsd = calculateCost(this.model, loopResult.totalInputTokens, loopResult.totalOutputTokens);

    return {
      expertId: this.id,
      model: this.model,
      tokenUsage: { inputTokens: loopResult.totalInputTokens, outputTokens: loopResult.totalOutputTokens },
      costUsd,
      durationMs: Date.now() - startTime,
      rawFindings: loopResult.findings.length,
      validFindings: loopResult.findings.length,
      iterations: loopResult.iterations,
      toolCallCount: loopResult.toolCallCount,
    };
  }

  async isAvailable(): Promise<Result<true, ProviderError>> {
    if (!process.env['ANTHROPIC_API_KEY']) {
      return err(new ProviderError('auth_failed', 'ANTHROPIC_API_KEY not set', this.id));
    }
    return ok(true as const);
  }

  estimateCost(payload: ReviewPayload): CostEstimate {
    const systemPrompt = buildAgenticSystemPrompt(this.id);
    const userPrompt = buildUserPrompt(payload);
    const inputTokens = estimateTokenCount(systemPrompt + userPrompt);
    const outputTokens = Math.min(inputTokens, this.maxTokens);
    return {
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: outputTokens,
      estimatedCostUsd: calculateCost(this.model, inputTokens, outputTokens),
    };
  }
}
