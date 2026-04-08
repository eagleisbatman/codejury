import Anthropic from '@anthropic-ai/sdk';
import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertRunMeta, CostEstimate } from '../types/provider.js';
import { ProviderError } from '../types/provider.js';
import type { Finding } from '../types/finding.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { buildSystemPrompt, buildUserPrompt, estimateTokenCount } from './prompt.js';
import { extractFindings } from './parser.js';
import { calculateCost } from '../cost/pricing.js';

export class AnthropicProvider implements ExpertProvider {
  readonly id = 'claude';
  readonly name: string;
  readonly model: string;
  private client: Anthropic;
  private maxTokens: number;

  constructor(config: { model: string; max_tokens?: number }) {
    this.model = config.model;
    this.name = `Claude (${config.model})`;
    this.maxTokens = config.max_tokens ?? 8192;
    this.client = new Anthropic();
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
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          fullText += event.delta.text;
        }
      }

      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes('401') || msg.includes('auth')
        ? 'auth_failed' as const
        : msg.includes('429') || msg.includes('rate')
          ? 'rate_limited' as const
          : msg.includes('timeout') || msg.includes('abort')
            ? 'timeout' as const
            : 'unknown' as const;
      throw new ProviderError(code, msg, this.id, e instanceof Error ? e : undefined);
    }

    const { findings, warnings } = extractFindings(fullText, this.id);
    rawFindings = findings.length + warnings.length;

    for (const finding of findings) {
      yield finding;
    }

    const costUsd = calculateCost(this.model, inputTokens, outputTokens);

    return {
      expertId: this.id,
      model: this.model,
      tokenUsage: { inputTokens, outputTokens },
      costUsd,
      durationMs: Date.now() - startTime,
      rawFindings,
      validFindings: findings.length,
    };
  }

  async isAvailable(): Promise<Result<true, ProviderError>> {
    try {
      // Quick check: can we create a client? API key is read from env by the SDK.
      if (!process.env['ANTHROPIC_API_KEY']) {
        return err(new ProviderError('auth_failed', 'ANTHROPIC_API_KEY not set', this.id));
      }
      return ok(true as const);
    } catch (e) {
      return err(new ProviderError('unknown', String(e), this.id));
    }
  }

  estimateCost(payload: ReviewPayload): CostEstimate {
    const systemPrompt = buildSystemPrompt(this.id);
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
