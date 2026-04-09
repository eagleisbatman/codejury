import { Ollama } from 'ollama';
import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertRunMeta, CostEstimate } from '../types/provider.js';
import { ProviderError } from '../types/provider.js';
import type { Finding } from '../types/finding.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import type { AgentEvent } from '../agent/types.js';
import { runAgentLoop } from '../agent/agent-loop.js';
import { OllamaAdapter } from '../agent/adapters/ollama-adapter.js';
import { ToolExecutor } from '../agent/tools/tool-executor.js';
import { MemoryStore } from '../agent/memory/memory-store.js';
import { buildAgenticSystemPrompt, buildUserPrompt } from './prompt.js';
import { join } from 'node:path';
import { PROJECT_DIR } from '../config/loader.js';

export class OllamaProvider implements ExpertProvider {
  readonly id = 'ollama';
  readonly name: string;
  readonly model: string;
  private client: Ollama;
  private maxIterations: number;

  constructor(config: { model: string; max_iterations?: number }) {
    this.model = config.model;
    this.name = `Ollama (${config.model})`;
    this.client = new Ollama();
    this.maxIterations = config.max_iterations ?? 5; // Lower default for local models
  }

  async *review(
    payload: ReviewPayload,
    options?: ReviewOptions,
  ): AsyncGenerator<Finding | AgentEvent, ExpertRunMeta, undefined> {
    const startTime = Date.now();
    const repoPath = payload.repoPath ?? process.cwd();
    const memoryDir = join(repoPath, PROJECT_DIR, 'memory');

    const adapter = new OllamaAdapter(this.model);
    const memoryStore = new MemoryStore(memoryDir);
    const toolExecutor = new ToolExecutor(repoPath, memoryStore, this.id);

    const gen = runAgentLoop(adapter, toolExecutor, memoryStore, {
      maxIterations: this.maxIterations,
      maxTokens: 4096,
      contextWindowSize: 32_000, // Conservative for local models
      contextResetThreshold: 0.7,
      expertId: this.id,
      model: this.model,
      repoPath,
      memoryDir,
    }, buildAgenticSystemPrompt(this.id, options), buildUserPrompt(payload), options?.signal);

    let result = await gen.next();
    while (!result.done) {
      yield result.value;
      result = await gen.next();
    }

    const loopResult = result.value;
    return {
      expertId: this.id,
      model: this.model,
      tokenUsage: { inputTokens: loopResult.totalInputTokens, outputTokens: loopResult.totalOutputTokens },
      costUsd: 0,
      durationMs: Date.now() - startTime,
      rawFindings: loopResult.findings.length,
      validFindings: loopResult.findings.length,
      iterations: loopResult.iterations,
      toolCallCount: loopResult.toolCallCount,
    };
  }

  async isAvailable(): Promise<Result<true, ProviderError>> {
    try {
      const list = await this.client.list();
      const hasModel = list.models.some(
        (m) => m.name === this.model || m.name === `${this.model}:latest`,
      );
      if (!hasModel) {
        return err(new ProviderError('model_not_found', `Model "${this.model}" not found. Run: ollama pull ${this.model}`, this.id));
      }
      return ok(true as const);
    } catch (e) {
      return err(new ProviderError('network_error', `Ollama not reachable: ${e instanceof Error ? e.message : String(e)}`, this.id));
    }
  }

  estimateCost(): CostEstimate {
    return { estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0 };
  }
}
