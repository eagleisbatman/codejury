import type { GitScope, ReviewEvent, SynthesizedReport } from './types/review.js';
import type { ProjectConfig } from './types/config.js';
import type { ExpertProvider, Finding } from './types/index.js';
import { resolveDiff } from './git/diff.js';
import { createProvider } from './providers/registry.js';
import { synthesize } from './synthesis/synthesizer.js';
import { ReviewRepository } from './db/repository.js';
import { join } from 'node:path';
import { PROJECT_DIR } from './config/loader.js';

export interface OrchestratorOptions {
  /** Override expert IDs to use */
  experts?: string[];
  /** Path to reviews.db (defaults to .codejury/reviews.db) */
  dbPath?: string;
  /** Skip saving to DB */
  skipDb?: boolean;
}

export async function* runReview(
  repoPath: string,
  scope: GitScope,
  config: ProjectConfig,
  options?: OrchestratorOptions,
): AsyncGenerator<ReviewEvent, SynthesizedReport, undefined> {
  // 1. Resolve diff
  const diffResult = await resolveDiff(repoPath, scope);
  if (!diffResult.ok) {
    throw diffResult.error;
  }
  const payload = diffResult.value;

  // 2. Create providers
  const expertIds = options?.experts ?? config.experts.enabled;
  const providers: ExpertProvider[] = [];

  for (const id of expertIds) {
    const expertConfig = (config.experts as Record<string, unknown>)[id];
    if (!expertConfig || typeof expertConfig !== 'object') continue;
    const result = createProvider(id, expertConfig as Parameters<typeof createProvider>[1]);
    if (result.ok) {
      providers.push(result.value);
    }
  }

  if (providers.length === 0) {
    throw new Error('No expert providers available. Run `cj doctor` to check provider status.');
  }

  yield { type: 'review_started', scope, experts: providers.map((p) => p.id) };

  // 3. Dispatch to all providers (full panel for now)
  const expertResults: Array<{
    expertId: string;
    findings: Finding[];
    meta: import('./types/provider.js').ExpertRunMeta;
  }> = [];

  const providerPromises = providers.map(async (provider) => {
    yield_: {
      // Can't yield from inside a nested async function,
      // so we collect events and return them
    }
    const findings: Finding[] = [];
    const startEvent: ReviewEvent = { type: 'expert_started', expertId: provider.id };

    try {
      const gen = provider.review(payload, {
        customRules: config.rules.custom_rules,
        focusAreas: (config.experts as Record<string, unknown>)[provider.id]
          ? ((config.experts as Record<string, unknown>)[provider.id] as { focus?: string[] }).focus as import('./types/finding.js').Category[] | undefined
          : undefined,
      });

      let result = await gen.next();
      while (!result.done) {
        findings.push(result.value);
        result = await gen.next();
      }

      return {
        startEvent,
        findings,
        findingEvents: findings.map((f): ReviewEvent => ({
          type: 'expert_finding' as const,
          expertId: provider.id,
          finding: f,
        })),
        completedEvent: {
          type: 'expert_completed' as const,
          expertId: provider.id,
          meta: result.value,
        } as ReviewEvent,
        result: { expertId: provider.id, findings, meta: result.value },
      };
    } catch (e) {
      return {
        startEvent,
        findings: [],
        findingEvents: [],
        completedEvent: {
          type: 'expert_failed' as const,
          expertId: provider.id,
          error: e instanceof Error ? e : new Error(String(e)),
        } as ReviewEvent,
        result: null,
      };
    }
  });

  // Run all providers in parallel, then yield events in order
  const results = await Promise.all(providerPromises);

  for (const r of results) {
    yield r.startEvent;
    for (const fe of r.findingEvents) {
      yield fe;
    }
    yield r.completedEvent;
    if (r.result) {
      expertResults.push(r.result);
    }
  }

  if (expertResults.length === 0) {
    throw new Error('All expert providers failed.');
  }

  // 4. Synthesize
  yield { type: 'synthesis_started' };

  const report = synthesize(
    expertResults,
    scope,
    payload.repoName,
    payload.branchName,
    'HEAD', // TODO: resolve actual commit hash
    {
      dedupThreshold: config.synthesis.dedup_threshold,
      failOnSeverity: config.ci.fail_on_severity,
    },
  );

  // 5. Save to DB
  if (!options?.skipDb) {
    const dbPath = options?.dbPath ?? join(repoPath, PROJECT_DIR, 'reviews.db');
    try {
      const db = new ReviewRepository(dbPath);
      db.saveReport(report);
      db.close();
    } catch {
      // DB save is best-effort — don't fail the review
    }
  }

  yield { type: 'synthesis_complete', report };

  return report;
}
