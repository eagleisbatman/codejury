import { describe, it, expect } from 'vitest';
import { parsePrUrl, scopeToString } from './scope.js';

describe('parsePrUrl', () => {
  it('parses GitHub PR URL', () => {
    const result = parsePrUrl('https://github.com/acme/my-api/pull/42');
    expect(result).toEqual({ forge: 'github', owner: 'acme', repo: 'my-api', number: 42 });
  });

  it('parses GitLab MR URL', () => {
    const result = parsePrUrl('https://gitlab.com/acme/my-api/-/merge_requests/7');
    expect(result).toEqual({ forge: 'gitlab', owner: 'acme', repo: 'my-api', number: 7 });
  });

  it('returns null for non-PR URL', () => {
    expect(parsePrUrl('https://example.com')).toBeNull();
    expect(parsePrUrl('not a url')).toBeNull();
  });
});

describe('scopeToString', () => {
  it('formats staged scope', () => {
    expect(scopeToString({ type: 'staged' })).toBe('staged changes');
  });

  it('formats branch scope', () => {
    expect(scopeToString({ type: 'branch', name: 'feature/auth' })).toBe('branch feature/auth');
  });

  it('formats commit_range scope', () => {
    expect(scopeToString({ type: 'commit_range', from: 'abc', to: 'def' })).toBe('abc..def');
  });

  it('formats pr scope', () => {
    expect(
      scopeToString({
        type: 'pr',
        url: 'https://github.com/acme/my-api/pull/42',
        forge: 'github',
      }),
    ).toBe('PR #42 (github)');
  });

  it('formats files scope', () => {
    expect(
      scopeToString({ type: 'files', paths: ['src/a.ts', 'src/b.ts'] }),
    ).toBe('files: src/a.ts, src/b.ts');
  });
});
