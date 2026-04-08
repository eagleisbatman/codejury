import OpenAI from 'openai';
import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertRunMeta, CostEstimate } from '../types/provider.js';
import { ProviderError } from '../types/provider.js';
import type { Finding } from '../types/finding.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { buildSystemPrompt, buildUserPrompt, estimateTokenCount } from './prompt.js';
import { extractFindings } from './parser.js';
import { calculateCost } from '../cost/pricing.js';

export class OpenAIProvider implements ExpertProvider {
  readonly id = 'openai';
  readonly name: string;
  readonly model: string;
  private client: OpenAI;
  private maxTokens: number;

  constructor(config: { model: string; max_tokens?: number }) {
    this.model = config.model;
    this.name = `OpenAI (${config.model})`;
    this.maxTokens = config.max_tokens ?? 8192;
    this.client = new OpenAI();
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
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      });

      fullText = completion.choices[0]?.message?.content ?? '';

      if (completion.usage) {
        inputTokens = completion.usage.prompt_tokens;
        outputTokens = completion.usage.completion_tokens;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes('401') || msg.includes('Incorrect API key')
        ? 'auth_failed' as const
        : msg.includes('429') || msg.includes('Rate limit')
          ? 'rate_limited' as const
          : msg.includes('model')
            ? 'model_not_found' as const
            : 'unknown' as const;
      throw new ProviderError(code, msg, this.id, e instanceof Error ? e : undefined);
    }

    // OpenAI json_object mode may wrap in {"findings": [...]}
    let textToParse = fullText;
    try {
      const parsed = JSON.parse(fullText);
      if (parsed && typeof parsed === 'object' && 'findings' in parsed && Array.isArray(parsed.findings)) {
        textToParse = JSON.stringify(parsed.findings);
      }
    } catch {
      // Fall through to extractFindings
    }

    const { findings, warnings } = extractFindings(textToParse, this.id);
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
    if (!process.env['OPENAI_API_KEY']) {
      return err(new ProviderError('auth_failed', 'OPENAI_API_KEY not set', this.id));
    }
    return ok(true as const);
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
