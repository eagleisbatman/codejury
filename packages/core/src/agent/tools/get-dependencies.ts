import { readFile } from 'node:fs/promises';
import type { ToolHandler } from '../types.js';
import { safePath } from './safe-path.js';

const IMPORT_PATTERNS = [
  /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g,
  /import\(['"]([^'"]+)['"]\)/g,
  /require\(['"]([^'"]+)['"]\)/g,
  /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm,
  /import\s+"([^"]+)"/g,
  /^use\s+([\w:]+)/gm,
];

export function getDependenciesTool(repoPath: string): ToolHandler {
  return async (args) => {
    const relPath = args['path'] as string;
    const resolved = await safePath(repoPath, relPath);
    if (!resolved.ok) return `Error: ${resolved.error}`;

    try {
      const content = await readFile(resolved.absPath, 'utf-8');
      const deps = new Set<string>();

      for (const pattern of IMPORT_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = regex.exec(content)) !== null) {
          const dep = match[1] ?? match[2];
          if (dep) deps.add(dep);
        }
      }

      if (deps.size === 0) return 'No imports/dependencies found.';
      return Array.from(deps).sort().join('\n');
    } catch (e) {
      return `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
}
