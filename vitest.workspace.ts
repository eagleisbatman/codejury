import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core',
  'packages/cli',
  'packages/tui',
  'packages/ci',
]);
