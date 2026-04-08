import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const CLI_PATH = join(__dirname, '..', '..', 'dist', 'index.js');

function run(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (err.stdout ?? '') + (err.stderr ?? ''),
      exitCode: err.status ?? 1,
    };
  }
}

describe('CLI commands', () => {
  it('shows version', () => {
    const { stdout, exitCode } = run(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('0.1.0');
  });

  it('shows help', () => {
    const { stdout, exitCode } = run(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('CodeJury');
    expect(stdout).toContain('review');
    expect(stdout).toContain('init');
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('history');
    expect(stdout).toContain('config');
  });

  it('shows review help', () => {
    const { stdout, exitCode } = run(['review', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--branch');
    expect(stdout).toContain('--diff');
    expect(stdout).toContain('--pr');
    expect(stdout).toContain('--files');
    expect(stdout).toContain('--format');
    expect(stdout).toContain('--experts');
  });

  it('shows init help', () => {
    const { stdout, exitCode } = run(['init', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('--preset');
  });

  it('runs doctor', () => {
    const { stdout } = run(['doctor']);
    expect(stdout).toContain('Checking expert providers');
    expect(stdout).toContain('claude');
    expect(stdout).toContain('gemini');
    expect(stdout).toContain('openai');
    expect(stdout).toContain('ollama');
  });

  it('shows config help', () => {
    const { stdout, exitCode } = run(['config', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('get');
    expect(stdout).toContain('edit');
  });

  it('config get reads default value', () => {
    const { stdout } = run(['config', 'get', 'synthesis.strategy']);
    expect(stdout.trim()).toBe('full_panel');
  });

  it('config get reads nested value', () => {
    const { stdout } = run(['config', 'get', 'cost.budget_per_review']);
    expect(stdout.trim()).toBe('0.5');
  });

  it('history shows empty state gracefully', () => {
    const { stdout } = run(['history']);
    // Either shows table or "No review history" message
    expect(stdout.length).toBeGreaterThan(0);
  });
});
