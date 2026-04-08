import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, estimateTokenCount } from './prompt.js';
import type { ReviewPayload } from '../types/provider.js';

describe('buildSystemPrompt', () => {
  it('includes expert ID', () => {
    const prompt = buildSystemPrompt('claude');
    expect(prompt).toContain('"claude"');
  });

  it('includes finding schema', () => {
    const prompt = buildSystemPrompt('claude');
    expect(prompt).toContain('file_path');
    expect(prompt).toContain('severity');
    expect(prompt).toContain('JSON array');
  });

  it('includes focus areas', () => {
    const prompt = buildSystemPrompt('claude', { focusAreas: ['security', 'performance'] });
    expect(prompt).toContain('security, performance');
    expect(prompt).toContain('Focus especially on');
  });

  it('includes custom rules', () => {
    const prompt = buildSystemPrompt('claude', {
      customRules: ['No raw SQL', 'Max 50 lines per function'],
    });
    expect(prompt).toContain('No raw SQL');
    expect(prompt).toContain('Max 50 lines per function');
    expect(prompt).toContain('Project-specific review rules');
  });

  it('omits focus areas when empty', () => {
    const prompt = buildSystemPrompt('claude', { focusAreas: [] });
    expect(prompt).not.toContain('Focus especially on');
  });
});

describe('buildUserPrompt', () => {
  const payload: ReviewPayload = {
    files: [
      {
        path: 'src/api/queries.ts',
        language: 'typescript',
        hunks: [
          {
            startLine: 42,
            endLine: 50,
            content: '+const x = 1;\n-const y = 2;',
            context: { before: 'const db = getConnection();', after: 'return query;' },
          },
        ],
        additions: 1,
        deletions: 1,
      },
    ],
    repoName: 'my-api',
    branchName: 'feature/auth',
    directoryStructure: 'src/\nsrc/api/',
    totalAdditions: 1,
    totalDeletions: 1,
  };

  it('includes repo and branch info', () => {
    const prompt = buildUserPrompt(payload);
    expect(prompt).toContain('my-api');
    expect(prompt).toContain('feature/auth');
  });

  it('includes file path and language', () => {
    const prompt = buildUserPrompt(payload);
    expect(prompt).toContain('src/api/queries.ts');
    expect(prompt).toContain('typescript');
  });

  it('includes change counts', () => {
    const prompt = buildUserPrompt(payload);
    expect(prompt).toContain('1 additions');
    expect(prompt).toContain('1 deletions');
  });

  it('includes directory structure', () => {
    const prompt = buildUserPrompt(payload);
    expect(prompt).toContain('src/api/');
  });
});

describe('estimateTokenCount', () => {
  it('estimates roughly 1 token per 4 chars', () => {
    expect(estimateTokenCount('a'.repeat(400))).toBe(100);
  });

  it('rounds up', () => {
    expect(estimateTokenCount('abc')).toBe(1);
  });
});
