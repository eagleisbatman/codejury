import OpenAI from 'openai';
import type { SDKAdapter, ToolDefinition, ToolResult, AdapterMessage, AdapterResponse } from '../types.js';
export class OpenAIAdapter implements SDKAdapter {
  private client: OpenAI;

  constructor(private model: string) {
    this.client = new OpenAI();
  }

  formatTools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
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
    maxTokens: number,
    signal?: AbortSignal,
  ): Promise<AdapterResponse> {
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map((m) => {
      if (m.role === 'tool' && typeof m.content === 'object' && m.content !== null) {
        const obj = m.content as Record<string, unknown>;
        return {
          role: 'tool' as const,
          content: typeof obj['content'] === 'string' ? obj['content'] : JSON.stringify(obj['content']),
          tool_call_id: (obj['tool_call_id'] as string) ?? '',
        };
      }
      if (m.role === 'assistant' && typeof m.content === 'object' && m.content !== null) {
        // Pass through raw assistant messages (they contain tool_calls)
        return m.content as unknown as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
      }
      return {
        role: m.role as 'system' | 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      };
    });

    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: maxTokens,
        messages: apiMessages,
        tools: tools as OpenAI.Chat.Completions.ChatCompletionTool[],
      }, signal ? { signal } : undefined);
    } catch (e) {
      return {
        stopReason: 'error' as const, toolCalls: [], textContent: '',
        inputTokens: 0, outputTokens: 0,
        rawAssistantMessage: { error: e instanceof Error ? e.message : String(e) },
      };
    }

    const choice = response.choices[0];
    const message = choice?.message;
    const rawToolCalls = message?.tool_calls ?? [];
    const toolCalls = rawToolCalls.map((tc) => {
      // Access via Record to handle different OpenAI SDK versions
      const obj = tc as unknown as Record<string, unknown>;
      const fn = obj['function'] as { name: string; arguments: string } | undefined;
      return {
        id: (obj['id'] as string) ?? '',
        name: fn?.name ?? '',
        arguments: JSON.parse(fn?.arguments ?? '{}') as Record<string, unknown>,
      };
    });

    const stopReason = choice?.finish_reason === 'tool_calls' ? 'tool_use' as const
      : choice?.finish_reason === 'length' ? 'max_tokens' as const
      : 'end_turn' as const;

    return {
      stopReason,
      toolCalls,
      textContent: message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      rawAssistantMessage: message,
    };
  }

  formatToolResults(rawAssistantMessage: unknown, results: ToolResult[]): AdapterMessage[] {
    return [
      { role: 'assistant', content: rawAssistantMessage },
      ...results.map((r) => ({
        role: 'tool' as const,
        content: { tool_call_id: r.toolCallId, content: r.content },
      })),
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
