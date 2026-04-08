import { describe, it, expect, vi } from 'vitest';
import { synthesize } from './synthesis/synthesizer.js';
import { deduplicateFindings } from './synthesis/dedup.js';
import { sortFindings, determineVerdict } from './synthesis/consensus.js';
import type { ExpertResult } from './types/provider.js';
import type { Finding } from './types/finding.js';

// Test the full synthesis pipeline (the core of what runReview orchestrates)
// We test synthesis directly rather than runReview since runReview requires git + real providers

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: `F_${Math.random().toString(36).slice(2, 8)}`,
    file_path: 'src/api/queries.ts',
    line_start: 42,
    line_end: 58,
    severity: 'critical',
    category: 'security',
    title: 'SQL injection via unsanitized user input',
    description: 'Direct SQL concatenation',
    suggested_fix: 'Use parameterized queries.',
    expert_id: 'claude',
    confidence: 0.95,
    ...overrides,
  };
}

function makeExpertResult(expertId: string, findings: Finding[]): ExpertResult {
  return {
    expertId,
    findings,
    meta: {
      expertId,
      model: `${expertId}-model`,
      tokenUsage: { inputTokens: 1000, outputTokens: 500 },
      costUsd: expertId === 'ollama' ? 0 : 0.01,
      durationMs: 3000,
      rawFindings: findings.length,
      validFindings: findings.length,
    },
  };
}

describe('Full synthesis pipeline (orchestrator core)', () => {
  it('deduplicates unanimous findings across 4 experts', () => {
    const finding = makeFinding();
    const results: ExpertResult[] = [
      makeExpertResult('claude', [{ ...finding, expert_id: 'claude' }]),
      makeExpertResult('gemini', [{ ...finding, expert_id: 'gemini' }]),
      makeExpertResult('openai', [{ ...finding, expert_id: 'openai' }]),
      makeExpertResult('ollama', [{ ...finding, expert_id: 'ollama' }]),
    ];

    const report = synthesize(
      results,
      { type: 'staged' },
      'my-api',
      'feature/auth',
      'abc123',
      { dedupThreshold: 0.75, failOnSeverity: 'critical' },
    );

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.agreementScore).toBe(1);
    expect(report.findings[0]!.consensusStatus).toBe('unanimous');
    expect(report.findings[0]!.contributingExperts).toHaveLength(4);
    expect(report.summary.verdict).toBe('request_changes');
  });

  it('produces correct report with mixed findings', () => {
    const sqlInjection = makeFinding({ title: 'SQL injection', severity: 'critical', category: 'security' });
    const n1Query = makeFinding({
      title: 'N+1 query in user list',
      severity: 'warning',
      category: 'performance',
      file_path: 'src/api/users.ts',
      line_start: 67,
      line_end: 82,
    });
    const godFunction = makeFinding({
      title: 'God function exceeds 200 lines',
      severity: 'warning',
      category: 'maintainability',
      file_path: 'src/middleware/handler.ts',
      line_start: 15,
      line_end: 220,
    });

    const results: ExpertResult[] = [
      makeExpertResult('claude', [
        { ...sqlInjection, expert_id: 'claude' },
        { ...godFunction, expert_id: 'claude' },
      ]),
      makeExpertResult('gemini', [
        { ...sqlInjection, expert_id: 'gemini' },
        { ...n1Query, expert_id: 'gemini' },
      ]),
      makeExpertResult('ollama', [
        { ...sqlInjection, expert_id: 'ollama' },
        { ...n1Query, expert_id: 'ollama' },
      ]),
    ];

    const report = synthesize(
      results,
      { type: 'branch', name: 'feature/auth' },
      'my-api',
      'feature/auth',
      'abc123',
      { dedupThreshold: 0.75, failOnSeverity: 'critical' },
    );

    // SQL injection: all 3 experts → unanimous
    const sqlFinding = report.findings.find((f) => f.title.includes('SQL injection'));
    expect(sqlFinding).toBeDefined();
    expect(sqlFinding!.agreementScore).toBeCloseTo(1, 1);
    expect(sqlFinding!.consensusStatus).toBe('unanimous');

    // N+1 query: 2 of 3 experts → majority
    const n1Finding = report.findings.find((f) => f.title.includes('N+1'));
    expect(n1Finding).toBeDefined();
    expect(n1Finding!.agreementScore).toBeCloseTo(0.67, 1);
    expect(n1Finding!.consensusStatus).toBe('majority');

    // God function: 1 of 3 experts → split
    const godFinding = report.findings.find((f) => f.title.includes('God'));
    expect(godFinding).toBeDefined();
    expect(godFinding!.agreementScore).toBeCloseTo(0.33, 1);
    expect(godFinding!.consensusStatus).toBe('split');

    // Verdict: request_changes (critical finding present)
    expect(report.summary.verdict).toBe('request_changes');

    // Cost: claude + gemini + ollama
    expect(report.costBreakdown.totalCostUsd).toBeCloseTo(0.02, 2);
    expect(report.costBreakdown.perExpert['ollama']).toBe(0);

    // Expert metadata
    expect(report.expertMetadata).toHaveLength(3);

    // Sorted: critical first, then by agreement
    expect(report.findings[0]!.severity).toBe('critical');
  });

  it('returns approve when no critical findings', () => {
    const results: ExpertResult[] = [
      makeExpertResult('claude', [
        makeFinding({ expert_id: 'claude', severity: 'info', title: 'Style issue' }),
      ]),
    ];

    const report = synthesize(
      results,
      { type: 'staged' },
      'my-api',
      'main',
      'abc123',
      { dedupThreshold: 0.75, failOnSeverity: 'critical' },
    );

    expect(report.summary.verdict).toBe('approve');
  });

  it('handles empty expert results', () => {
    const results: ExpertResult[] = [
      makeExpertResult('claude', []),
      makeExpertResult('gemini', []),
    ];

    const report = synthesize(
      results,
      { type: 'staged' },
      'my-api',
      'main',
      'abc123',
      { dedupThreshold: 0.75, failOnSeverity: 'critical' },
    );

    expect(report.findings).toHaveLength(0);
    expect(report.summary.verdict).toBe('approve');
    expect(report.summary.totalFindings).toBe(0);
  });

  it('resolves conflicting severities to highest', () => {
    const finding = makeFinding({ title: 'Race condition' });
    const results: ExpertResult[] = [
      makeExpertResult('claude', [{ ...finding, expert_id: 'claude', severity: 'critical' }]),
      makeExpertResult('gemini', [{ ...finding, expert_id: 'gemini', severity: 'warning' }]),
    ];

    const report = synthesize(
      results,
      { type: 'staged' },
      'my-api',
      'main',
      'abc123',
      { dedupThreshold: 0.75, failOnSeverity: 'critical' },
    );

    expect(report.findings[0]!.severity).toBe('critical');
    expect(report.findings[0]!.dissentingOpinions.length).toBeGreaterThan(0);
  });

  it('includes narrative in summary', () => {
    const results: ExpertResult[] = [
      makeExpertResult('claude', [makeFinding({ expert_id: 'claude' })]),
    ];

    const report = synthesize(
      results,
      { type: 'staged' },
      'my-api',
      'main',
      'abc123',
      { dedupThreshold: 0.75, failOnSeverity: 'critical' },
    );

    expect(report.summary.narrative).toContain('REQUEST CHANGES');
    expect(report.summary.narrative.length).toBeGreaterThan(50);
  });
});
