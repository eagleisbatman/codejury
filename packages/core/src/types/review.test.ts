import { describe, it, expect } from 'vitest';
import { gitScopeSchema, verdictEnum } from './review.js';

describe('gitScopeSchema', () => {
  it('parses staged scope', () => {
    const result = gitScopeSchema.parse({ type: 'staged' });
    expect(result.type).toBe('staged');
  });

  it('parses branch scope', () => {
    const result = gitScopeSchema.parse({ type: 'branch', name: 'feature/auth' });
    expect(result).toEqual({ type: 'branch', name: 'feature/auth' });
  });

  it('parses commit_range scope', () => {
    const result = gitScopeSchema.parse({
      type: 'commit_range',
      from: 'abc123',
      to: 'def456',
    });
    expect(result).toEqual({ type: 'commit_range', from: 'abc123', to: 'def456' });
  });

  it('parses pr scope', () => {
    const result = gitScopeSchema.parse({
      type: 'pr',
      url: 'https://github.com/org/repo/pull/42',
      forge: 'github',
    });
    expect(result.type).toBe('pr');
    if (result.type === 'pr') {
      expect(result.forge).toBe('github');
    }
  });

  it('parses files scope', () => {
    const result = gitScopeSchema.parse({
      type: 'files',
      paths: ['src/auth.ts', 'src/middleware.ts'],
    });
    if (result.type === 'files') {
      expect(result.paths).toHaveLength(2);
    }
  });

  it('rejects unknown scope type', () => {
    expect(() => gitScopeSchema.parse({ type: 'unknown' })).toThrow();
  });

  it('rejects branch scope without name', () => {
    expect(() => gitScopeSchema.parse({ type: 'branch' })).toThrow();
  });

  it('rejects pr scope with invalid url', () => {
    expect(() =>
      gitScopeSchema.parse({ type: 'pr', url: 'not-a-url', forge: 'github' }),
    ).toThrow();
  });

  it('rejects files scope with empty paths', () => {
    expect(() => gitScopeSchema.parse({ type: 'files', paths: [] })).toThrow();
  });

  it('rejects pr scope with invalid forge', () => {
    expect(() =>
      gitScopeSchema.parse({
        type: 'pr',
        url: 'https://github.com/org/repo/pull/42',
        forge: 'bitbucket',
      }),
    ).toThrow();
  });
});

describe('verdictEnum', () => {
  it('accepts valid verdicts', () => {
    for (const v of ['approve', 'request_changes', 'needs_discussion']) {
      expect(verdictEnum.parse(v)).toBe(v);
    }
  });

  it('rejects invalid verdict', () => {
    expect(() => verdictEnum.parse('reject')).toThrow();
  });
});
