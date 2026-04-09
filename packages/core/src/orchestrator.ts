import type { GitScope, ReviewEvent, SynthesizedReport } from './types/review.js';
import type { ProjectConfig } from './types/config.js';
import type { ExpertProvider, Finding } from './types/index.js';
import { isAgentEvent } from './agent/types.js';
import { resolveDiff } from './git/diff.js';
import { createProvider } from './providers/registry.js';
import { synthesize } from './synthesis/synthesizer.js';
import { routed, cascading } from './synthesis/strategies.js';
import { ReviewRepository } from './db/repository.js';
import { join } from 'node:path';
import { PROJECT_DIR } from './config/loader.js';

export interface OrchestratorOptions {
  experts?: string[];
  dbPath?: string;
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
  const allProviders: ExpertProvider[] = [];

  for (const id of expertIds) {
    const expertConfig = (config.experts as Record<string, unknown>)[id];
    if (!expertConfig || typeof expertConfig !== 'object') continue;
    const result = createProvider(id, expertConfig as Parameters<typeof createProvider>[1]);
    if (result.ok) {
      allProviders.push(result.value);
    }
  }

  if (allProviders.length === 0) {
    throw new Error('No expert providers configured. Run `cj init` to set up.');
  }

  // 3. Pre-flight availability check — skip unavailable providers gracefully
  const providers: ExpertProvider[] = [];
  const skippedProviders: Array<{ id: string; reason: string }> = [];

  for (const provider of allProviders) {
    const available = await provider.isAvailable();
    if (available.ok) {
      providers.push(provider);
    } else {
      skippedProviders.push({ id: provider.id, reason: available.error.message });
    }
  }

  // Yield skip events so the user sees why providers were excluded
  for (const skipped of skippedProviders) {
    yield {
      type: 'expert_failed',
      expertId: skipped.id,
      error: new Error(`Skipped: ${skipped.reason}`),
    };
  }

  if (providers.length === 0) {
    throw new Error(
      `All ${allProviders.length} expert(s) unavailable:\n` +
      skippedProviders.map((s) => `  ${s.id}: ${s.reason}`).join('\n') +
      '\n\nRun `cj keys list` to check API keys, or `cj doctor` for full diagnostics.',
    );
  }

  yield { type: 'review_started', scope, experts: providers.map((p) => p.id) };

  // 4. Dispatch using configured strategy
  const strategy = config.synthesis.strategy;
  const reviewOptions = {
    customRules: config.rules.custom_rules,
  };

  // For routed/cascading, use the strategies module
  if (strategy === 'routed' || strategy === 'cascading') {
    const strategyResults = strategy === 'routed'
      ? await routed(providers, payload, reviewOptions)
      : await cascading(providers, payload, providers[0]!, reviewOptions);

    for (const r of strategyResults) {
      yield { type: 'expert_started', expertId: r.expertId };
      for (const f of r.findings) {
        yield { type: 'expert_finding', expertId: r.expertId, finding: f };
      }
      yield { type: 'expert_completed', expertId: r.expertId, meta: r.meta };
    }

    yield { type: 'synthesis_started' };
    const report = synthesize(strategyResults, scope, payload.repoName, payload.branchName, 'HEAD', {
      dedupThreshold: config.synthesis.dedup_threshold,
      failOnSeverity: config.ci.fail_on_severity,
    });

    if (!options?.skipDb) {
      const dbPath = options?.dbPath ?? join(repoPath, PROJECT_DIR, 'reviews.db');
      let db: ReviewRepository | undefined;
      try { db = new ReviewRepository(dbPath); db.saveReport(report); } catch { /* best-effort */ } finally { db?.close(); }
    }

    yield { type: 'synthesis_complete', report };
    return report;
  }

  // Full panel strategy — inline dispatch with event streaming
  const expertResults: Array<{
    expertId: string;
    findings: Finding[];
    meta: import('./types/provider.js').ExpertRunMeta;
  }> = [];

  const providerPromises = providers.map(async (provider) => {
    const findings: Finding[] = [];
    const agentEvents: ReviewEvent[] = [];
    const startEvent: ReviewEvent = { type: 'expert_started', expertId: provider.id };
    const agentFindingIds = new Set<string>();

    try {
      const gen = provider.review(payload, {
        customRules: config.rules.custom_rules,
        focusAreas: (config.experts as Record<string, unknown>)[provider.id]
          ? ((config.experts as Record<string, unknown>)[provider.id] as { focus?: string[] }).focus as import('./types/finding.js').Category[] | undefined
          : undefined,
      });

      let result = await gen.next();
      while (!result.done) {
        const value = result.value;
        if (isAgentEvent(value)) {
          agentEvents.push(value as ReviewEvent);
          if (value.type === 'agent_finding') {
            findings.push(value.finding);
            agentFindingIds.add(value.finding.id);
          }
        } else {
          findings.push(value as Finding);
        }
        result = await gen.next();
      }

      const findingEvents: ReviewEvent[] = findings
        .filter((f) => !agentFindingIds.has(f.id))
        .map((f): ReviewEvent => ({ type: 'expert_finding' as const, expertId: provider.id, finding: f }));

      return {
        startEvent, findings, agentEvents, findingEvents,
        completedEvent: { type: 'expert_completed' as const, expertId: provider.id, meta: result.value } as ReviewEvent,
        result: { expertId: provider.id, findings, meta: result.value },
      };
    } catch (e) {
      return {
        startEvent, findings: [], agentEvents: [], findingEvents: [],
        completedEvent: { type: 'expert_failed' as const, expertId: provider.id, error: e instanceof Error ? e : new Error(String(e)) } as ReviewEvent,
        result: null,
      };
    }
  });

  const results = await Promise.all(providerPromises);

  for (const r of results) {
    yield r.startEvent;
    for (const ae of r.agentEvents) yield ae;
    for (const fe of r.findingEvents) yield fe;
    yield r.completedEvent;
    if (r.result) expertResults.push(r.result);
  }

  if (expertResults.length === 0) {
    throw new Error('All expert providers failed during review. Check `cj doctor` for diagnostics.');
  }

  // 5. Synthesize
  yield { type: 'synthesis_started' };

  const report = synthesize(
    expertResults, scope, payload.repoName, payload.branchName, 'HEAD',
    { dedupThreshold: config.synthesis.dedup_threshold, failOnSeverity: config.ci.fail_on_severity },
  );

  // 6. Save to DB
  if (!options?.skipDb) {
    const dbPath = options?.dbPath ?? join(repoPath, PROJECT_DIR, 'reviews.db');
    let db: ReviewRepository | undefined;
    try { db = new ReviewRepository(dbPath); db.saveReport(report); } catch { /* best-effort */ } finally { db?.close(); }
  }

  yield { type: 'synthesis_complete', report };
  return report;
}
