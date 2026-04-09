import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ToolHandler } from '../types.js';

const MAX_RESULTS = 100;
const IGNORE = new Set(['node_modules', '.git', 'dist', '.codejury', 'coverage', '.turbo']);

function matchGlob(path: string, pattern: string): boolean {
  // Escape all regex-special characters EXCEPT * and ?, which are glob wildcards
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<GLOBSTAR>>/g, '.*');
  try {
    return new RegExp(`^${regex}$`).test(path);
  } catch {
    return false;
  }
}

async function walkDir(dir: string, base: string, results: string[], pattern: string): Promise<void> {
  if (results.length >= MAX_RESULTS) return;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const relPath = relative(base, fullPath);

      if (entry.isDirectory()) {
        await walkDir(fullPath, base, results, pattern);
      } else if (entry.isFile()) {
        if (matchGlob(relPath, pattern)) {
          results.push(relPath);
          if (results.length >= MAX_RESULTS) return;
        }
      }
    }
  } catch {
    // Permission errors, etc.
  }
}

export function searchFilesTool(repoPath: string): ToolHandler {
  return async (args) => {
    const pattern = args['pattern'] as string;
    const results: string[] = [];

    await walkDir(repoPath, repoPath, results, pattern);

    if (results.length === 0) return `No files matching "${pattern}"`;
    const output = results.join('\n');
    if (results.length >= MAX_RESULTS) {
      return output + `\n... (showing first ${MAX_RESULTS} results)`;
    }
    return output;
  };
}
