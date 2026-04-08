import { describe, it, expect } from 'vitest';
import { sortFindings, determineVerdict, countBySeverity } from './consensus.js';
import type { MergedFinding } from '../types/finding.js';

function makeMerged(overrides: Partial<MergedFinding> = {}): MergedFinding {
  return {
    id: 'F001',
    file_path: 'src/a.ts',
    line_start: 1,
    line_end: 10,
    severity: 'warning',
    category: 'correctness',
    title: 'Test finding',
    description: 'Test',
    suggested_fix: null,
    expert_id: 'claude',
    confidence: 0.9,
    agreementScore: 1,
    consensusStatus: 'unanimous',
    contributingExperts: ['claude'],
    severityVotes: { claude: 'warning' },
    categoryVotes: { claude: 'correctness' },
    dissentingOpinions: [],
    ...overrides,
  };
}

describe('sortFindings', () => {
  it('sorts by severity desc, then agreement desc', () => {
    const findings = [
      makeMerged({ id: 'a', severity: 'info', agreementScore: 1 }),
      makeMerged({ id: 'b', severity: 'critical', agreementScore: 0.5 }),
      makeMerged({ id: 'c', severity: 'critical', agreementScore: 1 }),
      makeMerged({ id: 'd', severity: 'warning', agreementScore: 0.75 }),
    ];
    const sorted = sortFindings(findings);
    expect(sorted.map((f) => f.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('determineVerdict', () => {
  it('returns approve when no critical findings', () => {
    const findings = [makeMerged({ severity: 'info' }), makeMerged({ severity: 'warning' })];
    expect(determineVerdict(findings)).toBe('approve');
  });

  it('returns request_changes when critical finding exists', () => {
    const findings = [makeMerged({ severity: 'critical' })];
    expect(determineVerdict(findings)).toBe('request_changes');
  });

  it('respects custom failOnSeverity', () => {
    const findings = [makeMerged({ severity: 'error' })];
    expect(determineVerdict(findings, 'error')).toBe('request_changes');
    expect(determineVerdict(findings, 'critical')).not.toBe('request_changes');
  });

  it('returns needs_discussion for split warnings', () => {
    const findings = [makeMerged({ severity: 'warning', consensusStatus: 'split' })];
    expect(determineVerdict(findings)).toBe('needs_discussion');
  });

  it('returns approve for empty findings', () => {
    expect(determineVerdict([])).toBe('approve');
  });
});

describe('countBySeverity', () => {
  it('counts findings by severity', () => {
    const findings = [
      makeMerged({ severity: 'critical' }),
      makeMerged({ severity: 'critical' }),
      makeMerged({ severity: 'warning' }),
      makeMerged({ severity: 'info' }),
    ];
    const counts = countBySeverity(findings);
    expect(counts).toEqual({ critical: 2, error: 0, warning: 1, info: 1, style: 0 });
  });
});
