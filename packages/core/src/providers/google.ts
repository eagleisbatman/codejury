import { GoogleGenAI } from '@google/genai';
import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertRunMeta, CostEstimate } from '../types/provider.js';
import { ProviderError } from '../types/provider.js';
import type { Finding } from '../types/finding.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { buildSystemPrompt, buildUserPrompt, estimateTokenCount } from './prompt.js';
import { extractFindings } from './parser.js';
import { calculateCost } from '../cost/pricing.js';

export class GoogleProvider implements ExpertProvider {
  readonly id = 'gemini';
  readonly name: string;
  readonly model: string;
  private client: GoogleGenAI;
  private maxTokens: number;

  constructor(config: { model: string; max_tokens?: number }) {
    this.model = config.model;
    this.name = `Gemini (${config.model})`;
    this.maxTokens = config.max_tokens ?? 8192;
    const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'] ?? '';
    this.client = new GoogleGenAI({ apiKey });
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
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
        ],
        config: {
          maxOutputTokens: this.maxTokens,
          responseMimeType: 'application/json',
        },
      });

      fullText = response.text ?? '';

      if (response.usageMetadata) {
        inputTokens = response.usageMetadata.promptTokenCount ?? 0;
        outputTokens = response.usageMetadata.candidatesTokenCount ?? 0;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes('401') || msg.includes('API key')
        ? 'auth_failed' as const
        : msg.includes('429') || msg.includes('quota')
          ? 'rate_limited' as const
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
    if (!process.env['GEMINI_API_KEY'] && !process.env['GOOGLE_API_KEY']) {
      return err(
        new ProviderError('auth_failed', 'GEMINI_API_KEY or GOOGLE_API_KEY not set', this.id),
      );
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
