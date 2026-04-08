import { describe, it, expect } from 'vitest';
import { parseConfigString } from './loader.js';
import { isOk, isErr } from '../types/result.js';

describe('parseConfigString', () => {
  it('parses a minimal config', () => {
    const result = parseConfigString(`
[project]
name = "my-api"
`);
    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.project.name).toBe('my-api');
      expect(result.value.project.default_branch).toBe('main');
    }
  });

  it('parses a full config', () => {
    const result = parseConfigString(`
[project]
name = "my-api"
default_branch = "develop"

[experts]
enabled = ["claude", "ollama"]

[experts.claude]
model = "claude-opus-4-20250514"
timeout = 180
focus = ["security"]

[experts.ollama]
model = "deepseek-coder:6.7b"
timeout = 30

[synthesis]
strategy = "cascading"
synthesizer = "claude"
dedup_threshold = 0.8

[output]
default_format = "json"
severity_threshold = "warning"

[cost]
budget_per_review = 1.00
budget_monthly = 50
prefer_free_tier = false

[rules]
custom_rules = [
  "Flag any hardcoded secrets",
  "Warn about functions exceeding 50 lines"
]

[ci]
fail_on_severity = "error"
max_review_time_seconds = 600
`);
    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.project.name).toBe('my-api');
      expect(result.value.project.default_branch).toBe('develop');
      expect(result.value.experts.enabled).toEqual(['claude', 'ollama']);
      expect(result.value.experts.claude.model).toBe('claude-opus-4-20250514');
      expect(result.value.synthesis.strategy).toBe('cascading');
      expect(result.value.output.default_format).toBe('json');
      expect(result.value.output.severity_threshold).toBe('warning');
      expect(result.value.cost.budget_per_review).toBe(1.0);
      expect(result.value.rules.custom_rules).toHaveLength(2);
      expect(result.value.ci.fail_on_severity).toBe('error');
    }
  });

  it('fills defaults for missing sections', () => {
    const result = parseConfigString('');
    expect(isOk(result)).toBe(true);
    if (result.ok) {
      expect(result.value.synthesis.strategy).toBe('full_panel');
      expect(result.value.cost.budget_per_review).toBe(0.5);
      expect(result.value.experts.claude.model).toBe('claude-sonnet-4-20250514');
    }
  });

  it('rejects invalid TOML syntax', () => {
    const result = parseConfigString('[invalid\nbroken = ');
    expect(isErr(result)).toBe(true);
  });

  it('rejects invalid config values', () => {
    const result = parseConfigString(`
[synthesis]
strategy = "invalid_strategy"
`);
    expect(isErr(result)).toBe(true);
  });

  it('rejects negative budget', () => {
    const result = parseConfigString(`
[cost]
budget_per_review = -5
`);
    expect(isErr(result)).toBe(true);
  });
});
