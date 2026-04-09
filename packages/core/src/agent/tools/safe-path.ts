import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Resolve a relative path within a repo, following symlinks,
 * and verify it doesn't escape the repo root.
 *
 * Returns the resolved absolute path, or an error string.
 */
export async function safePath(
  repoPath: string,
  relPath: string,
): Promise<{ ok: true; absPath: string } | { ok: false; error: string }> {
  const candidate = resolve(join(repoPath, relPath));

  // First check: does the literal path stay within the repo?
  const repoRoot = resolve(repoPath);
  if (!candidate.startsWith(repoRoot + '/') && candidate !== repoRoot) {
    return { ok: false, error: `path "${relPath}" escapes the repository root.` };
  }

  // Second check: resolve symlinks and verify the real path is still inside the repo
  try {
    const realRoot = await realpath(repoRoot);
    const realTarget = await realpath(candidate);
    if (!realTarget.startsWith(realRoot + '/') && realTarget !== realRoot) {
      return { ok: false, error: `path "${relPath}" resolves via symlink outside the repository root.` };
    }
    return { ok: true, absPath: realTarget };
  } catch (e) {
    // File doesn't exist yet (e.g., new file) — fall back to literal check only
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true, absPath: candidate };
    }
    return { ok: false, error: `cannot resolve path "${relPath}": ${(e as Error).message}` };
  }
}
