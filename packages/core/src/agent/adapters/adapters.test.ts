// Set dummy keys before SDK imports (SDKs validate on construction)
process.env['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'] ?? 'test-dummy-key';
process.env['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'] ?? 'test-dummy-key';

import { describe, it, expect } from 'vitest';
import { AnthropicAdapter } from './anthropic-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GoogleAdapter } from './google-adapter.js';
import { OllamaAdapter } from './ollama-adapter.js';
import type { ToolDefinition, ToolResult } from '../types.js';
import { TOOL_DEFINITIONS } from '../tools/tool-definitions.js';

const SAMPLE_TOOLS: ToolDefinition[] = [TOOL_DEFINITIONS[0]!, TOOL_DEFINITIONS[7]!];

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter('claude-sonnet-4-20250514');

  it('formats tools with input_schema', () => {
    const formatted = adapter.formatTools(SAMPLE_TOOLS) as Array<{ name: string; input_schema: unknown }>;
    expect(formatted).toHaveLength(2);
    expect(formatted[0]!.name).toBe('read_file');
    expect((formatted[0]!.input_schema as { type: string }).type).toBe('object');
  });

  it('formats initial messages with system + user + memory', () => {
    const msgs = adapter.formatInitialMessages('System', 'User', 'Memory');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect((msgs[0]!.content as string)).toContain('System');
    expect((msgs[0]!.content as string)).toContain('Memory');
    expect(msgs[1]!.role).toBe('user');
  });

  it('formats tool results as tool_result blocks', () => {
    const raw = { role: 'assistant', content: [{ type: 'tool_use', id: 'tc1', name: 'read_file', input: {} }] };
    const results: ToolResult[] = [{ toolCallId: 'tc1', name: 'read_file', content: 'file data', isError: false }];
    const formatted = adapter.formatToolResults(raw, results);
    expect(formatted).toHaveLength(2);
    expect(formatted[1]!.role).toBe('user');
  });
});

describe('OpenAIAdapter', () => {
  const adapter = new OpenAIAdapter('gpt-4.1');

  it('formats tools as function type', () => {
    const formatted = adapter.formatTools(SAMPLE_TOOLS) as Array<{ type: string; function: { name: string } }>;
    expect(formatted).toHaveLength(2);
    expect(formatted[0]!.type).toBe('function');
    expect(formatted[0]!.function.name).toBe('read_file');
  });

  it('formats initial messages', () => {
    const msgs = adapter.formatInitialMessages('S', 'U', 'M');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.role).toBe('user');
  });

  it('formats tool results with assistant + tool roles', () => {
    const raw = { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'grep', arguments: '{}' } }] };
    const results: ToolResult[] = [{ toolCallId: 'tc1', name: 'grep', content: 'match', isError: false }];
    const formatted = adapter.formatToolResults(raw, results);
    expect(formatted.length).toBeGreaterThanOrEqual(2);
    expect(formatted[0]!.role).toBe('assistant');
  });
});

describe('GoogleAdapter', () => {
  const adapter = new GoogleAdapter('gemini-2.5-pro');

  it('formats tools as functionDeclarations', () => {
    const formatted = adapter.formatTools(SAMPLE_TOOLS) as Array<{ functionDeclarations: Array<{ name: string }> }>;
    expect(formatted).toHaveLength(1);
    expect(formatted[0]!.functionDeclarations).toHaveLength(2);
  });

  it('formats initial messages', () => {
    const msgs = adapter.formatInitialMessages('S', 'U', '');
    expect(msgs).toHaveLength(2);
  });

  it('formats tool results with functionResponse', () => {
    const results: ToolResult[] = [{ toolCallId: 'tc1', name: 'read_file', content: 'data', isError: false }];
    const formatted = adapter.formatToolResults({}, results);
    expect(formatted).toHaveLength(2);
    const content = formatted[1]!.content as Array<{ functionResponse: { name: string } }>;
    expect(content[0]!.functionResponse.name).toBe('read_file');
  });
});

describe('OllamaAdapter', () => {
  const adapter = new OllamaAdapter('qwen2.5-coder:32b');

  it('formats tools as function type', () => {
    const formatted = adapter.formatTools(SAMPLE_TOOLS) as Array<{ type: string; function: { name: string } }>;
    expect(formatted).toHaveLength(2);
    expect(formatted[0]!.type).toBe('function');
  });

  it('formats tool results as user message text', () => {
    const results: ToolResult[] = [{ toolCallId: 'tc1', name: 'grep', content: 'line 5: match', isError: false }];
    const formatted = adapter.formatToolResults({}, results);
    expect(formatted).toHaveLength(2);
    expect(formatted[1]!.role).toBe('user');
    expect((formatted[1]!.content as string)).toContain('grep');
  });
});
