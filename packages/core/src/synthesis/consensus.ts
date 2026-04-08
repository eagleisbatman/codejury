import type { MergedFinding, Severity } from '../types/finding.js';
import { SEVERITY_ORDER } from '../types/finding.js';
import type { Verdict } from '../types/review.js';

export function sortFindings(findings: MergedFinding[]): MergedFinding[] {
  return [...findings].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.agreementScore - a.agreementScore;
  });
}

export function determineVerdict(
  findings: MergedFinding[],
  failOnSeverity: Severity = 'critical',
): Verdict {
  const failThreshold = SEVERITY_ORDER[failOnSeverity];

  const hasCritical = findings.some(
    (f) => SEVERITY_ORDER[f.severity] >= failThreshold,
  );

  if (hasCritical) return 'request_changes';

  const hasSplit = findings.some(
    (f) => f.consensusStatus === 'split' && SEVERITY_ORDER[f.severity] >= SEVERITY_ORDER['warning'],
  );

  if (hasSplit) return 'needs_discussion';

  return 'approve';
}

export function countBySeverity(
  findings: MergedFinding[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    critical: 0,
    error: 0,
    warning: 0,
    info: 0,
    style: 0,
  };
  for (const f of findings) {
    counts[f.severity]++;
  }
  return counts;
}
