import { describe, it, expect } from 'vitest';
import { extractFindings } from './parser.js';

const validFinding = {
  id: 'F001',
  file_path: 'src/api/queries.ts',
  line_start: 42,
  line_end: 58,
  severity: 'critical',
  category: 'security',
  title: 'SQL injection',
  description: 'Direct SQL concatenation',
  suggested_fix: 'Use parameterized queries',
  expert_id: 'claude',
  confidence: 0.95,
};

describe('extractFindings', () => {
  it('parses a JSON array', () => {
    const { findings, warnings } = extractFindings(JSON.stringify([validFinding]), 'claude');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toBe('SQL injection');
    expect(warnings).toHaveLength(0);
  });

  it('strips markdown fences', () => {
    const text = '```json\n' + JSON.stringify([validFinding]) + '\n```';
    const { findings } = extractFindings(text, 'claude');
    expect(findings).toHaveLength(1);
  });

  it('injects expert_id if missing', () => {
    const { expert_id: _, ...withoutId } = validFinding;
    const { findings } = extractFindings(JSON.stringify([withoutId]), 'gemini');
    expect(findings[0]!.expert_id).toBe('gemini');
  });

  it('skips invalid findings with warnings', () => {
    const items = [
      validFinding,
      { id: 'F002', title: 'Invalid', severity: 'fatal' }, // invalid severity
    ];
    const { findings, warnings } = extractFindings(JSON.stringify(items), 'claude');
    expect(findings).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Skipped invalid finding');
  });

  it('handles empty array', () => {
    const { findings } = extractFindings('[]', 'claude');
    expect(findings).toHaveLength(0);
  });

  it('handles empty string', () => {
    const { findings, warnings } = extractFindings('', 'claude');
    expect(findings).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('extracts array from surrounding text', () => {
    const text = 'Here are my findings:\n' + JSON.stringify([validFinding]) + '\nDone.';
    const { findings } = extractFindings(text, 'claude');
    expect(findings).toHaveLength(1);
  });

  it('wraps a single object in array', () => {
    const { findings } = extractFindings(JSON.stringify(validFinding), 'claude');
    expect(findings).toHaveLength(1);
  });

  it('handles multiple findings', () => {
    const items = [
      validFinding,
      { ...validFinding, id: 'F002', title: 'N+1 query', severity: 'warning', category: 'performance' },
    ];
    const { findings } = extractFindings(JSON.stringify(items), 'claude');
    expect(findings).toHaveLength(2);
  });
});
