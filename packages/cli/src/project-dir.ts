/**
 * Get the resolved project directory.
 * Set by --project flag via preAction hook, falls back to cwd.
 */
export function getProjectDir(): string {
  return process.env['CJ_PROJECT_DIR'] ?? process.cwd();
}
