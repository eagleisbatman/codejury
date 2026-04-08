import { readFile } from 'node:fs/promises';

/**
 * Extracts function/class boundaries around changed lines.
 *
 * For v1, uses regex-based heuristics per language. Tree-sitter WASM
 * can be swapped in via the same interface for more accurate results.
 */

interface CodeBoundary {
  type: 'function' | 'class' | 'method';
  name: string;
  startLine: number;
  endLine: number;
}

// Language-specific patterns for detecting function/class declarations
const PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^(?:export\s+)?class\s+(\w+)/,
    /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
    /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?{/,
  ],
  javascript: [
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^(?:export\s+)?class\s+(\w+)/,
    /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
    /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/,
  ],
  python: [
    /^\s*(?:async\s+)?def\s+(\w+)/,
    /^\s*class\s+(\w+)/,
  ],
  rust: [
    /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
    /^(?:pub\s+)?struct\s+(\w+)/,
    /^(?:pub\s+)?impl(?:<[^>]+>)?\s+(\w+)/,
  ],
  go: [
    /^func\s+(?:\([^)]+\)\s+)?(\w+)/,
    /^type\s+(\w+)\s+struct/,
  ],
  java: [
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:[\w<>,\s]+)\s+(\w+)\s*\(/,
    /^\s*(?:public|private|protected)?\s*class\s+(\w+)/,
  ],
};

function detectBoundaries(lines: string[], language: string): CodeBoundary[] {
  const patterns = PATTERNS[language] ?? PATTERNS['javascript'] ?? [];
  const boundaries: CodeBoundary[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        const type = line.match(/class\s/) ? 'class' as const
          : line.match(/^\s+/) ? 'method' as const
          : 'function' as const;

        // Estimate end line by finding matching closing brace/dedent
        const endLine = findBlockEnd(lines, i, language);

        boundaries.push({
          type,
          name: match[1],
          startLine: i + 1, // 1-indexed
          endLine: endLine + 1,
        });
        break;
      }
    }
  }

  return boundaries;
}

function findBlockEnd(lines: string[], startIndex: number, language: string): number {
  if (language === 'python') {
    // Python: find next line at same or lower indentation level
    const indent = lines[startIndex]!.match(/^(\s*)/)?.[1]?.length ?? 0;
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.trim() === '') continue;
      const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (lineIndent <= indent && line.trim() !== '') {
        return i - 1;
      }
    }
    return lines.length - 1;
  }

  // Brace-based languages: count braces
  let depth = 0;
  let foundOpen = false;
  for (let i = startIndex; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      if (ch === '{') { depth++; foundOpen = true; }
      if (ch === '}') { depth--; }
      if (foundOpen && depth === 0) return i;
    }
  }
  return Math.min(startIndex + 50, lines.length - 1);
}

/**
 * Find the enclosing function/class for a given line number.
 */
export function findEnclosingScope(
  lines: string[],
  targetLine: number,
  language: string,
): { functionName?: string; className?: string } {
  const boundaries = detectBoundaries(lines, language);
  let functionName: string | undefined;
  let className: string | undefined;

  for (const b of boundaries) {
    if (b.startLine <= targetLine && b.endLine >= targetLine) {
      if (b.type === 'class') {
        className = b.name;
      } else {
        functionName = b.name;
      }
    }
  }

  return { functionName, className };
}

/**
 * Extract context around a changed line range from a file.
 */
export async function extractFileContext(
  filePath: string,
  lineStart: number,
  lineEnd: number,
  language: string,
  contextLines: number = 10,
): Promise<{
  before: string;
  after: string;
  functionName?: string;
  className?: string;
}> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const beforeStart = Math.max(0, lineStart - 1 - contextLines);
    const afterEnd = Math.min(lines.length, lineEnd + contextLines);

    const before = lines.slice(beforeStart, lineStart - 1).join('\n');
    const after = lines.slice(lineEnd, afterEnd).join('\n');

    const { functionName, className } = findEnclosingScope(lines, lineStart, language);

    return { before, after, functionName, className };
  } catch {
    return { before: '', after: '' };
  }
}

export { detectBoundaries, type CodeBoundary };
