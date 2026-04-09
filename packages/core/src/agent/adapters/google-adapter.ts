import { GoogleGenAI } from '@google/genai';
import type { SDKAdapter, ToolDefinition, ToolResult, AdapterMessage, AdapterResponse } from '../types.js';
import { nanoid } from 'nanoid';

export class GoogleAdapter implements SDKAdapter {
  private client: GoogleGenAI;

  constructor(private model: string) {
    const apiKey = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'] ?? '';
    this.client = new GoogleGenAI({ apiKey });
  }

  formatTools(tools: ToolDefinition[]): unknown {
    return [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    }];
  }

  async sendRequest(
    messages: AdapterMessage[],
    tools: unknown,
    maxTokens: number,
    _signal?: AbortSignal,
  ): Promise<AdapterResponse> {
    const systemMsg = messages.find((m) => m.role === 'system');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: typeof m.content === 'string'
          ? [{ text: m.content }]
          : Array.isArray(m.content)
            ? m.content as Array<Record<string, unknown>>
            : [{ text: JSON.stringify(m.content) }],
      }));

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        maxOutputTokens: maxTokens,
        systemInstruction: systemMsg ? String(systemMsg.content) : undefined,
        tools: tools as Array<Record<string, unknown>>,
      },
    });

    const toolCalls = [];
    let textContent = '';

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if ('text' in part && part.text) {
          textContent += part.text;
        }
        if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: nanoid(),
            name: part.functionCall.name ?? '',
            arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    const hasToolCalls = toolCalls.length > 0;
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      stopReason: hasToolCalls ? 'tool_use' : 'end_turn',
      toolCalls,
      textContent,
      inputTokens,
      outputTokens,
      rawAssistantMessage: response.candidates?.[0]?.content ?? { parts: [] },
    };
  }

  formatToolResults(rawAssistantMessage: unknown, results: ToolResult[]): AdapterMessage[] {
    return [
      { role: 'assistant', content: rawAssistantMessage },
      {
        role: 'user',
        content: results.map((r) => ({
          functionResponse: { name: r.name, response: { content: r.content } },
        })),
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
