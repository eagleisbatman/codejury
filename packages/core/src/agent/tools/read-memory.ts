import type { ToolHandler } from '../types.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { MemoryType } from '../memory/memory-types.js';

export function readMemoryTool(memoryStore: MemoryStore): ToolHandler {
  return async (args) => {
    const type = args['type'] as MemoryType;
    if (!['codebase', 'patterns', 'calibration'].includes(type)) {
      return `Invalid memory type: "${type}". Valid: codebase, patterns, calibration`;
    }

    const data = await memoryStore.read(type);
    if (Object.keys(data).length === 0) {
      return `No ${type} memory exists yet. This is the first review.`;
    }
    return JSON.stringify(data, null, 2);
  };
}
