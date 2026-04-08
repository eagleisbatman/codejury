import { describe, it, expect } from 'vitest';
import { findingSchema, severityEnum, categoryEnum } from './finding.js';

describe('severityEnum', () => {
  it('accepts valid severities', () => {
    for (const s of ['critical', 'error', 'warning', 'info', 'style']) {
      expect(severityEnum.parse(s)).toBe(s);
    }
  });

  it('rejects invalid severity', () => {
    expect(() => severityEnum.parse('fatal')).toThrow();
    expect(() => severityEnum.parse('')).toThrow();
    expect(() => severityEnum.parse(42)).toThrow();
  });
});

describe('categoryEnum', () => {
  it('accepts valid categories', () => {
    for (const c of [
      'security',
      'correctness',
      'performance',
      'maintainability',
      'style',
      'test_coverage',
    ]) {
      expect(categoryEnum.parse(c)).toBe(c);
    }
  });

  it('rejects invalid category', () => {
    expect(() => categoryEnum.parse('testing')).toThrow();
  });
});

describe('findingSchema', () => {
  const validFinding = {
    id: 'F001',
    file_path: 'src/api/queries.ts',
    line_start: 42,
    line_end: 58,
    severity: 'critical',
    category: 'security',
    title: 'SQL injection via unsanitized user input',
    description: 'The buildQuery function concatenates user input directly into SQL.',
    suggested_fix: 'Use parameterized queries.',
    expert_id: 'claude',
    confidence: 0.95,
  };

  it('accepts a valid finding', () => {
    const result = findingSchema.parse(validFinding);
    expect(result.id).toBe('F001');
    expect(result.severity).toBe('critical');
    expect(result.confidence).toBe(0.95);
  });

  it('defaults suggested_fix to null', () => {
    const { suggested_fix: _, ...withoutFix } = validFinding;
    const result = findingSchema.parse(withoutFix);
    expect(result.suggested_fix).toBeNull();
  });

  it('rejects missing required fields', () => {
    expect(() => findingSchema.parse({})).toThrow();
    expect(() => findingSchema.parse({ id: 'F001' })).toThrow();
  });

  it('rejects title exceeding 120 chars', () => {
    expect(() =>
      findingSchema.parse({
        ...validFinding,
        title: 'x'.repeat(121),
      }),
    ).toThrow();
  });

  it('rejects confidence outside 0-1 range', () => {
    expect(() => findingSchema.parse({ ...validFinding, confidence: 1.5 })).toThrow();
    expect(() => findingSchema.parse({ ...validFinding, confidence: -0.1 })).toThrow();
  });

  it('rejects negative line numbers', () => {
    expect(() => findingSchema.parse({ ...validFinding, line_start: -1 })).toThrow();
  });

  it('rejects invalid severity in finding', () => {
    expect(() => findingSchema.parse({ ...validFinding, severity: 'fatal' })).toThrow();
  });

  it('rejects invalid category in finding', () => {
    expect(() => findingSchema.parse({ ...validFinding, category: 'unknown' })).toThrow();
  });
});
