import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // CLI is a binary, no one imports it — skip declaration generation
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
    'simple-git',
    '@kwsites/file-exists',
    '@kwsites/promise-deferred',
    '@anthropic-ai/sdk',
    '@google/genai',
    'openai',
    'ollama',
  ],
});
