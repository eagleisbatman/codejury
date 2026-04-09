import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ToolHandler } from '../types.js';

const MAX_ENTRIES = 200;

export function listDirectoryTool(repoPath: string): ToolHandler {
  return async (args) => {
    const relPath = (args['path'] as string | undefined) ?? '.';
    const absPath = resolve(join(repoPath, relPath));

    if (!absPath.startsWith(resolve(repoPath))) {
      return 'Error: path escapes repository root.';
    }

    try {
      const entries = await readdir(absPath, { withFileTypes: true });
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      const lines = sorted.slice(0, MAX_ENTRIES).map((e) => {
        const indicator = e.isDirectory() ? '/' : '';
        return `${e.name}${indicator}`;
      });

      if (sorted.length > MAX_ENTRIES) {
        lines.push(`... (${sorted.length - MAX_ENTRIES} more entries)`);
      }

      return lines.join('\n');
    } catch (e) {
      return `Error listing directory: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
}
