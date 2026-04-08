import { parse as parseToml } from 'smol-toml';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { projectConfigSchema, type ProjectConfig } from '../types/config.js';
import { type Result, ok, err } from '../types/result.js';

const CONFIG_FILENAME = 'config.toml';
const PROJECT_DIR = '.codejury';
const GLOBAL_DIR = join(homedir(), '.config', 'codejury');

async function readTomlFile(path: string): Promise<Result<Record<string, unknown>>> {
  try {
    const content = await readFile(path, 'utf-8');
    return ok(parseToml(content) as Record<string, unknown>);
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok({});
    }
    return err(
      e instanceof Error ? e : new Error(`Failed to parse TOML: ${String(e)}`),
    );
  }
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

export async function loadConfig(projectRoot: string): Promise<Result<ProjectConfig>> {
  const globalResult = await readTomlFile(join(GLOBAL_DIR, CONFIG_FILENAME));
  if (!globalResult.ok) return globalResult;

  const projectResult = await readTomlFile(
    join(projectRoot, PROJECT_DIR, CONFIG_FILENAME),
  );
  if (!projectResult.ok) return projectResult;

  const merged = deepMerge(globalResult.value, projectResult.value);

  const parsed = projectConfigSchema.safeParse(merged);
  if (!parsed.success) {
    return err(new Error(`Config validation failed: ${parsed.error.message}`));
  }

  return ok(parsed.data);
}

export function parseConfigString(tomlString: string): Result<ProjectConfig> {
  try {
    const raw = parseToml(tomlString) as Record<string, unknown>;
    const parsed = projectConfigSchema.safeParse(raw);
    if (!parsed.success) {
      return err(new Error(`Config validation failed: ${parsed.error.message}`));
    }
    return ok(parsed.data);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export { PROJECT_DIR, CONFIG_FILENAME, GLOBAL_DIR };
