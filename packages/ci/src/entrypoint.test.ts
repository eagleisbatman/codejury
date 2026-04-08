import { describe, it, expect } from 'vitest';
import { entrypoint } from './entrypoint.js';

describe('CI entrypoint', () => {
  it('returns error for non-existent project', async () => {
    const result = await entrypoint({
      cwd: '/tmp/nonexistent-codejury-test',
      scope: { type: 'staged' },
      format: 'json',
    });
    // Should fail gracefully since there's no git repo or providers
    expect(result.exitCode).toBe(2);
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('accepts valid format options', async () => {
    // This tests that the entrypoint parses args without crashing
    // even when the actual review can't run (no git repo)
    const result = await entrypoint({
      cwd: '/tmp/nonexistent',
      scope: { type: 'staged' },
      format: 'sarif',
    });
    expect(result.exitCode).toBe(2);
  });

  it('accepts expert overrides', async () => {
    const result = await entrypoint({
      cwd: '/tmp/nonexistent',
      scope: { type: 'staged' },
      format: 'json',
      experts: ['claude'],
    });
    expect(result.exitCode).toBe(2);
  });
});
