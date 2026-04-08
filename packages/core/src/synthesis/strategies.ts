import type { ExpertProvider, ReviewPayload, ReviewOptions, ExpertResult } from '../types/provider.js';
import type { Finding } from '../types/finding.js';

async function runProvider(
  provider: ExpertProvider,
  payload: ReviewPayload,
  options?: ReviewOptions,
): Promise<ExpertResult> {
  const findings: Finding[] = [];
  const gen = provider.review(payload, options);

  let result = await gen.next();
  while (!result.done) {
    findings.push(result.value);
    result = await gen.next();
  }

  return {
    expertId: provider.id,
    findings,
    meta: result.value,
  };
}

export async function fullPanel(
  providers: ExpertProvider[],
  payload: ReviewPayload,
  options?: ReviewOptions,
): Promise<ExpertResult[]> {
  const results = await Promise.allSettled(
    providers.map((p) => runProvider(p, payload, options)),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ExpertResult> => r.status === 'fulfilled')
    .map((r) => r.value);
}

const SECURITY_PATHS = [/auth/, /login/, /session/, /token/, /crypt/, /secret/, /password/];
const PERF_PATHS = [/db/, /query/, /cache/, /api/, /route/, /handler/];

function classifyFile(path: string): 'security' | 'performance' | 'general' {
  const lower = path.toLowerCase();
  if (SECURITY_PATHS.some((p) => p.test(lower))) return 'security';
  if (PERF_PATHS.some((p) => p.test(lower))) return 'performance';
  return 'general';
}

export async function routed(
  providers: ExpertProvider[],
  payload: ReviewPayload,
  options?: ReviewOptions,
): Promise<ExpertResult[]> {
  // Simple file-path heuristic routing for v1
  // Route security files to providers with security focus, etc.
  // Falls back to full panel for general files
  const securityFiles = payload.files.filter((f) => classifyFile(f.path) === 'security');
  const perfFiles = payload.files.filter((f) => classifyFile(f.path) === 'performance');
  const generalFiles = payload.files.filter((f) => classifyFile(f.path) === 'general');

  const tasks: Promise<ExpertResult>[] = [];

  for (const provider of providers) {
    // Each provider gets all general files plus its specialty files
    const filesToReview = [...generalFiles];
    if (provider.id === 'claude') filesToReview.push(...securityFiles);
    if (provider.id === 'gemini') filesToReview.push(...perfFiles);
    if (provider.id !== 'claude' && provider.id !== 'gemini') {
      filesToReview.push(...securityFiles, ...perfFiles);
    }

    if (filesToReview.length === 0) continue;

    const subPayload: ReviewPayload = {
      ...payload,
      files: filesToReview,
      totalAdditions: filesToReview.reduce((s, f) => s + f.additions, 0),
      totalDeletions: filesToReview.reduce((s, f) => s + f.deletions, 0),
    };

    tasks.push(runProvider(provider, subPayload, options));
  }

  const results = await Promise.allSettled(tasks);
  return results
    .filter((r): r is PromiseFulfilledResult<ExpertResult> => r.status === 'fulfilled')
    .map((r) => r.value);
}

export async function cascading(
  providers: ExpertProvider[],
  payload: ReviewPayload,
  primaryProvider: ExpertProvider,
  options?: ReviewOptions,
): Promise<ExpertResult[]> {
  // Step 1: Run primary provider (cheapest/fastest)
  const primaryResult = await runProvider(primaryProvider, payload, options);
  const results: ExpertResult[] = [primaryResult];

  // Step 2: Find medium+ severity findings to escalate
  const escalationFindings = primaryResult.findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'error' || f.severity === 'warning',
  );

  if (escalationFindings.length === 0) return results;

  // Step 3: Run remaining providers on the full payload for validation
  const secondaryProviders = providers.filter((p) => p.id !== primaryProvider.id);
  const secondaryResults = await Promise.allSettled(
    secondaryProviders.map((p) => runProvider(p, payload, options)),
  );

  for (const r of secondaryResults) {
    if (r.status === 'fulfilled') results.push(r.value);
  }

  return results;
}
