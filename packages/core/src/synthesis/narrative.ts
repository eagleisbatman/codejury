import type { MergedFinding, Severity } from '../types/finding.js';
import type { Verdict } from '../types/review.js';
import { countBySeverity } from './consensus.js';

function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case 'approve': return 'APPROVE';
    case 'request_changes': return 'REQUEST CHANGES';
    case 'needs_discussion': return 'NEEDS DISCUSSION';
  }
}

/**
 * Template-based narrative summary. Used as fallback when Claude is unavailable.
 */
export function generateTemplateNarrative(
  findings: MergedFinding[],
  verdict: Verdict,
  fileCount: number,
  expertCount: number,
): string {
  const counts = countBySeverity(findings);
  const unanimous = findings.filter((f) => f.consensusStatus === 'unanimous').length;
  const split = findings.filter((f) => f.consensusStatus === 'split').length;

  const severityParts: string[] = [];
  const labels: [Severity, string][] = [
    ['critical', 'critical'],
    ['error', 'error'],
    ['warning', 'warning'],
    ['info', 'informational'],
    ['style', 'style'],
  ];
  for (const [sev, label] of labels) {
    if (counts[sev] > 0) {
      severityParts.push(`${counts[sev]} ${label}`);
    }
  }

  let narrative = `**${verdictLabel(verdict)}** — CodeJury reviewed ${fileCount} file${fileCount !== 1 ? 's' : ''} with a panel of ${expertCount} expert${expertCount !== 1 ? 's' : ''}, producing ${findings.length} deduplicated finding${findings.length !== 1 ? 's' : ''}: ${severityParts.join(', ')}.`;

  if (unanimous > 0) {
    narrative += ` ${unanimous} finding${unanimous !== 1 ? 's' : ''} had unanimous expert agreement.`;
  }

  if (split > 0) {
    narrative += ` ${split} finding${split !== 1 ? 's' : ''} had split opinions — human judgment recommended.`;
  }

  if (verdict === 'request_changes') {
    const criticals = findings.filter((f) => f.severity === 'critical');
    if (criticals.length > 0) {
      narrative += `\n\nCritical issues requiring immediate attention:\n`;
      for (const f of criticals) {
        narrative += `- **${f.title}** (${f.file_path}:${f.line_start}-${f.line_end}) — ${f.agreementScore === 1 ? 'all experts agree' : `${Math.round(f.agreementScore * 100)}% agreement`}\n`;
      }
    }
  }

  return narrative;
}
