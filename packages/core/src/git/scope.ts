import type { GitScope } from '../types/review.js';

export function parsePrUrl(url: string): { forge: 'github' | 'gitlab'; owner: string; repo: string; number: number } | null {
  const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (ghMatch) {
    return { forge: 'github', owner: ghMatch[1]!, repo: ghMatch[2]!, number: parseInt(ghMatch[3]!, 10) };
  }
  const glMatch = url.match(/gitlab\.com\/([^/]+)\/([^/]+)\/-\/merge_requests\/(\d+)/);
  if (glMatch) {
    return { forge: 'gitlab', owner: glMatch[1]!, repo: glMatch[2]!, number: parseInt(glMatch[3]!, 10) };
  }
  return null;
}

export function scopeToString(scope: GitScope): string {
  switch (scope.type) {
    case 'staged':
      return 'staged changes';
    case 'unstaged':
      return 'unstaged changes';
    case 'branch':
      return `branch ${scope.name}`;
    case 'commit_range':
      return `${scope.from}..${scope.to}`;
    case 'pr': {
      const parsed = parsePrUrl(scope.url);
      return parsed ? `PR #${parsed.number} (${parsed.forge})` : `PR ${scope.url}`;
    }
    case 'files':
      return `files: ${scope.paths.join(', ')}`;
  }
}
