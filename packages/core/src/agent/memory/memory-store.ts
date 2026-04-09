import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { MemoryType } from './memory-types.js';

const FILE_NAMES: Record<MemoryType, string> = {
  codebase: 'codebase.json',
  patterns: 'patterns.json',
  calibration: 'calibration.json',
};

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = result[key];
    if (Array.isArray(sv) && Array.isArray(tv)) {
      // Merge arrays: concat and deduplicate by JSON stringification
      const seen = new Set(tv.map((x) => JSON.stringify(x)));
      result[key] = [...tv, ...sv.filter((x) => !seen.has(JSON.stringify(x)))];
    } else if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

export class MemoryStore {
  private pendingWrites = new Map<MemoryType, Record<string, unknown>>();

  constructor(private memoryDir: string) {}

  async read(type: MemoryType): Promise<Record<string, unknown>> {
    try {
      const content = await readFile(join(this.memoryDir, FILE_NAMES[type]), 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async readAll(): Promise<string> {
    const sections: string[] = [];

    const codebase = await this.read('codebase');
    if (Object.keys(codebase).length > 0) {
      sections.push(`## Codebase Memory\n${JSON.stringify(codebase, null, 2)}`);
    }

    const patterns = await this.read('patterns');
    if (Object.keys(patterns).length > 0) {
      sections.push(`## Patterns Memory\n${JSON.stringify(patterns, null, 2)}`);
    }

    const calibration = await this.read('calibration');
    if (Object.keys(calibration).length > 0) {
      sections.push(`## Calibration Memory\n${JSON.stringify(calibration, null, 2)}`);
    }

    return sections.join('\n\n');
  }

  queueWrite(type: MemoryType, content: Record<string, unknown>): void {
    const existing = this.pendingWrites.get(type) ?? {};
    this.pendingWrites.set(type, deepMerge(existing, content));
  }

  async flush(): Promise<void> {
    if (this.pendingWrites.size === 0) return;

    await mkdir(this.memoryDir, { recursive: true });

    for (const [type, pending] of this.pendingWrites) {
      const existing = await this.read(type);
      const merged = deepMerge(existing, { ...pending, lastUpdated: new Date().toISOString() });
      await writeFile(
        join(this.memoryDir, FILE_NAMES[type]),
        JSON.stringify(merged, null, 2) + '\n',
      );
    }

    this.pendingWrites.clear();
  }
}
