import { Ollama } from 'ollama';
import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertRunMeta, CostEstimate } from '../types/provider.js';
import { ProviderError } from '../types/provider.js';
import type { Finding } from '../types/finding.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';
import { extractFindings } from './parser.js';

export class OllamaProvider implements ExpertProvider {
  readonly id = 'ollama';
  readonly name: string;
  readonly model: string;
  private client: Ollama;

  constructor(config: { model: string }) {
    this.model = config.model;
    this.name = `Ollama (${config.model})`;
    this.client = new Ollama();
  }

  async *review(
    payload: ReviewPayload,
    options?: ReviewOptions,
  ): AsyncGenerator<Finding, ExpertRunMeta, undefined> {
    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt(this.id, options);
    const userPrompt = buildUserPrompt(payload);

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let rawFindings = 0;

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: 'json',
        stream: false,
      });

      fullText = response.message.content;
      inputTokens = response.prompt_eval_count ?? 0;
      outputTokens = response.eval_count ?? 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes('not found') || msg.includes('pull')
        ? 'model_not_found' as const
        : msg.includes('connect') || msg.includes('ECONNREFUSED')
          ? 'network_error' as const
          : 'unknown' as const;
      throw new ProviderError(code, msg, this.id, e instanceof Error ? e : undefined);
    }

    const { findings, warnings } = extractFindings(fullText, this.id);
    rawFindings = findings.length + warnings.length;

    for (const finding of findings) {
      yield finding;
    }

    return {
      expertId: this.id,
      model: this.model,
      tokenUsage: { inputTokens, outputTokens },
      costUsd: 0,
      durationMs: Date.now() - startTime,
      rawFindings,
      validFindings: findings.length,
    };
  }

  async isAvailable(): Promise<Result<true, ProviderError>> {
    try {
      const list = await this.client.list();
      const hasModel = list.models.some(
        (m) => m.name === this.model || m.name === `${this.model}:latest`,
      );
      if (!hasModel) {
        return err(
          new ProviderError(
            'model_not_found',
            `Model "${this.model}" not found in Ollama. Run: ollama pull ${this.model}`,
            this.id,
          ),
        );
      }
      return ok(true as const);
    } catch (e) {
      return err(
        new ProviderError(
          'network_error',
          `Ollama not reachable: ${e instanceof Error ? e.message : String(e)}`,
          this.id,
          e instanceof Error ? e : undefined,
        ),
      );
    }
  }

  estimateCost(): CostEstimate {
    return { estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0 };
  }
}
