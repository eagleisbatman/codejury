import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAgentLoop } from './agent-loop.js';
import { ToolExecutor } from './tools/tool-executor.js';
import { MemoryStore } from './memory/memory-store.js';
import type { SDKAdapter, AdapterMessage, AdapterResponse, AgentEvent, AgentLoopConfig, ToolResult, ToolDefinition } from './types.js';

// Mock SDK adapter that simulates a model making tool calls then finishing
class MockAdapter implements SDKAdapter {
  private callIndex = 0;
  private responses: Array<Partial<AdapterResponse>>;

  constructor(responses: Array<Partial<AdapterResponse>>) {
    this.responses = responses;
  }

  formatTools(tools: ToolDefinition[]): unknown { return tools; }

  async sendRequest(): Promise<AdapterResponse> {
    const resp = this.responses[this.callIndex] ?? { stopReason: 'end_turn', toolCalls: [], textContent: '', inputTokens: 100, outputTokens: 50, rawAssistantMessage: '' };
    this.callIndex++;
    return {
      stopReason: 'end_turn',
      toolCalls: [],
      textContent: '',
      inputTokens: 100,
      outputTokens: 50,
      rawAssistantMessage: '',
      ...resp,
    };
  }

  formatToolResults(raw: unknown, results: ToolResult[]): AdapterMessage[] {
    return [
      { role: 'assistant', content: raw },
      { role: 'user', content: results.map((r) => r.content).join('\n') },
    ];
  }

  formatInitialMessages(sys: string, user: string, mem: string): AdapterMessage[] {
    return [
      { role: 'system', content: `${sys}\n${mem}` },
      { role: 'user', content: user },
    ];
  }
}

let repoPath: string;

beforeEach(() => {
  repoPath = mkdtempSync(join(tmpdir(), 'cj-loop-'));
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  writeFileSync(join(repoPath, 'src', 'app.ts'), 'export const x = 1;\n');
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com',
  };
  execFileSync('git', ['init'], { cwd: repoPath, stdio: 'pipe', env: gitEnv });
  execFileSync('git', ['add', '-A'], { cwd: repoPath, stdio: 'pipe', env: gitEnv });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: repoPath, stdio: 'pipe', env: gitEnv });
});

afterEach(() => {
  rmSync(repoPath, { recursive: true, force: true });
});

function makeConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    maxIterations: 5,
    maxTokens: 4096,
    contextWindowSize: 100_000,
    contextResetThreshold: 0.8,
    expertId: 'test-expert',
    model: 'test-model',
    repoPath,
    memoryDir: join(repoPath, '.memory'),
    ...overrides,
  };
}

describe('runAgentLoop', () => {
  it('completes immediately when model returns end_turn', async () => {
    const adapter = new MockAdapter([
      { stopReason: 'end_turn', textContent: 'No issues found.' },
    ]);
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const toolExecutor = new ToolExecutor(repoPath, memoryStore, 'test-expert');

    const events: AgentEvent[] = [];
    const gen = runAgentLoop(adapter, toolExecutor, memoryStore, makeConfig(), 'You are a reviewer', 'Review this code');

    let result = await gen.next();
    while (!result.done) {
      events.push(result.value);
      result = await gen.next();
    }

    expect(result.value.findings).toHaveLength(0);
    expect(result.value.iterations).toBe(1);
    expect(events.some((e) => e.type === 'agent_iteration')).toBe(true);
  });

  it('handles tool calls then completes', async () => {
    const adapter = new MockAdapter([
      // Turn 1: model calls list_directory
      {
        stopReason: 'tool_use',
        toolCalls: [{ id: 'tc1', name: 'list_directory', arguments: {} }],
        textContent: 'Let me explore the project structure.',
      },
      // Turn 2: model calls read_file
      {
        stopReason: 'tool_use',
        toolCalls: [{ id: 'tc2', name: 'read_file', arguments: { path: 'src/app.ts' } }],
        textContent: 'Found src/ directory. Let me read the main file.',
      },
      // Turn 3: model is done
      {
        stopReason: 'end_turn',
        textContent: 'Code looks clean.',
      },
    ]);
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const toolExecutor = new ToolExecutor(repoPath, memoryStore, 'test-expert');

    const events: AgentEvent[] = [];
    const gen = runAgentLoop(adapter, toolExecutor, memoryStore, makeConfig(), 'Review', 'Diff here');

    let result = await gen.next();
    while (!result.done) {
      events.push(result.value);
      result = await gen.next();
    }

    expect(result.value.iterations).toBe(3);
    expect(result.value.toolCallCount).toBe(2);
    expect(events.filter((e) => e.type === 'agent_tool_call')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'agent_tool_result')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'agent_thinking')).toHaveLength(3);
  });

  it('yields findings when model calls report_finding', async () => {
    const adapter = new MockAdapter([
      {
        stopReason: 'tool_use',
        toolCalls: [{
          id: 'tc1',
          name: 'report_finding',
          arguments: {
            file_path: 'src/app.ts',
            line_start: 1,
            line_end: 1,
            severity: 'info',
            category: 'style',
            title: 'Unused export',
            description: 'The export x is never used externally.',
            confidence: 0.6,
          },
        }],
      },
      { stopReason: 'end_turn', textContent: 'REVIEW COMPLETE' },
    ]);
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const toolExecutor = new ToolExecutor(repoPath, memoryStore, 'test-expert');

    const events: AgentEvent[] = [];
    const gen = runAgentLoop(adapter, toolExecutor, memoryStore, makeConfig(), 'Review', 'Diff');

    let result = await gen.next();
    while (!result.done) {
      events.push(result.value);
      result = await gen.next();
    }

    expect(result.value.findings).toHaveLength(1);
    expect(result.value.findings[0]!.title).toBe('Unused export');
    expect(events.filter((e) => e.type === 'agent_finding')).toHaveLength(1);
  });

  it('respects maxIterations', async () => {
    // Model always wants to use tools — loop should stop at max
    const adapter = new MockAdapter(
      Array.from({ length: 20 }, () => ({
        stopReason: 'tool_use' as const,
        toolCalls: [{ id: 'tc', name: 'list_directory', arguments: {} }],
      })),
    );
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const toolExecutor = new ToolExecutor(repoPath, memoryStore, 'test-expert');

    const gen = runAgentLoop(adapter, toolExecutor, memoryStore, makeConfig({ maxIterations: 3 }), 'Review', 'Diff');

    let result = await gen.next();
    while (!result.done) result = await gen.next();

    expect(result.value.iterations).toBeLessThanOrEqual(3);
  });

  it('extracts findings from final text as fallback', async () => {
    const jsonFindings = JSON.stringify([{
      id: 'F001',
      file_path: 'src/app.ts',
      line_start: 1,
      line_end: 1,
      severity: 'warning',
      category: 'style',
      title: 'Missing semicolon',
      description: 'Add semicolon',
      suggested_fix: null,
      expert_id: 'test-expert',
      confidence: 0.7,
    }]);

    const adapter = new MockAdapter([
      { stopReason: 'end_turn', textContent: jsonFindings },
    ]);
    const memoryStore = new MemoryStore(join(repoPath, '.memory'));
    const toolExecutor = new ToolExecutor(repoPath, memoryStore, 'test-expert');

    const gen = runAgentLoop(adapter, toolExecutor, memoryStore, makeConfig(), 'Review', 'Diff');
    let result = await gen.next();
    while (!result.done) result = await gen.next();

    expect(result.value.findings).toHaveLength(1);
    expect(result.value.findings[0]!.title).toBe('Missing semicolon');
  });
});
