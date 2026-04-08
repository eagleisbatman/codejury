import { describe, it, expect } from 'vitest';
import { projectConfigSchema, DEFAULT_CONFIG } from './config.js';

describe('projectConfigSchema', () => {
  it('parses an empty object with all defaults', () => {
    const config = projectConfigSchema.parse({});
    expect(config.project.default_branch).toBe('main');
    expect(config.experts.enabled).toEqual(['claude', 'gemini', 'ollama']);
    expect(config.synthesis.strategy).toBe('full_panel');
    expect(config.output.default_format).toBe('markdown');
    expect(config.cost.budget_per_review).toBe(0.5);
    expect(config.ci.fail_on_severity).toBe('critical');
  });

  it('overrides specific fields while keeping defaults', () => {
    const config = projectConfigSchema.parse({
      project: { name: 'my-api' },
      synthesis: { strategy: 'routed' },
      cost: { budget_per_review: 1.0 },
    });
    expect(config.project.name).toBe('my-api');
    expect(config.project.default_branch).toBe('main');
    expect(config.synthesis.strategy).toBe('routed');
    expect(config.cost.budget_per_review).toBe(1.0);
  });

  it('validates expert config', () => {
    const config = projectConfigSchema.parse({
      experts: {
        claude: {
          model: 'claude-opus-4-20250514',
          timeout: 180,
          focus: ['security'],
        },
      },
    });
    expect(config.experts.claude.model).toBe('claude-opus-4-20250514');
    expect(config.experts.claude.timeout).toBe(180);
    expect(config.experts.claude.focus).toEqual(['security']);
  });

  it('rejects invalid strategy', () => {
    expect(() =>
      projectConfigSchema.parse({
        synthesis: { strategy: 'invalid' },
      }),
    ).toThrow();
  });

  it('rejects invalid severity threshold', () => {
    expect(() =>
      projectConfigSchema.parse({
        output: { severity_threshold: 'fatal' },
      }),
    ).toThrow();
  });

  it('rejects negative budget', () => {
    expect(() =>
      projectConfigSchema.parse({
        cost: { budget_per_review: -1 },
      }),
    ).toThrow();
  });

  it('rejects invalid output format', () => {
    expect(() =>
      projectConfigSchema.parse({
        output: { default_format: 'xml' },
      }),
    ).toThrow();
  });

  it('rejects zero timeout', () => {
    expect(() =>
      projectConfigSchema.parse({
        experts: { claude: { model: 'test', timeout: 0 } },
      }),
    ).toThrow();
  });
});

describe('DEFAULT_CONFIG', () => {
  it('matches empty parse output', () => {
    const parsed = projectConfigSchema.parse({});
    expect(DEFAULT_CONFIG).toEqual(parsed);
  });
});
