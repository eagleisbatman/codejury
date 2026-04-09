import type { GitScope, ReviewEvent, SynthesizedReport } from './types/review.js';
import type { ProjectConfig } from './types/config.js';
import type { ExpertProvider, Finding } from './types/index.js';
import { isAgentEvent } from './agent/types.js';
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
    const findings: Finding[] = [];
    const agentEvents: ReviewEvent[] = [];
    const startEvent: ReviewEvent = { type: 'expert_started', expertId: provider.id };
    // Track findings that came through agent_finding events (agentic providers)
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
          // Forward agent events (tool calls, thinking, etc.)
          agentEvents.push(value as ReviewEvent);
          // Collect findings from agent_finding events
          if (value.type === 'agent_finding') {
            findings.push(value.finding);
            agentFindingIds.add(value.finding.id);
          }
        } else {
          // Direct Finding object (from non-agentic providers like CustomProvider)
          const finding = value as Finding;
          findings.push(finding);
        }
        result = await gen.next();
      }

      // Build expert_finding events only for findings NOT already emitted
      // via agent_finding in the agentEvents stream
      const findingEvents: ReviewEvent[] = findings
        .filter((f) => !agentFindingIds.has(f.id))
        .map((f): ReviewEvent => ({
          type: 'expert_finding' as const,
          expertId: provider.id,
          finding: f,
        }));

      return {
        startEvent,
        findings,
        agentEvents,
        findingEvents,
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
        agentEvents: [],
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
    // Yield agent events (tool calls, thinking, iterations)
    for (const ae of r.agentEvents) {
      yield ae;
    }
    // Yield deduplicated finding events
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
    let db: ReviewRepository | undefined;
    try {
      db = new ReviewRepository(dbPath);
      db.saveReport(report);
    } catch {
      // DB save is best-effort — don't fail the review
    } finally {
      db?.close();
    }
  }

  yield { type: 'synthesis_complete', report };

  return report;
}
