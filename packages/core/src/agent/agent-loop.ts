import type {
  SDKAdapter,
  AgentLoopConfig,
  AgentEvent,
  AgentLoopResult,
  AdapterMessage,
} from './types.js';
import { ToolExecutor } from './tools/tool-executor.js';
import { MemoryStore } from './memory/memory-store.js';
import { TOOL_DEFINITIONS } from './tools/tool-definitions.js';
import { extractFindings } from '../providers/parser.js';
import { shouldResetContext, buildSummarizeRequest, estimateMessagesTokens } from './context-manager.js';

export async function* runAgentLoop(
  adapter: SDKAdapter,
  toolExecutor: ToolExecutor,
  memoryStore: MemoryStore,
  config: AgentLoopConfig,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent, AgentLoopResult, undefined> {
  // Read project memory
  const memoryContext = await memoryStore.readAll();

  // Initialize messages
  let messages = adapter.formatInitialMessages(systemPrompt, userPrompt, memoryContext);
  const formattedTools = adapter.formatTools(TOOL_DEFINITIONS);

  // Token tracking (cumulative for cost reporting)
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;
  let iteration = 0;

  for (iteration = 1; iteration <= config.maxIterations; iteration++) {
    // Check abort signal
    if (signal?.aborted) break;

    yield {
      type: 'agent_iteration',
      expertId: config.expertId,
      iteration,
      findingsSoFar: toolExecutor.getFindings().length,
    };

    // Context budget check — estimate CURRENT conversation size, not cumulative
    const currentTokens = estimateMessagesTokens(messages as Array<{ content: unknown }>);
    if (shouldResetContext({
      currentConversationTokens: currentTokens,
      contextWindowSize: config.contextWindowSize,
      resetThreshold: config.contextResetThreshold,
    })) {
      yield {
        type: 'agent_context_reset',
        expertId: config.expertId,
        reason: 'context_budget',
        iteration,
      };

      const findings = toolExecutor.getFindings();
      const summarizeMsg = buildSummarizeRequest(
        findings.map((f) => ({ title: f.title, severity: f.severity })),
        iteration,
      );

      // Reset messages — fresh conversation with summary
      messages = adapter.formatInitialMessages(systemPrompt, summarizeMsg, memoryContext);
    }

    // Check abort signal before sending request
    if (signal?.aborted) break;

    // Send to model
    const response = await adapter.sendRequest(messages, formattedTools, config.maxTokens, signal);
    totalInputTokens += response.inputTokens;
    totalOutputTokens += response.outputTokens;

    // Yield thinking text
    if (response.textContent.trim()) {
      yield {
        type: 'agent_thinking',
        expertId: config.expertId,
        text: response.textContent,
        iteration,
      };
    }

    // Handle tool calls
    if (response.stopReason === 'tool_use' && response.toolCalls.length > 0) {
      const toolResults = [];

      for (const call of response.toolCalls) {
        if (signal?.aborted) break;
        totalToolCalls++;

        yield {
          type: 'agent_tool_call',
          expertId: config.expertId,
          toolName: call.name,
          params: call.arguments,
          iteration,
        };

        const result = await toolExecutor.execute(call.id, call.name, call.arguments);
        toolResults.push(result);

        // If report_finding, yield the finding event
        if (call.name === 'report_finding' && !result.isError) {
          const latestFinding = toolExecutor.getFindings().at(-1);
          if (latestFinding) {
            yield {
              type: 'agent_finding',
              expertId: config.expertId,
              finding: latestFinding,
              iteration,
            };
          }
        }

        const summary = result.content.length > 200
          ? result.content.slice(0, 200) + '…'
          : result.content;
        yield {
          type: 'agent_tool_result',
          expertId: config.expertId,
          toolName: call.name,
          resultSummary: summary,
          iteration,
        };
      }

      // Add assistant message + tool results to history
      const toolResultMessages = adapter.formatToolResults(response.rawAssistantMessage, toolResults);
      messages.push(...toolResultMessages);
      continue;
    }

    // Model said done
    if (response.stopReason === 'end_turn') {
      if (response.textContent.trim()) {
        const { findings } = extractFindings(response.textContent, config.expertId);
        for (const f of findings) {
          if (!toolExecutor.hasFinding(f)) {
            toolExecutor.addFinding(f);
            yield {
              type: 'agent_finding',
              expertId: config.expertId,
              finding: f,
              iteration,
            };
          }
        }
      }
      break;
    }

    // Max tokens — model ran out of space mid-response
    if (response.stopReason === 'max_tokens') {
      const continueMsg: AdapterMessage = { role: 'user', content: 'Continue. If you have more findings, call report_finding.' };
      messages.push({ role: 'assistant', content: response.rawAssistantMessage });
      messages.push(continueMsg);
      continue;
    }

    // Error — stop the loop
    if (response.stopReason === 'error') {
      break;
    }
  }

  // Flush memory
  await memoryStore.flush();

  return {
    findings: toolExecutor.getFindings(),
    totalInputTokens,
    totalOutputTokens,
    iterations: Math.min(iteration, config.maxIterations),
    toolCallCount: totalToolCalls,
  };
}
