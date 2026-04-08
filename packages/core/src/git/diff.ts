import simpleGit from 'simple-git';
import { extname } from 'node:path';
import type { GitScope } from '../types/review.js';
import type { FileChange, FileHunk, ReviewPayload } from '../types/provider.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java', '.kt': 'kotlin',
  '.rb': 'ruby', '.php': 'php', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.cs': 'csharp', '.swift': 'swift', '.scala': 'scala', '.r': 'r',
  '.sql': 'sql', '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.yaml': 'yaml', '.yml': 'yaml', '.json': 'json', '.toml': 'toml', '.xml': 'xml',
  '.html': 'html', '.css': 'css', '.scss': 'scss', '.md': 'markdown',
};

function detectLanguage(filePath: string): string {
  return LANGUAGE_MAP[extname(filePath)] ?? 'unknown';
}

interface HunkHeader {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

function parseHunkHeader(line: string): HunkHeader | null {
  const match = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!match) return null;
  return {
    oldStart: parseInt(match[1]!, 10),
    oldCount: parseInt(match[2] ?? '1', 10),
    newStart: parseInt(match[3]!, 10),
    newCount: parseInt(match[4] ?? '1', 10),
  };
}

function parseDiffOutput(diffText: string, contextLines: number): FileChange[] {
  const files: FileChange[] = [];
  const fileSections = diffText.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const lines = section.split('\n');
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const filePath = headerMatch[2]!;
    const language = detectLanguage(filePath);
    const hunks: FileHunk[] = [];
    let additions = 0;
    let deletions = 0;

    let currentHunk: { header: HunkHeader; lines: string[] } | null = null;

    for (const line of lines) {
      const header = parseHunkHeader(line);
      if (header) {
        if (currentHunk) {
          hunks.push(buildHunk(currentHunk.header, currentHunk.lines, contextLines));
        }
        currentHunk = { header, lines: [] };
        continue;
      }

      if (currentHunk) {
        currentHunk.lines.push(line);
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
      }
    }

    if (currentHunk) {
      hunks.push(buildHunk(currentHunk.header, currentHunk.lines, contextLines));
    }

    if (hunks.length > 0) {
      files.push({ path: filePath, language, hunks, additions, deletions });
    }
  }

  return files;
}

function buildHunk(header: HunkHeader, lines: string[], _contextLines: number): FileHunk {
  const contextBefore: string[] = [];
  const contextAfter: string[] = [];
  const changedLines: string[] = [];
  let inChanges = false;
  let pastChanges = false;

  for (const line of lines) {
    const isChange = line.startsWith('+') || line.startsWith('-');
    if (isChange) {
      inChanges = true;
      changedLines.push(line);
    } else if (!inChanges) {
      contextBefore.push(line.startsWith(' ') ? line.slice(1) : line);
    } else {
      pastChanges = true;
      contextAfter.push(line.startsWith(' ') ? line.slice(1) : line);
    }
  }

  // If no explicit change transition, all context lines go to before
  if (!pastChanges && contextBefore.length > 0 && changedLines.length === 0) {
    // Pure context hunk (unlikely in a diff, but handle gracefully)
  }

  return {
    startLine: header.newStart,
    endLine: header.newStart + header.newCount - 1,
    content: changedLines.join('\n'),
    context: {
      before: contextBefore.join('\n'),
      after: contextAfter.join('\n'),
    },
  };
}

async function getDirectoryStructure(repoPath: string, maxDepth: number = 2): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    const files = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD']);
    const paths = files.trim().split('\n').filter(Boolean);

    const dirs = new Set<string>();
    for (const p of paths) {
      const parts = p.split('/');
      for (let i = 1; i <= Math.min(parts.length, maxDepth); i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    }

    return Array.from(dirs).sort().join('\n');
  } catch {
    return '';
  }
}

export async function resolveDiff(
  repoPath: string,
  scope: GitScope,
  contextLines: number = 10,
): Promise<Result<ReviewPayload>> {
  const git = simpleGit(repoPath);

  try {
    let diffText: string;

    switch (scope.type) {
      case 'staged':
        diffText = await git.diff(['--cached', `-U${contextLines}`]);
        if (!diffText.trim()) {
          diffText = await git.diff([`-U${contextLines}`]);
        }
        break;
      case 'unstaged':
        diffText = await git.diff([`-U${contextLines}`]);
        break;
      case 'branch': {
        const mergeBase = await git.raw(['merge-base', 'HEAD', scope.name]);
        diffText = await git.diff([mergeBase.trim(), 'HEAD', `-U${contextLines}`]);
        break;
      }
      case 'commit_range':
        diffText = await git.diff([scope.from, scope.to, `-U${contextLines}`]);
        break;
      case 'files':
        diffText = await git.diff(['HEAD', `-U${contextLines}`, '--', ...scope.paths]);
        break;
      case 'pr':
        return err(new Error('PR scope requires forge API integration — use branch scope for local review'));
    }

    if (!diffText.trim()) {
      return err(new Error('No changes found for the given scope'));
    }

    const files = parseDiffOutput(diffText, contextLines);
    const branchName = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    const repoName = repoPath.split('/').pop() ?? 'unknown';
    const directoryStructure = await getDirectoryStructure(repoPath);

    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    return ok({
      files,
      repoName,
      branchName,
      directoryStructure,
      totalAdditions,
      totalDeletions,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export { detectLanguage, parseDiffOutput };
