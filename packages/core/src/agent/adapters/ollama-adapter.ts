import { Ollama } from 'ollama';
import type { SDKAdapter, ToolDefinition, ToolResult, AdapterMessage, AdapterResponse } from '../types.js';
import { nanoid } from 'nanoid';

export class OllamaAdapter implements SDKAdapter {
  private client: Ollama;

  constructor(private model: string) {
    this.client = new Ollama();
  }

  formatTools(tools: ToolDefinition[]): unknown {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async sendRequest(
    messages: AdapterMessage[],
    tools: unknown,
    _maxTokens: number,
    signal?: AbortSignal,
  ): Promise<AdapterResponse> {
    // Ollama SDK does not support AbortSignal pass-through.
    // Check signal before the request as a best-effort cancellation.
    if (signal?.aborted) {
      return { stopReason: 'error', toolCalls: [], textContent: '', inputTokens: 0, outputTokens: 0, rawAssistantMessage: {} };
    }
    const ollamaMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as string,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }));

    const systemMsg = messages.find((m) => m.role === 'system');
    if (systemMsg) {
      ollamaMessages.unshift({
        role: 'system',
        content: typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content),
      });
    }

    const response = await this.client.chat({
      model: this.model,
      messages: ollamaMessages,
      tools: tools as Parameters<Ollama['chat']>[0]['tools'],
      stream: false,
    });

    const toolCalls = (response.message.tool_calls ?? []).map((tc) => ({
      id: nanoid(),
      name: tc.function.name,
      arguments: tc.function.arguments as Record<string, unknown>,
    }));

    const hasToolCalls = toolCalls.length > 0;

    return {
      stopReason: hasToolCalls ? 'tool_use' : 'end_turn',
      toolCalls,
      textContent: response.message.content,
      inputTokens: response.prompt_eval_count ?? 0,
      outputTokens: response.eval_count ?? 0,
      rawAssistantMessage: response.message,
    };
  }

  formatToolResults(rawAssistantMessage: unknown, results: ToolResult[]): AdapterMessage[] {
    // Ollama doesn't have a formal tool_result role — send as user message
    return [
      { role: 'assistant', content: rawAssistantMessage },
      {
        role: 'user',
        content: `Tool results:\n${results.map((r) => `[${r.name}]: ${r.content}`).join('\n\n')}`,
      },
    ];
  }

  formatInitialMessages(systemPrompt: string, userPrompt: string, memoryContext: string): AdapterMessage[] {
    const system = memoryContext ? `${systemPrompt}\n\n${memoryContext}` : systemPrompt;
    return [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ];
  }
}
