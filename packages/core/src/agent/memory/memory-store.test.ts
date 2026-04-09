import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from './memory-store.js';

let tmpDir: string;
let store: MemoryStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cj-memory-'));
  store = new MemoryStore(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('MemoryStore', () => {
  it('returns empty object for missing memory file', async () => {
    const data = await store.read('codebase');
    expect(data).toEqual({});
  });

  it('reads all returns empty string when no memory exists', async () => {
    const all = await store.readAll();
    expect(all).toBe('');
  });

  it('queues and flushes writes', async () => {
    store.queueWrite('codebase', {
      structure: { keyFiles: ['src/index.ts'], directories: ['src/'], languages: ['typescript'] },
    });
    store.queueWrite('patterns', {
      conventions: [{ pattern: 'Uses Express', examples: ['app.ts'], firstSeen: '2026-04-08' }],
    });

    await store.flush();

    const codebase = await store.read('codebase');
    expect(codebase).toHaveProperty('structure');
    expect(codebase).toHaveProperty('lastUpdated');

    const patterns = await store.read('patterns');
    expect(patterns).toHaveProperty('conventions');
  });

  it('merges with existing data on flush', async () => {
    store.queueWrite('codebase', {
      structure: { keyFiles: ['a.ts'] },
    });
    await store.flush();

    store.queueWrite('codebase', {
      structure: { keyFiles: ['b.ts'] },
      architecture: ['monorepo'],
    });
    await store.flush();

    const data = await store.read('codebase');
    const struct = data['structure'] as Record<string, unknown>;
    const keyFiles = struct['keyFiles'] as string[];
    expect(keyFiles).toContain('a.ts');
    expect(keyFiles).toContain('b.ts');
    expect(data['architecture']).toEqual(['monorepo']);
  });

  it('readAll includes all memory types', async () => {
    store.queueWrite('codebase', { structure: { languages: ['typescript'] } });
    store.queueWrite('calibration', { perExpert: { claude: { totalFindings: 5 } } });
    await store.flush();

    const all = await store.readAll();
    expect(all).toContain('Codebase Memory');
    expect(all).toContain('typescript');
    expect(all).toContain('Calibration Memory');
    expect(all).toContain('claude');
  });

  it('multiple queued writes to same type are merged', async () => {
    store.queueWrite('patterns', { conventions: [{ pattern: 'A' }] });
    store.queueWrite('patterns', { conventions: [{ pattern: 'B' }] });
    await store.flush();

    const data = await store.read('patterns');
    const conventions = data['conventions'] as Array<{ pattern: string }>;
    expect(conventions).toHaveLength(2);
  });
});
