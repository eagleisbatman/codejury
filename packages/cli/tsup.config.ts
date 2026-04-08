import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
  noExternal: ['@codejury/core'],
  external: [
    'better-sqlite3',
    '@codejury/tui',
    'ink',
    'react',
    'react-devtools-core',
    // CJS packages that can't be bundled into ESM
    'simple-git',
    '@kwsites/file-exists',
    '@kwsites/promise-deferred',
    // SDK packages - keep external for cleaner bundling
    '@anthropic-ai/sdk',
    '@google/genai',
    'openai',
    'ollama',
  ],
});
