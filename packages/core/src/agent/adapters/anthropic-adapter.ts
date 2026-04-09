import Anthropic from '@anthropic-ai/sdk';
import type { SDKAdapter, ToolDefinition, ToolResult, AdapterMessage, AdapterResponse } from '../types.js';

export class AnthropicAdapter implements SDKAdapter {
  private client: Anthropic;

  constructor(private model: string) {
    this.client = new Anthropic();
  }

  formatTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema,
    }));
  }

  async sendRequest(
    messages: AdapterMessage[],
    tools: unknown,
    maxTokens: number,
    signal?: AbortSignal,
  ): Promise<AdapterResponse> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const apiMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as Anthropic.MessageParam['content'] }));

    const requestOptions = signal ? { signal } : undefined;
    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: (systemMsg?.content as string) ?? '',
        messages: apiMessages,
        tools: tools as Anthropic.Tool[],
      }, requestOptions);
    } catch (e) {
      // Convert SDK errors into a safe AdapterResponse instead of throwing
      return {
        stopReason: 'error' as const,
        toolCalls: [],
        textContent: '',
        inputTokens: 0,
        outputTokens: 0,
        rawAssistantMessage: { error: e instanceof Error ? e.message : String(e) },
      };
    }

    const toolCalls = [];
    let textContent = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    const stopReason = response.stop_reason === 'tool_use' ? 'tool_use' as const
      : response.stop_reason === 'max_tokens' ? 'max_tokens' as const
      : 'end_turn' as const;

    return {
      stopReason,
      toolCalls,
      textContent,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      rawAssistantMessage: { role: 'assistant', content: response.content },
    };
  }

  formatToolResults(rawAssistantMessage: unknown, results: ToolResult[]): AdapterMessage[] {
    return [
      rawAssistantMessage as AdapterMessage,
      {
        role: 'user',
        content: results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolCallId,
          content: r.content,
          is_error: r.isError,
        })),
      },
    ];
  }

  formatInitialMessages(systemPrompt: string, userPrompt: string, memoryContext: string): AdapterMessage[] {
    const system = memoryContext
      ? `${systemPrompt}\n\n${memoryContext}`
      : systemPrompt;
    return [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ];
  }
}
