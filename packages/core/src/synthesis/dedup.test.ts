import { describe, it, expect } from 'vitest';
import { deduplicateFindings } from './dedup.js';
import type { Finding } from '../types/finding.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F001',
    file_path: 'src/api/queries.ts',
    line_start: 42,
    line_end: 58,
    severity: 'critical',
    category: 'security',
    title: 'SQL injection via unsanitized user input',
    description: 'Direct SQL concatenation',
    suggested_fix: 'Use parameterized queries',
    expert_id: 'claude',
    confidence: 0.95,
    ...overrides,
  };
}

describe('deduplicateFindings', () => {
  it('merges identical findings from multiple experts', () => {
    const claude = [makeFinding({ expert_id: 'claude' })];
    const gemini = [makeFinding({ expert_id: 'gemini' })];
    const ollama = [makeFinding({ expert_id: 'ollama' })];

    const merged = deduplicateFindings([claude, gemini, ollama]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.contributingExperts).toEqual(['claude', 'gemini', 'ollama']);
    expect(merged[0]!.agreementScore).toBe(1);
    expect(merged[0]!.consensusStatus).toBe('unanimous');
  });

  it('handles split findings (2 of 4 experts)', () => {
    const claude = [makeFinding({ expert_id: 'claude' })];
    const gemini = [makeFinding({ expert_id: 'gemini' })];
    const openai: Finding[] = [];
    const ollama: Finding[] = [];

    const merged = deduplicateFindings([claude, gemini, openai, ollama]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.agreementScore).toBe(0.5);
    expect(merged[0]!.consensusStatus).toBe('split');
  });

  it('handles majority findings (3 of 4 experts)', () => {
    const claude = [makeFinding({ expert_id: 'claude' })];
    const gemini = [makeFinding({ expert_id: 'gemini' })];
    const openai = [makeFinding({ expert_id: 'openai' })];
    const ollama: Finding[] = [];

    const merged = deduplicateFindings([claude, gemini, openai, ollama]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.agreementScore).toBe(0.75);
    expect(merged[0]!.consensusStatus).toBe('majority');
  });

  it('keeps unique findings separate', () => {
    const claude = [makeFinding({ expert_id: 'claude', title: 'SQL injection', file_path: 'src/a.ts' })];
    const gemini = [makeFinding({ expert_id: 'gemini', title: 'N+1 query', file_path: 'src/b.ts', category: 'performance', severity: 'warning' })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged).toHaveLength(2);
  });

  it('merges findings with overlapping line ranges', () => {
    const claude = [makeFinding({ expert_id: 'claude', line_start: 42, line_end: 50 })];
    const gemini = [makeFinding({ expert_id: 'gemini', line_start: 48, line_end: 60, title: 'Different title for same issue' })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.contributingExperts).toEqual(['claude', 'gemini']);
  });

  it('merges findings within tolerance (5 lines)', () => {
    const claude = [makeFinding({ expert_id: 'claude', line_start: 42, line_end: 45 })];
    const gemini = [makeFinding({ expert_id: 'gemini', line_start: 50, line_end: 55 })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged).toHaveLength(1);
  });

  it('does not merge findings outside tolerance', () => {
    const claude = [makeFinding({ expert_id: 'claude', line_start: 10, line_end: 15 })];
    const gemini = [makeFinding({ expert_id: 'gemini', line_start: 100, line_end: 110, title: 'Completely different issue' })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged).toHaveLength(2);
  });

  it('resolves severity to highest vote', () => {
    const claude = [makeFinding({ expert_id: 'claude', severity: 'critical' })];
    const gemini = [makeFinding({ expert_id: 'gemini', severity: 'warning' })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged[0]!.severity).toBe('critical');
    expect(merged[0]!.severityVotes).toEqual({ claude: 'critical', gemini: 'warning' });
  });

  it('records dissenting opinions', () => {
    const claude = [makeFinding({ expert_id: 'claude', severity: 'critical', category: 'security' })];
    const gemini = [makeFinding({ expert_id: 'gemini', severity: 'warning', category: 'performance' })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged[0]!.dissentingOpinions.length).toBeGreaterThan(0);
  });

  it('handles empty input', () => {
    expect(deduplicateFindings([])).toEqual([]);
    expect(deduplicateFindings([[], []])).toEqual([]);
  });

  it('picks the most detailed suggested_fix', () => {
    const claude = [makeFinding({ expert_id: 'claude', suggested_fix: 'short fix' })];
    const gemini = [makeFinding({ expert_id: 'gemini', suggested_fix: 'This is a much more detailed fix with code examples and explanation' })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged[0]!.suggested_fix).toContain('much more detailed');
  });

  it('merges findings with similar titles (Levenshtein)', () => {
    const claude = [makeFinding({ expert_id: 'claude', title: 'SQL injection vulnerability', line_start: 100, line_end: 100 })];
    const gemini = [makeFinding({ expert_id: 'gemini', title: 'SQL injection vulnerabilities', line_start: 100, line_end: 100 })];

    const merged = deduplicateFindings([claude, gemini]);
    expect(merged).toHaveLength(1);
  });
});
