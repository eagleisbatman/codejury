import type { SynthesizedReport, MergedFinding } from '../types/index.js';

interface GitHubComment {
  path: string;
  line: number;
  body: string;
}

function severityEmoji(severity: string): string {
  const map: Record<string, string> = {
    critical: '🔴', error: '🟠', warning: '🟡', info: '🔵', style: '⚪',
  };
  return map[severity] ?? '⚪';
}

/**
 * Build inline PR review comments for each finding.
 */
export function buildPrComments(report: SynthesizedReport): GitHubComment[] {
  return report.findings.map((f) => ({
    path: f.file_path,
    line: f.line_start,
    body: formatFindingComment(f),
  }));
}

function formatFindingComment(f: MergedFinding): string {
  const emoji = severityEmoji(f.severity);
  const expertList = f.contributingExperts.join(', ');
  const agreement = `${Math.round(f.agreementScore * 100)}% agreement (${f.consensusStatus})`;

  let body = `${emoji} **${f.severity.toUpperCase()}** — ${f.title}\n\n`;
  body += `**Category:** ${f.category} | **Agreement:** ${agreement}\n`;
  body += `**Experts:** ${expertList}\n\n`;
  body += `${f.description}\n`;

  if (f.suggested_fix) {
    body += `\n<details><summary>Suggested Fix</summary>\n\n\`\`\`\n${f.suggested_fix}\n\`\`\`\n</details>\n`;
  }

  if (f.dissentingOpinions.length > 0) {
    body += `\n<details><summary>Dissenting Views</summary>\n\n`;
    for (const d of f.dissentingOpinions) {
      body += `> **${d.expertId}** (${d.severity}/${d.category}): ${d.reasoning}\n\n`;
    }
    body += `</details>\n`;
  }

  body += `\n---\n_CodeJury ${f.id}_`;

  return body;
}

/**
 * Build the summary review comment posted at PR level.
 */
export function buildSummaryComment(report: SynthesizedReport): string {
  const sev = report.summary.bySeverity;
  const verdictEmoji = report.summary.verdict === 'approve' ? '✅'
    : report.summary.verdict === 'request_changes' ? '🚫' : '💬';

  let body = `## ${verdictEmoji} CodeJury Review\n\n`;
  body += report.summary.narrative + '\n\n';

  body += `| Severity | Count |\n|----------|-------|\n`;
  if (sev.critical) body += `| 🔴 Critical | ${sev.critical} |\n`;
  if (sev.error) body += `| 🟠 Error | ${sev.error} |\n`;
  if (sev.warning) body += `| 🟡 Warning | ${sev.warning} |\n`;
  if (sev.info) body += `| 🔵 Info | ${sev.info} |\n`;
  if (sev.style) body += `| ⚪ Style | ${sev.style} |\n`;

  body += `\n**Experts:** ${report.expertMetadata.map((m) => `${m.expertId} (${m.model})`).join(', ')}\n`;
  body += `**Cost:** $${report.costBreakdown.totalCostUsd.toFixed(4)}\n`;

  return body;
}

/**
 * Post review to GitHub PR using Octokit.
 * This function requires @octokit/rest to be available.
 */
export async function postGitHubReview(
  report: SynthesizedReport,
  options: {
    owner: string;
    repo: string;
    pullNumber: number;
    token: string;
  },
): Promise<void> {
  // Dynamic import to keep @octokit/rest optional
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: options.token });

  const comments = buildPrComments(report);
  const summaryBody = buildSummaryComment(report);
  const event = report.summary.verdict === 'approve' ? 'APPROVE' as const
    : report.summary.verdict === 'request_changes' ? 'REQUEST_CHANGES' as const
    : 'COMMENT' as const;

  await octokit.pulls.createReview({
    owner: options.owner,
    repo: options.repo,
    pull_number: options.pullNumber,
    body: summaryBody,
    event,
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
    })),
  });
}

export { type GitHubComment };
