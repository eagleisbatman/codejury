import { describe, it, expect } from 'vitest';
import { formatJson, formatMarkdown, formatSarif, formatHtml, formatReport } from './index.js';
import type { SynthesizedReport } from '../types/review.js';
import type { MergedFinding } from '../types/finding.js';

const mockFinding: MergedFinding = {
  id: 'F001',
  file_path: 'src/api/queries.ts',
  line_start: 42,
  line_end: 58,
  severity: 'critical',
  category: 'security',
  title: 'SQL injection via unsanitized user input',
  description: 'The buildQuery function concatenates user-supplied filters directly into SQL.',
  suggested_fix: 'Use parameterized queries.',
  expert_id: 'claude',
  confidence: 0.95,
  agreementScore: 1.0,
  consensusStatus: 'unanimous',
  contributingExperts: ['claude', 'gemini', 'ollama'],
  severityVotes: { claude: 'critical', gemini: 'critical', ollama: 'critical' },
  categoryVotes: { claude: 'security', gemini: 'security', ollama: 'security' },
  dissentingOpinions: [],
};

const mockReport: SynthesizedReport = {
  reviewId: 'rev_test123',
  repo: 'my-api',
  branch: 'feature/auth',
  commit: 'abc12345def67890',
  scope: { type: 'staged' },
  findings: [mockFinding],
  summary: {
    totalFindings: 1,
    bySeverity: { critical: 1, error: 0, warning: 0, info: 0, style: 0 },
    verdict: 'request_changes',
    narrative: 'CodeJury found 1 critical SQL injection vulnerability.',
  },
  expertMetadata: [
    {
      expertId: 'claude',
      model: 'claude-sonnet-4-20250514',
      tokenUsage: { inputTokens: 1000, outputTokens: 500 },
      costUsd: 0.0105,
      durationMs: 5000,
      rawFindings: 1,
      validFindings: 1,
    },
  ],
  costBreakdown: { totalCostUsd: 0.0105, perExpert: { claude: 0.0105 } },
  timestamp: new Date('2026-04-08T12:00:00Z'),
};

describe('formatJson', () => {
  it('produces valid JSON', () => {
    const output = formatJson(mockReport);
    const parsed = JSON.parse(output);
    expect(parsed.reviewId).toBe('rev_test123');
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.summary.verdict).toBe('request_changes');
  });
});

describe('formatMarkdown', () => {
  it('includes verdict', () => {
    const md = formatMarkdown(mockReport);
    expect(md).toContain('REQUEST CHANGES');
  });

  it('includes finding details', () => {
    const md = formatMarkdown(mockReport);
    expect(md).toContain('SQL injection');
    expect(md).toContain('src/api/queries.ts');
    expect(md).toContain('100%');
  });

  it('includes cost summary', () => {
    const md = formatMarkdown(mockReport);
    expect(md).toContain('$0.0105');
  });

  it('includes narrative', () => {
    const md = formatMarkdown(mockReport);
    expect(md).toContain('critical SQL injection');
  });
});

describe('formatSarif', () => {
  it('produces valid SARIF 2.1.0', () => {
    const output = formatSarif(mockReport);
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.name).toBe('CodeJury');
  });

  it('maps findings to SARIF results', () => {
    const parsed = JSON.parse(formatSarif(mockReport));
    expect(parsed.runs[0].results).toHaveLength(1);
    expect(parsed.runs[0].results[0].level).toBe('error'); // critical -> error in SARIF
    expect(parsed.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('src/api/queries.ts');
  });

  it('includes rules', () => {
    const parsed = JSON.parse(formatSarif(mockReport));
    expect(parsed.runs[0].tool.driver.rules).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.rules[0].id).toBe('CJ001');
  });
});

describe('formatHtml', () => {
  it('produces valid HTML', () => {
    const html = formatHtml(mockReport);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes finding details', () => {
    const html = formatHtml(mockReport);
    expect(html).toContain('SQL injection');
    expect(html).toContain('CRITICAL');
  });

  it('escapes HTML in user content', () => {
    const reportWithXss: SynthesizedReport = {
      ...mockReport,
      findings: [
        { ...mockFinding, title: '<script>alert("xss")</script>' },
      ],
    };
    const html = formatHtml(reportWithXss);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('formatReport', () => {
  it('dispatches to correct formatter', () => {
    expect(formatReport(mockReport, 'json')).toContain('"reviewId"');
    expect(formatReport(mockReport, 'markdown')).toContain('# CodeJury');
    expect(formatReport(mockReport, 'sarif')).toContain('"version": "2.1.0"');
    expect(formatReport(mockReport, 'html')).toContain('<!DOCTYPE html>');
  });
});
