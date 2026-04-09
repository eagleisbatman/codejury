import simpleGit from 'simple-git';
import type { ToolHandler } from '../types.js';
import { safePath } from './safe-path.js';

export function gitLogTool(repoPath: string): ToolHandler {
  return async (args) => {
    const path = args['path'] as string | undefined;
    const count = Math.min(Math.max(1, (args['count'] as number | undefined) ?? 10), 100);

    if (path) {
      const resolved = await safePath(repoPath, path);
      if (!resolved.ok) return `Error: ${resolved.error}`;
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
