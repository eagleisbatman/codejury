# CodeJury

Autonomous mixture-of-experts code review agent.

## Architecture

Monorepo with 4 packages:
- `@codejury/core` — Git integration, provider abstraction (SDK-based), synthesis engine, report formatters, SQLite storage
- `@codejury/cli` — CLI entry point (commander), subcommand routing
- `@codejury/tui` — Ink (React for terminal) interactive UI
- `@codejury/ci` — GitHub Action + GitLab CI templates

## Conventions

- TypeScript strict mode, all packages
- ESM throughout (`"type": "module"`)
- Zod for all runtime validation (configs, API responses, findings)
- Result-based error handling: never throw in core/provider code, return `Result<T, Error>`
- Tests co-located: `foo.ts` → `foo.test.ts`, run with vitest
- No classes except for DB repositories — prefer functions and plain objects
- Providers use SDKs directly (Anthropic SDK, Google GenAI, OpenAI SDK, Ollama) — never spawn CLI subprocesses
- Providers are async generators that yield findings as they parse streaming responses

## Key Types

- `Finding` — single code review finding from one expert
- `MergedFinding` — deduplicated finding with consensus metadata
- `ReviewPayload` — git diff + context sent to experts
- `ReviewEvent` — progress events yielded by the orchestrator
- `SynthesizedReport` — merged, deduplicated report with consensus metadata
- `ExpertProvider` — interface all providers implement
- `GitScope` — discriminated union of review scope types
- `ProjectConfig` — Zod-validated TOML config schema

## Commands

- `npm run build` — build all packages (via turbo)
- `npm run test` — run all tests (via turbo)
- `npm run dev:cli` — run CLI in watch mode
- `npm run dev:tui` — run TUI with hot reload
- `npm run typecheck` — type-check all packages

## Provider Implementation

When implementing a new provider:
1. Create `packages/core/src/providers/<name>.ts`
2. Implement `ExpertProvider` interface with `review()` as an async generator yielding `Finding` objects
3. Use the provider's SDK directly for API calls
4. Validate all findings with `findingSchema` (Zod) before yielding
5. Track token usage from SDK response metadata for cost calculation
6. Register in `packages/core/src/providers/registry.ts`
