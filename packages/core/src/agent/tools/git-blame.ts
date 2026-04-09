import simpleGit from 'simple-git';
import { resolve, join } from 'node:path';
import type { ToolHandler } from '../types.js';

export function gitBlameTool(repoPath: string): ToolHandler {
  return async (args) => {
    const path = args['path'] as string;
    const startLine = args['start_line'] as number;
    const endLine = args['end_line'] as number;

    // Security: prevent path traversal
    const absPath = resolve(join(repoPath, path));
    if (!absPath.startsWith(resolve(repoPath))) {
      return `Error: path "${path}" escapes the repository root.`;
    }

    try {
      const git = simpleGit(repoPath);
      const result = await git.raw([
        'blame', '-L', `${startLine},${endLine}`, '--porcelain', path,
      ]);

      // Parse porcelain blame output into readable format
      const lines: string[] = [];
      const blameLines = result.split('\n');
      let currentAuthor = '';
      let currentDate = '';
      let currentCommit = '';

      for (const line of blameLines) {
        if (line.match(/^[0-9a-f]{40}/)) {
          currentCommit = line.slice(0, 8);
        } else if (line.startsWith('author ')) {
          currentAuthor = line.slice(7);
        } else if (line.startsWith('author-time ')) {
          const ts = parseInt(line.slice(12), 10);
          currentDate = new Date(ts * 1000).toISOString().slice(0, 10);
        } else if (line.startsWith('\t')) {
          lines.push(`${currentCommit} ${currentDate} ${currentAuthor.padEnd(15)} ${line.slice(1)}`);
        }
      }

      return lines.join('\n') || 'No blame data available';
    } catch (e) {
      return `Error running git blame: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
}
