import type { ToolHandler } from '../types.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { MemoryType } from '../memory/memory-types.js';

export function writeMemoryTool(memoryStore: MemoryStore): ToolHandler {
  return async (args) => {
    const type = args['type'] as MemoryType;
    if (!['codebase', 'patterns', 'calibration'].includes(type)) {
      return `Invalid memory type: "${type}". Valid: codebase, patterns, calibration`;
    }

    const contentStr = args['content'] as string;
    let content: Record<string, unknown>;
    try {
      content = JSON.parse(contentStr);
    } catch {
      return `Error: content must be valid JSON. Got: ${contentStr.slice(0, 100)}`;
    }

    memoryStore.queueWrite(type, content);
    return `Queued write to ${type} memory. Will be saved when review completes.`;
  };
}
