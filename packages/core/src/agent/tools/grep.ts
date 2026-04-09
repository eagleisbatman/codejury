import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import type { ToolHandler } from '../types.js';

const MAX_MATCHES = 50;
const IGNORE = new Set(['node_modules', '.git', 'dist', '.codejury', 'coverage', '.turbo']);
const BINARY_EXTS = new Set(['.png', '.jpg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.zip', '.tar', '.gz', '.db']);

/**
 * Detect regex patterns prone to catastrophic backtracking (ReDoS).
 * Rejects patterns with nested quantifiers like (a+)+, (a*)+, (a|a)*, etc.
 */
function hasReDoSRisk(pattern: string): boolean {
  // Nested quantifiers: quantifier applied to a group that contains a quantifier
  return /(\([^)]*[+*][^)]*\))[+*]/.test(pattern) ||
    // Overlapping alternations with quantifiers: (a|a)+
    /\(([^)]+)\|(\1)\)[+*]/.test(pattern) ||
    // Deeply nested groups with quantifiers (simplified check)
    /(\([^)]*\([^)]*[+*][^)]*\)[^)]*\))[+*]/.test(pattern);
}

async function grepFile(
  filePath: string,
  regex: RegExp,
  repoPath: string,
  results: string[],
): Promise<void> {
  if (results.length >= MAX_MATCHES) return;
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relPath = relative(repoPath, filePath);
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i]!)) {
        results.push(`${relPath}:${i + 1}: ${lines[i]!.trim()}`);
        if (results.length >= MAX_MATCHES) return;
      }
    }
  } catch {
    // Skip unreadable files
  }
}

async function walkGrep(
  dir: string,
  regex: RegExp,
  repoPath: string,
  results: string[],
): Promise<void> {
  if (results.length >= MAX_MATCHES) return;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkGrep(fullPath, regex, repoPath, results);
      } else if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.'));
        if (!BINARY_EXTS.has(ext)) {
          await grepFile(fullPath, regex, repoPath, results);
        }
      }
    }
  } catch {
    // Permission errors
  }
}

export function grepTool(repoPath: string): ToolHandler {
  return async (args) => {
    const pattern = args['pattern'] as string;
    const searchPath = args['path'] as string | undefined;

    let regex: RegExp;
    try {
      // Limit pattern length to prevent ReDoS with extremely long patterns
      if (pattern.length > 500) {
        return `Error: regex pattern too long (${pattern.length} chars, max 500)`;
      }
      // Check for patterns prone to catastrophic backtracking
      if (hasReDoSRisk(pattern)) {
        return `Error: regex pattern rejected — contains nested quantifiers that may cause excessive backtracking`;
      }
      regex = new RegExp(pattern, 'i');
    } catch {
      return `Error: invalid regex pattern "${pattern}"`;
    }

    const results: string[] = [];
    const startDir = searchPath
      ? resolve(join(repoPath, searchPath))
      : repoPath;

    if (!startDir.startsWith(resolve(repoPath))) {
      return 'Error: search path escapes repository root.';
    }

    // Check if startDir is a file
    try {
      const s = await stat(startDir);
      if (s.isFile()) {
        await grepFile(startDir, regex, repoPath, results);
      } else {
        await walkGrep(startDir, regex, repoPath, results);
      }
    } catch {
      await walkGrep(startDir, regex, repoPath, results);
    }

    if (results.length === 0) return `No matches for /${pattern}/`;
    const output = results.join('\n');
    if (results.length >= MAX_MATCHES) {
      return output + `\n... (showing first ${MAX_MATCHES} matches)`;
    }
    return output;
  };
}
