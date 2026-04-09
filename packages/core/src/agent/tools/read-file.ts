import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ToolHandler } from '../types.js';

const MAX_LINES = 500;

export function readFileTool(repoPath: string): ToolHandler {
  return async (args) => {
    const relPath = args['path'] as string;
    const absPath = resolve(join(repoPath, relPath));

    // Security: prevent path traversal
    if (!absPath.startsWith(resolve(repoPath))) {
      return `Error: path "${relPath}" escapes the repository root.`;
    }

    try {
      const content = await readFile(absPath, 'utf-8');
      const lines = content.split('\n');
      const startLine = (args['start_line'] as number | undefined) ?? 1;
      const endLine = (args['end_line'] as number | undefined) ?? lines.length;

      const start = Math.max(1, startLine) - 1;
      const end = Math.min(lines.length, endLine);
      const slice = lines.slice(start, end);

      if (slice.length > MAX_LINES) {
        const truncated = slice.slice(0, MAX_LINES);
        return truncated.map((l, i) => `${start + i + 1}\t${l}`).join('\n') +
          `\n... (truncated, showing ${MAX_LINES} of ${slice.length} lines)`;
      }

      return slice.map((l, i) => `${start + i + 1}\t${l}`).join('\n');
    } catch (e) {
      return `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
}
