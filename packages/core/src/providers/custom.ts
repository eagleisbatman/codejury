import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertRunMeta, CostEstimate } from '../types/provider.js';
import { ProviderError } from '../types/provider.js';
import type { Finding } from '../types/finding.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { buildLegacySystemPrompt, buildUserPrompt, estimateTokenCount } from './prompt.js';
import { extractFindings } from './parser.js';

export interface CustomProviderConfig {
  model: string;
  endpoint: string;
  headers?: Record<string, string>;
  timeout?: number;
  max_tokens?: number;
}

/**
 * Generic provider that sends review payloads to any HTTP endpoint
 * that accepts JSON and returns a JSON array of findings.
 *
 * Request body: { system: string, user: string, model: string }
 * Expected response: { findings: Finding[], usage?: { input_tokens, output_tokens } }
 */
export class CustomProvider implements ExpertProvider {
  readonly id: string;
  readonly name: string;
  readonly model: string;
  private endpoint: string;
  private headers: Record<string, string>;
  private timeout: number;
  private maxTokens: number;

  constructor(id: string, config: CustomProviderConfig) {
    this.id = id;
    this.model = config.model;
    this.name = `Custom (${id}/${config.model})`;
    this.endpoint = config.endpoint;
    this.headers = config.headers ?? {};
    this.timeout = config.timeout ?? 120_000;
    this.maxTokens = config.max_tokens ?? 8192;
  }

  async *review(
    payload: ReviewPayload,
    options?: ReviewOptions,
  ): AsyncGenerator<Finding, ExpertRunMeta, undefined> {
    const startTime = Date.now();
    const systemPrompt = buildLegacySystemPrompt(this.id, options);
    const userPrompt = buildUserPrompt(payload);

    let responseBody: { findings?: unknown[]; usage?: { input_tokens?: number; output_tokens?: number } };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify({
          system: systemPrompt,
          user: userPrompt,
          model: this.model,
          max_tokens: this.maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        const code = response.status === 401 ? 'auth_failed' as const
          : response.status === 429 ? 'rate_limited' as const
          : 'unknown' as const;
        throw new ProviderError(code, `HTTP ${response.status}: ${text}`, this.id);
      }

      responseBody = await response.json() as typeof responseBody;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.includes('abort') ? 'timeout' as const : 'network_error' as const;
      throw new ProviderError(code, msg, this.id, e instanceof Error ? e : undefined);
    }

    const inputTokens = responseBody.usage?.input_tokens ?? 0;
    const outputTokens = responseBody.usage?.output_tokens ?? 0;

    const findingsText = JSON.stringify(responseBody.findings ?? responseBody);
    const { findings, warnings } = extractFindings(findingsText, this.id);

    for (const finding of findings) {
      yield finding;
    }

    return {
      expertId: this.id,
      model: this.model,
      tokenUsage: { inputTokens, outputTokens },
      costUsd: 0, // Custom providers don't have known pricing
      durationMs: Date.now() - startTime,
      rawFindings: findings.length + warnings.length,
      validFindings: findings.length,
    };
  }

  async isAvailable(): Promise<Result<true, ProviderError>> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(this.endpoint, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok || response.status === 405) {
        return ok(true as const);
      }
      return err(new ProviderError('network_error', `Endpoint returned ${response.status}`, this.id));
    } catch (e) {
      return err(new ProviderError('network_error', `Endpoint not reachable: ${e instanceof Error ? e.message : String(e)}`, this.id));
    }
  }

  estimateCost(payload: ReviewPayload): CostEstimate {
    const systemPrompt = buildLegacySystemPrompt(this.id);
    const userPrompt = buildUserPrompt(payload);
    const tokens = estimateTokenCount(systemPrompt + userPrompt);
    return { estimatedInputTokens: tokens, estimatedOutputTokens: 0, estimatedCostUsd: 0 };
  }
}
