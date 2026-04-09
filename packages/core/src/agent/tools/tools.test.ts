import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFileTool } from './read-file.js';
import { searchFilesTool } from './search-files.js';
import { grepTool } from './grep.js';
import { listDirectoryTool } from './list-directory.js';
import { getDependenciesTool } from './get-dependencies.js';
import { reportFindingTool } from './report-finding.js';
import { ToolExecutor } from './tool-executor.js';
import { MemoryStore } from '../memory/memory-store.js';
import type { Finding } from '../../types/finding.js';

let repoPath: string;

beforeEach(() => {
  repoPath = mkdtempSync(join(tmpdir(), 'cj-tools-'));
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'src', 'index.ts'), `import { foo } from './foo.js';
import { bar } from 'external-lib';

export function main() {
  const result = foo() + bar();
  console.log(result);
  return result;
}
`);
  writeFileSync(join(repoPath, 'src', 'foo.ts'), `export function foo() {
  return 42;
}
`);
  writeFileSync(join(repoPath, 'package.json'), '{"name": "test"}');

  // Init git repo for git tools
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@test.com',
  };
  execFileSync('git', ['init'], { cwd: repoPath, stdio: 'pipe', env: gitEnv });
  execFileSync('git', ['add', '-A'], { cwd: repoPath, stdio: 'pipe', env: gitEnv });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoPath, stdio: 'pipe', env: gitEnv });
});

afterEach(() => {
  rmSync(repoPath, { recursive: true, force: true });
});

describe('read_file', () => {
  it('reads a file with line numbers', async () => {
    const tool = readFileTool(repoPath);
    const result = await tool({ path: 'src/index.ts' });
    expect(result).toContain('1\timport');
    expect(result).toContain('export function main');
  });

  it('reads a line range', async () => {
    const tool = readFileTool(repoPath);
    const result = await tool({ path: 'src/index.ts', start_line: 4, end_line: 6 });
    expect(result).toContain('4\t');
    expect(result).toContain('main');
    expect(result).not.toContain('1\t');
  });

  it('rejects path traversal', async () => {
    const tool = readFileTool(repoPath);
    const result = await tool({ path: '../../etc/passwd' });
    expect(result).toContain('escapes');
  });
});

describe('search_files', () => {
  it('finds files matching pattern', async () => {
    const tool = searchFilesTool(repoPath);
    const result = await tool({ pattern: 'src/*.ts' });
    expect(result).toContain('src/index.ts');
    expect(result).toContain('src/foo.ts');
  });

  it('returns no match message', async () => {
    const tool = searchFilesTool(repoPath);
    const result = await tool({ pattern: '*.xyz' });
    expect(result).toContain('No files');
  });
});

describe('grep', () => {
  it('finds matching lines', async () => {
    const tool = grepTool(repoPath);
    const result = await tool({ pattern: 'function' });
    expect(result).toContain('src/index.ts');
    expect(result).toContain('function main');
  });

  it('scopes to a directory', async () => {
    const tool = grepTool(repoPath);
    const result = await tool({ pattern: 'function', path: 'src' });
    expect(result).toContain('src/index.ts');
  });

  it('handles no matches', async () => {
    const tool = grepTool(repoPath);
    const result = await tool({ pattern: 'nonexistent_string_xyz' });
    expect(result).toContain('No matches');
  });
});

describe('list_directory', () => {
  it('lists repo root', async () => {
    const tool = listDirectoryTool(repoPath);
    const result = await tool({});
    expect(result).toContain('src/');
    expect(result).toContain('package.json');
  });

  it('lists subdirectory', async () => {
    const tool = listDirectoryTool(repoPath);
    const result = await tool({ path: 'src' });
    expect(result).toContain('index.ts');
    expect(result).toContain('foo.ts');
  });
});

describe('get_dependencies', () => {
  it('extracts imports', async () => {
    const tool = getDependenciesTool(repoPath);
    const result = await tool({ path: 'src/index.ts' });
    expect(result).toContain('./foo.js');
    expect(result).toContain('external-lib');
  });
});

describe('report_finding', () => {
  it('validates and stores a finding', async () => {
    const findings: Finding[] = [];
    const tool = reportFindingTool(findings, 'test-expert');
    const result = await tool({
      file_path: 'src/index.ts',
      line_start: 5,
      line_end: 7,
      severity: 'warning',
      category: 'correctness',
      title: 'Console.log in production code',
      description: 'Remove debug logging',
      confidence: 0.8,
    });
    expect(result).toContain('Finding reported');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.expert_id).toBe('test-expert');
  });

  it('rejects invalid severity', async () => {
    const findings: Finding[] = [];
    const tool = reportFindingTool(findings, 'test');
    const result = await tool({
      file_path: 'a.ts',
      line_start: 1,
      line_end: 1,
      severity: 'fatal',
      category: 'security',
      title: 'Bad',
      description: 'Bad thing',
      confidence: 0.5,
    });
    expect(result).toContain('Validation error');
    expect(findings).toHaveLength(0);
  });
});

describe('ToolExecutor', () => {
  it('dispatches to correct tool', async () => {
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const executor = new ToolExecutor(repoPath, memoryStore, 'test');
    const result = await executor.execute('call-1', 'list_directory', {});
    expect(result.isError).toBe(false);
    expect(result.content).toContain('src/');
  });

  it('returns error for unknown tool', async () => {
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const executor = new ToolExecutor(repoPath, memoryStore, 'test');
    const result = await executor.execute('call-1', 'nonexistent', {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unknown tool');
  });

  it('collects findings from report_finding', async () => {
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const executor = new ToolExecutor(repoPath, memoryStore, 'test');
    await executor.execute('call-1', 'report_finding', {
      file_path: 'src/index.ts',
      line_start: 1,
      line_end: 1,
      severity: 'info',
      category: 'style',
      title: 'Test finding',
      description: 'Test',
      confidence: 0.5,
    });
    expect(executor.getFindings()).toHaveLength(1);
  });
});
