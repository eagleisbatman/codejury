import simpleGit from 'simple-git';
import { resolve, join } from 'node:path';
import type { ToolHandler } from '../types.js';

export function gitLogTool(repoPath: string): ToolHandler {
  return async (args) => {
    const path = args['path'] as string | undefined;
    const count = Math.min(Math.max(1, (args['count'] as number | undefined) ?? 10), 100);

    // Security: prevent path traversal if path is provided
    if (path) {
      const absPath = resolve(join(repoPath, path));
      if (!absPath.startsWith(resolve(repoPath))) {
        return `Error: path "${path}" escapes the repository root.`;
      }
    }

    try {
      const git = simpleGit(repoPath);
      const logArgs = ['-n', String(count), '--format=%h %ai %an | %s'];
      if (path) logArgs.push('--', path);

      const result = await git.raw(['log', ...logArgs]);
      return result.trim() || 'No commits found';
    } catch (e) {
      return `Error running git log: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
}
