import { nanoid } from 'nanoid';
import type { ExpertResult } from '../types/provider.js';
import type { SynthesizedReport, GitScope, CostBreakdown } from '../types/review.js';
import type { Severity } from '../types/finding.js';
import { deduplicateFindings } from './dedup.js';
import { sortFindings, determineVerdict, countBySeverity } from './consensus.js';
import { generateTemplateNarrative } from './narrative.js';

export interface SynthesisConfig {
  dedupThreshold: number;
  failOnSeverity: Severity;
}

export function synthesize(
  expertResults: ExpertResult[],
  scope: GitScope,
  repo: string,
  branch: string,
  commit: string,
  config: SynthesisConfig,
): SynthesizedReport {
  const expertFindings = expertResults.map((r) => r.findings);

  // Deduplicate across experts
  const merged = deduplicateFindings(expertFindings, {
    dedupThreshold: config.dedupThreshold,
  });

  // Sort by severity desc, then agreement desc
  const sorted = sortFindings(merged);

  // Determine verdict
  const verdict = determineVerdict(sorted, config.failOnSeverity);

  // Count by severity
  const bySeverity = countBySeverity(sorted);

  // Aggregate file count from merged findings
  const fileCount = new Set(sorted.map((f) => f.file_path)).size;

  // Generate narrative
  const narrative = generateTemplateNarrative(
    sorted,
    verdict,
    fileCount,
    expertResults.length,
  );

  // Build cost breakdown
  const costBreakdown: CostBreakdown = {
    totalCostUsd: expertResults.reduce((sum, r) => sum + r.meta.costUsd, 0),
    perExpert: Object.fromEntries(
      expertResults.map((r) => [r.meta.expertId, r.meta.costUsd]),
    ),
  };

  return {
    reviewId: nanoid(),
    repo,
    branch,
    commit,
    scope,
    findings: sorted,
    summary: {
      totalFindings: sorted.length,
      bySeverity,
      verdict,
      narrative,
    },
    expertMetadata: expertResults.map((r) => r.meta),
    costBreakdown,
    timestamp: new Date(),
  };
}
