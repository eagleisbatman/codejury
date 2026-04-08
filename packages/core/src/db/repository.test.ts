import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ReviewRepository } from './repository.js';
import type { SynthesizedReport } from '../types/review.js';
import type { MergedFinding } from '../types/finding.js';

function makeReport(overrides: Partial<SynthesizedReport> = {}): SynthesizedReport {
  const rid = Math.random().toString(36).slice(2, 8);
  const finding: MergedFinding = {
    id: `F_${rid}`,
    file_path: 'src/a.ts',
    line_start: 10,
    line_end: 20,
    severity: 'critical',
    category: 'security',
    title: 'SQL injection',
    description: 'Direct SQL concatenation',
    suggested_fix: 'Use params',
    expert_id: 'claude',
    confidence: 0.95,
    agreementScore: 1.0,
    consensusStatus: 'unanimous',
    contributingExperts: ['claude', 'gemini'],
    severityVotes: { claude: 'critical', gemini: 'critical' },
    categoryVotes: { claude: 'security', gemini: 'security' },
    dissentingOpinions: [],
  };

  return {
    reviewId: 'rev_test_' + Math.random().toString(36).slice(2, 8),
    repo: 'my-api',
    branch: 'feature/auth',
    commit: 'abc12345def67890',
    scope: { type: 'staged' },
    findings: [finding],
    summary: {
      totalFindings: 1,
      bySeverity: { critical: 1, error: 0, warning: 0, info: 0, style: 0 },
      verdict: 'request_changes',
      narrative: 'Found critical issues.',
    },
    expertMetadata: [
      {
        expertId: 'claude',
        model: 'claude-sonnet-4-20250514',
        tokenUsage: { inputTokens: 1000, outputTokens: 500 },
        costUsd: 0.01,
        durationMs: 3000,
        rawFindings: 1,
        validFindings: 1,
      },
    ],
    costBreakdown: { totalCostUsd: 0.01, perExpert: { claude: 0.01 } },
    timestamp: new Date(),
    ...overrides,
  };
}

let repo: ReviewRepository;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'codejury-test-'));
  repo = new ReviewRepository(join(tmpDir, 'test.db'));
});

afterEach(() => {
  repo.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('ReviewRepository', () => {
  it('saves and retrieves a report', () => {
    const report = makeReport();
    repo.saveReport(report);

    const session = repo.getSession(report.reviewId);
    expect(session).not.toBeNull();
    expect(session!.reviewId).toBe(report.reviewId);
    expect(session!.verdict).toBe('request_changes');
    expect(session!.findingCounts.critical).toBe(1);
    expect(session!.expertsUsed).toContain('claude');
  });

  it('lists sessions ordered by time', () => {
    const r1 = makeReport({ timestamp: new Date('2026-01-01') });
    const r2 = makeReport({ timestamp: new Date('2026-04-01') });
    repo.saveReport(r1);
    repo.saveReport(r2);

    const sessions = repo.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.reviewId).toBe(r2.reviewId); // newest first
  });

  it('filters by branch', () => {
    repo.saveReport(makeReport({ branch: 'main' }));
    repo.saveReport(makeReport({ branch: 'feature/auth' }));

    const sessions = repo.listSessions({ branch: 'main' });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.branch).toBe('main');
  });

  it('tracks total cost', () => {
    repo.saveReport(makeReport());
    repo.saveReport(makeReport());
    expect(repo.getTotalCost()).toBeCloseTo(0.02, 4);
  });

  it('returns null for nonexistent session', () => {
    expect(repo.getSession('nonexistent')).toBeNull();
  });
});
