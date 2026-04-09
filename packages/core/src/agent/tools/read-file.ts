import { readFile } from 'node:fs/promises';
import type { ToolHandler } from '../types.js';
import { safePath } from './safe-path.js';

const MAX_LINES = 500;

export function readFileTool(repoPath: string): ToolHandler {
  return async (args) => {
    const relPath = args['path'] as string;
    const resolved = await safePath(repoPath, relPath);
    if (!resolved.ok) return `Error: ${resolved.error}`;

    try {
      const content = await readFile(resolved.absPath, 'utf-8');
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
