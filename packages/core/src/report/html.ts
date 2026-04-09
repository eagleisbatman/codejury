import type { SynthesizedReport } from '../types/review.js';
import type { MergedFinding, Severity } from '../types/finding.js';
import { scopeToString } from '../git/scope.js';

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#EF4444',
  error: '#F97316',
  warning: '#EAB308',
  info: '#6366F1',
  style: '#94A3B8',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderFinding(f: MergedFinding): string {
  const color = SEVERITY_COLORS[f.severity];
  return `
    <div class="finding" style="border-left: 4px solid ${color}">
      <div class="finding-header">
        <span class="badge" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40">${f.severity.toUpperCase()}</span>
        <span class="badge" style="background: #6366F120; color: #6366F1; border: 1px solid #6366F140">${f.category}</span>
        <span class="agreement">${Math.round(f.agreementScore * 100)}% agreement</span>
      </div>
      <h3>${escapeHtml(f.title)}</h3>
      <p class="location">${escapeHtml(f.file_path)}:${f.line_start}-${f.line_end}</p>
      <p class="description">${escapeHtml(f.description)}</p>
      <p class="experts">Experts: ${f.contributingExperts.map(e => escapeHtml(e)).join(', ')}</p>
      ${f.suggested_fix ? `<details><summary>Suggested Fix</summary><pre><code>${escapeHtml(f.suggested_fix)}</code></pre></details>` : ''}
      ${f.dissentingOpinions.length > 0 ? `<details><summary>Dissenting Views (${f.dissentingOpinions.length})</summary>${f.dissentingOpinions.map((d) => `<blockquote><strong>${escapeHtml(d.expertId)}</strong> (${d.severity}/${d.category}): ${escapeHtml(d.reasoning.slice(0, 300))}</blockquote>`).join('')}</details>` : ''}
    </div>`;
}

export function formatHtml(report: SynthesizedReport): string {
  const scope = scopeToString(report.scope);
  const verdictColor =
    report.summary.verdict === 'approve' ? '#10B981' : report.summary.verdict === 'request_changes' ? '#EF4444' : '#F59E0B';

  const findingsHtml = report.findings.map((f) => renderFinding(f)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeJury Review — ${escapeHtml(report.repo)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0F172A; color: #E2E8F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin: 1.5rem 0 0.75rem; color: #94A3B8; }
    h3 { font-size: 1rem; margin: 0.5rem 0; }
    .meta { color: #64748B; font-size: 0.85rem; margin-bottom: 1rem; }
    .verdict { display: inline-block; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 700; font-size: 1rem; margin: 1rem 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; margin-right: 6px; }
    .finding { background: #1E293B; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
    .finding-header { display: flex; align-items: center; gap: 8px; margin-bottom: 0.5rem; }
    .agreement { color: #94A3B8; font-size: 0.8rem; margin-left: auto; }
    .location { color: #64748B; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; margin: 0.25rem 0; }
    .description { color: #CBD5E1; font-size: 0.9rem; line-height: 1.5; margin: 0.5rem 0; }
    .experts { color: #64748B; font-size: 0.8rem; }
    details { margin-top: 0.75rem; }
    summary { cursor: pointer; color: #6366F1; font-size: 0.85rem; }
    pre { background: #0F172A; border-radius: 4px; padding: 0.75rem; margin-top: 0.5rem; overflow-x: auto; }
    code { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; color: #E2E8F0; }
    blockquote { border-left: 2px solid #F59E0B; padding-left: 0.75rem; margin: 0.5rem 0; color: #CBD5E1; font-size: 0.85rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #334155; font-size: 0.85rem; }
    th { color: #64748B; }
    .narrative { background: #1E293B; border-radius: 8px; padding: 1rem; margin: 1rem 0; line-height: 1.6; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>CodeJury Review Report</h1>
  <p class="meta">${escapeHtml(report.repo)} &middot; ${escapeHtml(report.branch)} &middot; ${escapeHtml(scope)} &middot; <code>${escapeHtml(report.commit.slice(0, 8))}</code></p>

  <div class="verdict" style="background: ${verdictColor}20; color: ${verdictColor}; border: 1px solid ${verdictColor}40">
    ${report.summary.verdict.toUpperCase().replace(/_/g, ' ')}
  </div>

  <div class="narrative">${escapeHtml(report.summary.narrative)}</div>

  <h2>Findings (${report.summary.totalFindings})</h2>
  <div style="display: flex; gap: 6px; margin-bottom: 1rem; flex-wrap: wrap">
    ${(['critical', 'error', 'warning', 'info', 'style'] as const)
      .filter((sev) => report.summary.bySeverity[sev] > 0)
      .map((sev) => `<span class="badge" style="background: ${SEVERITY_COLORS[sev]}20; color: ${SEVERITY_COLORS[sev]}; border: 1px solid ${SEVERITY_COLORS[sev]}40">${report.summary.bySeverity[sev]} ${sev.charAt(0).toUpperCase() + sev.slice(1)}</span>`)
      .join('\n    ')}
  </div>
  ${findingsHtml}

  <h2>Cost Summary</h2>
  <table>
    <thead><tr><th>Expert</th><th>Model</th><th>Tokens</th><th>Cost</th></tr></thead>
    <tbody>
      ${report.expertMetadata.map((m) => `<tr><td>${escapeHtml(m.expertId)}</td><td>${escapeHtml(m.model)}</td><td>${m.tokenUsage.inputTokens + m.tokenUsage.outputTokens}</td><td>$${m.costUsd.toFixed(4)}</td></tr>`).join('\n      ')}
      <tr><td colspan="3"><strong>Total</strong></td><td><strong>$${report.costBreakdown.totalCostUsd.toFixed(4)}</strong></td></tr>
    </tbody>
  </table>

  <p class="meta" style="margin-top: 2rem; text-align: center;">Generated by CodeJury v0.1.0 &middot; ${report.timestamp.toISOString()}</p>
</body>
</html>`;
}
