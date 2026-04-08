# CodeJury — Build Plan & Claude Code Prompts

## Monorepo Structure

```
codejury/
├── CLAUDE.md                    ← project-wide Claude Code instructions
├── package.json                 ← workspace root (npm workspaces)
├── turbo.json                   ← turborepo config
├── packages/
│   ├── core/                    ← TypeScript core: git ops, provider abstraction, synthesis engine
│   │   ├── CLAUDE.md
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── git/             ← diff parsing, scope resolution, context extraction
│   │       ├── providers/       ← expert provider implementations (claude, gemini, codex, ollama, custom)
│   │       ├── synthesis/       ← MoE synthesis engine, deduplication, agreement scoring
│   │       ├── report/          ← output formatters (json, markdown, sarif, html, github-comments)
│   │       ├── config/          ← TOML config loader, validation, defaults
│   │       ├── cost/            ← token counting, cost estimation, budget enforcement
│   │       ├── db/              ← SQLite review history, finding storage
│   │       └── types/           ← shared TypeScript types (Finding, ReviewSession, ExpertMeta, etc.)
│   ├── cli/                     ← CLI entry point (commander/yargs), subcommand routing
│   │   ├── CLAUDE.md
│   │   ├── package.json
│   │   └── src/
│   │       ├── commands/        ← review, watch, report, config, history, init, doctor
│   │       └── index.ts
│   ├── tui/                     ← Ink TUI application
│   │   ├── CLAUDE.md
│   │   ├── package.json
│   │   └── src/
│   │       ├── screens/         ← Dashboard, ReviewDetail, FindingInspector, ExpertPanel, History, Config
│   │       ├── components/      ← shared Ink components (ExpertDot, SeverityBadge, ProgressBar, etc.)
│   │       ├── hooks/           ← useReview, useExperts, useConfig, useHistory
│   │       └── App.tsx
│   └── ci/                      ← GitHub Action + GitLab CI template
│       ├── action.yml
│       └── templates/
└── docs/
    ├── PRD.md
    └── architecture.md
```

---

## Phase 1: Foundation (Tasks 1–8)

### Task 1: Scaffold Monorepo

**Claude Code Prompt:**

```
Read the PRD at docs/PRD.md. Scaffold a Turborepo monorepo with npm workspaces.

Create 4 packages: @codejury/core, @codejury/cli, @codejury/tui, @codejury/ci.

- Root: turbo.json with build/test/lint pipelines
- All packages: TypeScript 5.x, vitest for testing, tsup for bundling
- @codejury/core: no framework deps, pure TypeScript
- @codejury/cli: depends on @codejury/core, uses commander for CLI
- @codejury/tui: depends on @codejury/core, uses ink + ink-markdown + react
- @codejury/ci: depends on @codejury/core

Create a root CLAUDE.md with project conventions:
- All code in TypeScript strict mode
- Use Zod for runtime validation of configs and API responses
- Use Effect-style error handling (Result<T, E>) not exceptions
- Prefer explicit types over inference for public APIs
- Test files co-located: foo.ts → foo.test.ts
```

---

### Task 2: Type System

**Claude Code Prompt:**

```
Read the PRD sections 5 (Review Report Schema) and 15 (Project-Based Workflow).

Create the core type system in packages/core/src/types/:

1. finding.ts — Finding interface matching PRD section 5.1 exactly. Include:
   - Severity enum: critical | error | warning | info | style
   - Category enum: security | correctness | performance | maintainability | style | test_coverage
   - Finding interface with all fields from PRD table
   - Use Zod schemas alongside TypeScript types for runtime validation

2. review.ts — ReviewSession, SynthesizedReport, Verdict enum, ExpertMeta, CostBreakdown
   - Match PRD section 5.2 exactly
   - ReviewSession must include the git scope (staged | branch | commit_range | pr | files) with typed discriminated unions

3. provider.ts — ExpertProvider interface:
   - id: string, name: string, model: string
   - review(payload: ReviewPayload): AsyncGenerator<Finding>  (streaming)
   - isAvailable(): Promise<boolean>
   - estimateCost(payload: ReviewPayload): CostEstimate

4. config.ts — ProjectConfig matching the TOML schema from PRD section 3.2
   - Zod schema for the entire config structure
   - Defaults for all optional fields

Export everything from packages/core/src/types/index.ts.
Write unit tests for all Zod schemas with valid and invalid inputs.
```

---

### Task 3: Git Integration

**Claude Code Prompt:**

```
Read PRD section 15.2 (Git-Native Review Scoping).

Implement packages/core/src/git/ with:

1. diff.ts — Parse git diffs into structured ReviewPayload:
   - Use simple-git (npm package) for git operations
   - Support all 5 scope modes from PRD: staged, branch, commit_range, pr, files
   - For each changed file, extract: file path, hunks with line numbers, and N lines of surrounding context (configurable, default 10)
   - Return a ReviewPayload with file-level and hunk-level granularity

2. context.ts — Enrich diffs with repository context:
   - Detect language per file (by extension)
   - Extract function/class boundaries around changed lines using tree-sitter-wasms (npm) for JS/TS/Python/Rust/Go
   - Include the repo's directory structure (top 2 levels) for architectural context

3. scope.ts — Resolve git scope from CLI args:
   - GitScope discriminated union: { type: 'staged' } | { type: 'branch', name: string } | { type: 'commit_range', from: string, to: string } | { type: 'pr', url: string, forge: 'github' | 'gitlab' } | { type: 'files', paths: string[] }
   - resolveDiff(scope: GitScope): Promise<ReviewPayload>

Write integration tests using a temp git repo (create commits programmatically with simple-git).
```

---

### Task 4: Provider Abstraction + Ollama Provider

**Claude Code Prompt:**

```
Read PRD section 2.2 (Expert Provider Abstraction).

Implement the provider system in packages/core/src/providers/:

1. base.ts — Abstract base implementing the ExpertProvider interface:
   - Subprocess lifecycle management (spawn, timeout, kill)
   - Structured output parsing: expect JSON from stdout, fall back to markdown parsing
   - Retry logic: 1 retry on timeout, 0 retries on auth failure
   - Cost tracking: count input/output tokens from response metadata

2. ollama.ts — Ollama provider (implement first since it's free/local):
   - Spawn: `ollama run <model>` with the review prompt piped to stdin
   - Model configurable (default: qwen2.5-coder:32b)
   - System prompt that instructs the model to output JSON array of findings matching the Finding schema
   - Parse response, validate each finding with Zod, skip invalid ones with warning
   - isAvailable: check `ollama list` for the configured model
   - Cost: always $0.00

3. prompt.ts — Review prompt template builder:
   - Takes ReviewPayload + custom rules + provider-specific focus areas
   - Builds a system prompt that:
     a) Describes the reviewer role
     b) Lists the Finding JSON schema the model must output
     c) Includes project custom rules from config
     d) Specifies focus areas for this expert
   - Returns formatted prompt string

Write unit tests for prompt building and finding validation.
Write an integration test for ollama provider (skip if ollama not available).
```

---

### Task 5: Claude Code + Gemini + Codex Providers

**Claude Code Prompt:**

```
Building on the provider base from Task 4, implement the remaining providers:

1. packages/core/src/providers/claude.ts:
   - Spawn: `claude -p "<prompt>" --output-format json` (Claude Code CLI)
   - Parse Claude's response format, extract findings
   - Handle Claude Code's streaming output (may need --no-stream flag)
   - API key from env: ANTHROPIC_API_KEY or Claude Code's built-in auth
   - Cost estimation: use claude-sonnet-4-20250514 pricing ($3/MTok input, $15/MTok output)

2. packages/core/src/providers/gemini.ts:
   - Spawn: `gemini -p "<prompt>"` (Gemini CLI)
   - Handle Gemini's output format
   - API key from env: GEMINI_API_KEY
   - Cost: use gemini-2.5-pro pricing (check current rates, may be free tier)

3. packages/core/src/providers/codex.ts:
   - Spawn: `codex -q "<prompt>"` (Codex CLI, quiet mode)
   - Handle Codex output format
   - API key from env: OPENAI_API_KEY
   - Cost: use codex-mini pricing

4. packages/core/src/providers/custom.ts:
   - Generic provider for any CLI that accepts stdin JSON and outputs stdout JSON
   - Configured via config: command, args, env, timeout
   - Minimal assumptions about the subprocess

5. packages/core/src/providers/registry.ts:
   - ProviderRegistry class: register/get/list providers
   - Factory function: createProvider(config: ExpertConfig) → ExpertProvider
   - Discovery: check which CLIs are available on PATH

Write mock-based unit tests for each provider's output parsing logic.
```

---

### Task 6: Synthesis Engine

**Claude Code Prompt:**

```
Read PRD sections 2.1 (Phase 3: Synthesis) and 2.3 (MoE Strategy).

Implement packages/core/src/synthesis/:

1. dedup.ts — Finding deduplication:
   - Primary key: file_path + overlapping line ranges (within 5 lines = same finding)
   - Secondary: semantic similarity of titles using string distance (Levenshtein via fastest-levenshtein npm)
   - Merge findings that match: combine descriptions, keep the most detailed suggested_fix, compute agreement_score
   - Preserve dissenting opinions when experts disagree on severity or category

2. synthesizer.ts — Main synthesis orchestrator:
   - Input: Finding[][] (one array per expert)
   - Step 1: Normalize all findings (validate schema, assign IDs)
   - Step 2: Deduplicate across experts (dedup.ts)
   - Step 3: For each merged finding, compute:
     - agreement_score: ratio of experts that flagged it
     - consensus status: unanimous (1.0), majority (>0.5), split (<=0.5)
     - final severity: use the highest severity from agreeing experts
   - Step 4: Sort by severity desc, then agreement_score desc
   - Step 5: Generate verdict: critical findings → request_changes, else approve
   - Step 6: Build SynthesizedReport with all metadata

3. strategies.ts — MoE dispatch strategies:
   - fullPanel(providers, payload): dispatch to all providers in parallel
   - routed(providers, payload, router): classify hunks, dispatch to best provider per category
   - cascading(providers, payload, primaryProvider): primary first, escalate medium+ findings
   - All return Finding[][] (per-expert arrays)

4. narrative.ts — Generate the summary.narrative:
   - Takes SynthesizedReport, produces 2-3 paragraph markdown summary
   - Uses the synthesizer model (Claude by default) to generate natural language summary
   - Falls back to template-based summary if synthesizer unavailable

Write thorough unit tests with fixtures representing realistic multi-expert outputs.
Include test cases for: perfect agreement, total disagreement, partial overlap, conflicting severities.
```

---

### Task 7: Report Formatters

**Claude Code Prompt:**

```
Read PRD section 3.3 (Output Formats).

Implement packages/core/src/report/:

1. json.ts — JSON output:
   - Serialize SynthesizedReport to pretty-printed JSON
   - Include all metadata: expert_metadata, cost_breakdown, git scope

2. markdown.ts — Markdown report:
   - Header with repo/branch/commit info
   - Verdict banner (APPROVE / REQUEST CHANGES) with emoji indicators
   - Findings grouped by severity
   - Each finding: severity badge, title, file:lines, description, expert dots showing who flagged it
   - Agreement scores as visual indicators
   - Suggested fixes in fenced code blocks
   - Dissenting opinions in blockquotes
   - Cost summary footer

3. sarif.ts — SARIF 2.1.0 output:
   - Follow the SARIF JSON schema exactly
   - Map: Finding.severity → SARIF level, Finding.category → SARIF rule
   - Include code flows with file/line locations
   - Compatible with GitHub code scanning upload

4. github.ts — GitHub PR comments:
   - Use @octokit/rest to post review comments
   - Map findings to inline PR review comments at exact line positions
   - Post a summary comment with the overall verdict and finding counts
   - Support both creating new review and updating existing CodeJury review

5. html.ts — Single-file HTML report:
   - Self-contained HTML with inline CSS and JS
   - Collapsible finding sections
   - Expert agreement visualization
   - Dark theme matching the TUI aesthetic
   - Suitable for email attachment or Slack sharing

Write unit tests for each formatter with snapshot testing (vitest --update).
```

---

### Task 8: CLI Commands

**Claude Code Prompt:**

```
Read PRD section 3.1 (Command Structure).

Implement packages/cli/src/commands/:

1. init.ts — `cj init`:
   - Interactive preset selection (use @inquirer/prompts)
   - Scaffold .codejury/ directory
   - Detect available expert CLIs (run `cj doctor` checks inline)
   - Write default config.toml based on selected preset

2. review.ts — `cj review`:
   - Parse git scope from flags: --branch, --diff, --pr, --files (default: staged)
   - Load project config from .codejury/config.toml
   - Resolve provider panel from config + --experts override
   - Run synthesis pipeline: ingest → fan-out → synthesize → report
   - Stream progress to stderr (expert status updates)
   - Write report to stdout in configured format
   - Save ReviewSession to reviews.db
   - Exit code: 0 = approve, 1 = request_changes

3. doctor.ts — `cj doctor`:
   - Check each expert CLI binary on PATH
   - Verify API key availability
   - Test connectivity (quick ping to each provider)
   - Report results as formatted checklist

4. history.ts — `cj history`:
   - Query reviews.db with filters: --since, --severity, --branch
   - Display as formatted table (use cli-table3)
   - Include finding counts, cost, verdict per review

5. config.ts — `cj config get/set`:
   - Read/write config.toml values
   - Validate on write using Zod schema

6. index.ts — Main CLI entry:
   - commander setup with all subcommands
   - If TTY and no subcommand → launch TUI (packages/tui)
   - Global flags: --verbose, --format, --no-color, --json
   - Version from package.json

Wire up the bin field in cli/package.json to expose `cj` and `codejury` commands.
Write integration tests for init and doctor commands.
```

---

## Phase 2: TUI (Tasks 9–12)

### Task 9: TUI Foundation

**Claude Code Prompt:**

```
Read PRD section 4 (TUI Design).

Set up the Ink TUI app in packages/tui/:

1. App.tsx — Root component:
   - Screen router: Dashboard | ReviewDetail | FindingInspector | ExpertPanel | History | Config
   - Global keybinding handler (useInput from ink):
     - `q` to quit, `?` for help overlay, `Esc` to go back
     - Number keys 1-6 for direct screen navigation
   - Layout: fullscreen with header bar (project name, active screen, cost), main content area

2. components/Header.tsx:
   - Project name from config
   - Active screen indicator
   - Expert panel status dots (green = available, red = down)
   - Running cost for current session

3. components/Markdown.tsx:
   - Wrapper around ink-markdown for rendering review reports
   - Custom theme matching our color scheme
   - Code block highlighting via cli-highlight

4. components/ExpertDot.tsx:
   - Colored dot component for expert identification
   - Active/inactive states
   - Tooltip on focus showing expert name + model

5. hooks/useProject.ts:
   - Load .codejury/config.toml
   - Provide config to all screens via React context
   - Watch for config changes

Set up the package.json with ink, ink-markdown, react, and @types dependencies.
Create a dev script that runs the TUI with hot reload (use tsx --watch).
```

---

### Task 10: Dashboard + Review Detail Screens

**Claude Code Prompt:**

```
Read PRD section 4.2 (Key Screens) and section 4.3 (Review Workflow).

Implement the main TUI screens:

1. screens/Dashboard.tsx:
   - Three-section layout:
     a) Recent reviews list (from reviews.db): severity counts, verdict badge, date, branch
     b) Expert panel health: each expert with availability status, last response time
     c) Cost summary: today/week/month spend vs budget
   - Keybindings: j/k to navigate reviews, Enter to open ReviewDetail, n to start new review
   - `n` triggers an interactive flow: select git scope → confirm experts → start review

2. screens/ReviewDetail.tsx:
   - Receives a ReviewSession from Dashboard selection
   - Finding list grouped by severity
   - Each finding row: severity icon, title, file:line, expert dots, agreement badge
   - j/k navigation, Enter to open FindingInspector
   - Tab to toggle between "All Findings" and per-expert view
   - Summary bar at top: total findings, verdict, cost

3. screens/ReviewProgress.tsx:
   - Live review progress (used when running a review from the TUI):
   - Expert status rows: spinner (running), checkmark (done), X (failed)
   - Elapsed time and finding count per expert, updating in real-time
   - As experts complete, stream findings into a preview list below the progress bars
   - Synthesis progress indicator when all experts complete
   - Auto-transition to ReviewDetail when synthesis finishes

Use ink's Box, Text, and Newline components. Use ink-spinner for loading states.
```

---

### Task 11: Finding Inspector + Expert Panel Screens

**Claude Code Prompt:**

```
Implement the detail screens:

1. screens/FindingInspector.tsx:
   - Full-screen view of a single finding
   - Top: severity badge, category badge, agreement score, file:line
   - Body: description rendered as markdown (use Markdown component from Task 9)
   - Expert breakdown: for each expert that flagged this, show their individual analysis
   - If dissenting opinions exist, show them in a highlighted box
   - Suggested fix: rendered as a code block with copy-to-clipboard support (using clipboardy)
   - Actions: `a` to accept, `d` to dismiss, `i` to add to ignore rules, `c` to copy fix
   - Accept/dismiss updates reviews.db for future calibration tracking

2. screens/ExpertPanel.tsx:
   - Grid showing all configured experts
   - Per expert: name, model, status (available/unavailable), avg response time, total findings contributed, total cost
   - `t` to test connection (runs a quick ping review)
   - `d` to disable/enable an expert for this project
   - `r` to reconfigure (opens config for that expert)

3. screens/History.tsx:
   - Scrollable list of all past reviews in this project
   - Columns: date, git scope (branch/PR#), files changed, findings by severity, verdict, cost
   - `/` to enter search mode (filter by branch name, finding text)
   - `s` to cycle sort: newest first, most findings, highest cost
   - Enter to reopen a past review in ReviewDetail
```

---

### Task 12: Config Editor Screen

**Claude Code Prompt:**

```
Implement the TUI config editor:

1. screens/ConfigEditor.tsx:
   - Read .codejury/config.toml, display with syntax highlighting (use cli-highlight with toml grammar)
   - Vim-style editing: i for insert mode, Esc for normal, :w to save, :q to quit screen
   - Or simpler: form-based editor using ink's TextInput for each config section
   - Live validation: as values change, run Zod schema validation and show errors inline
   - Sections rendered as collapsible groups: [experts], [synthesis], [output], [cost], [rules], [ci]
   - For expert config: show a sub-form per expert with model, timeout, focus fields

2. Alternatively if full vim editing is too complex for v1:
   - Form-based approach: Tab to navigate between fields
   - SelectInput for enum fields (strategy, severity_threshold, format)
   - TextInput for string/number fields
   - Toggle for boolean fields
   - Save button that writes validated TOML back to disk

Go with the form-based approach — it's more reliable and user-friendly.
Add a "Reset to defaults" option that regenerates config from the original preset.
```

---

## Phase 3: CI & Polish (Tasks 13–16)

### Task 13: GitHub Action

**Claude Code Prompt:**

```
Read PRD section 6 (CI/CD Integration).

Implement packages/ci/:

1. action.yml — GitHub Action definition:
   - name: CodeJury Review
   - inputs: experts, strategy, fail_on_severity, format, budget
   - runs: composite action that installs codejury via npm, then runs cj review --pr $PR_URL

2. entrypoint.sh:
   - Install codejury globally
   - Detect PR URL from GITHUB_EVENT_PATH
   - Run cj review --pr $PR_URL --format github --experts $INPUT_EXPERTS
   - If fail_on_severity is set, check exit code and fail accordingly
   - Upload SARIF to GitHub code scanning if format includes sarif

3. templates/gitlab-ci.yml — GitLab CI template:
   - Stage: code_review
   - Script: npx codejury review --pr $CI_MERGE_REQUEST_IID --format sarif
   - Artifacts: SARIF report as code quality artifact

Write a README.md with usage examples for both GitHub Actions and GitLab CI.
```

---

### Task 14: Project Initialization Polish

**Claude Code Prompt:**

```
Read PRD section 15.1 (Project Initialization).

Polish the cj init flow:

1. Interactive wizard with @inquirer/prompts:
   - Auto-detect git remote to suggest project name
   - Show which expert CLIs are found on PATH
   - Let user select from presets: balanced, security-first, cost-conscious, full-panel
   - Offer to run cj doctor after init
   - If .codejury/ already exists, offer: reconfigure, reset, or abort

2. Default rules:
   - Create .codejury/rules/default.md with sensible starter rules:
     "Flag any hardcoded secrets or API keys"
     "Warn about functions exceeding 50 lines"
     "Check for missing error handling in async functions"
   - These are injected into expert prompts automatically

3. .codejury/sensitive.glob defaults:
   - .env*, *secret*, *credential*, *key.pem, config/production/*, **/secrets/**

4. reviews.db schema:
   - Use better-sqlite3
   - Tables: review_sessions, findings, expert_runs, cost_records
   - Indexes on: session timestamp, finding severity, file path

Write the full init integration test that:
- Creates a temp git repo
- Runs cj init with preset selection
- Verifies all files created
- Runs cj doctor
- Runs a review (mock providers) and checks reviews.db
```

---

### Task 15: Build & Distribution

**Claude Code Prompt:**

```
Set up the build and distribution pipeline:

1. Root package.json:
   - "bin": { "cj": "packages/cli/dist/index.js", "codejury": "packages/cli/dist/index.js" }
   - Build: turbo run build (tsup for each package)
   - The CLI package bundles core as a dependency
   - The TUI package is a dependency of CLI (lazy-loaded when cj tui is invoked)

2. packages/cli/tsup.config.ts:
   - Entry: src/index.ts
   - Format: cjs (for widest node compatibility)
   - Bundle dependencies (include @codejury/core and @codejury/tui in the bundle)
   - External: better-sqlite3 (native addon, can't bundle)
   - Add shebang: #!/usr/bin/env node

3. Publishing:
   - Package name: codejury on npm
   - Include only dist/ in published package
   - Post-install script: check node version >= 22, warn if <22
   - Package includes bin/cj and bin/codejury symlinks

4. Shell completions:
   - Generate bash/zsh/fish completions from commander config
   - Include in package as completions/ directory
   - cj completions install — adds to user's shell rc file

5. README.md:
   - Quick start: install → init → review
   - Expert setup: how to install each CLI
   - Configuration reference
   - CI/CD setup
   - Contributing guide

Test: npm pack, install globally from tarball, run cj --version, cj doctor, cj init.
```

---

### Task 16: End-to-End Integration Test

**Claude Code Prompt:**

```
Write a comprehensive E2E test that validates the full CodeJury pipeline:

1. Setup:
   - Create a temp directory with a git repo
   - Add TypeScript files with known issues:
     a) SQL injection vulnerability (should trigger critical security finding)
     b) N+1 query pattern (should trigger performance warning)
     c) Missing error handling (should trigger correctness error)
     d) 200-line function (should trigger maintainability warning)
   - Commit the files, create a branch, make the problematic changes, commit again

2. Test flow:
   - Run cj init --preset balanced (non-interactive, use env vars for config)
   - Mock all providers to return predetermined findings (use nock or msw for HTTP, mock spawn for CLI)
   - Run cj review --branch test-branch --format json
   - Parse JSON output
   - Assert:
     a) Correct number of deduplicated findings
     b) SQL injection has agreement_score 1.0 (all experts flagged it)
     c) Verdict is request_changes (critical finding present)
     d) Cost breakdown is present and reasonable
     e) Expert metadata shows all 4 experts contributed

3. TUI smoke test:
   - Use ink-testing-library to render the Dashboard screen
   - Verify it shows the review from step 2
   - Navigate to ReviewDetail, verify findings are listed
   - Navigate to FindingInspector, verify expert breakdown is shown

4. CI simulation:
   - Run cj review with --ci flag
   - Verify exit code is 1 (request_changes)
   - Run with --fail-on-severity critical, verify exit code 1
   - Run with --fail-on-severity error (no errors match), verify exit code 0

This test validates the entire stack end-to-end. It should run in CI on every PR to codejury itself.
```

---

## Root CLAUDE.md Template

```markdown
# CodeJury

Autonomous mixture-of-experts code review agent.

## Architecture

Monorepo with 4 packages:
- `@codejury/core` — Git integration, provider abstraction, synthesis engine, report formatters
- `@codejury/cli` — CLI entry point, subcommand routing
- `@codejury/tui` — Ink (React for terminal) interactive UI
- `@codejury/ci` — GitHub Action + GitLab CI templates

## Conventions

- TypeScript strict mode, all packages
- Zod for all runtime validation (configs, API responses, findings)
- Result-based error handling: never throw in core/provider code, return Result<T, Error>
- Tests co-located: `foo.ts` → `foo.test.ts`, run with vitest
- No classes except for DB repositories — prefer functions and plain objects
- Providers are async generators that yield findings as they parse CLI output

## Key Types

- `Finding` — single code review finding from one expert
- `ReviewPayload` — git diff + context sent to experts  
- `SynthesizedReport` — merged, deduplicated report with consensus metadata
- `ExpertProvider` — interface all providers implement
- `GitScope` — discriminated union of review scope types

## Commands

- `npm run build` — build all packages
- `npm run test` — run all tests
- `npm run dev:tui` — run TUI with hot reload
- `npm run dev:cli` — run CLI in watch mode

## Provider Implementation

When implementing a new provider:
1. Extend base provider in `packages/core/src/providers/base.ts`
2. Implement `review()` as an async generator yielding `Finding` objects
3. Validate all findings with `findingSchema` (Zod) before yielding
4. Register in `packages/core/src/providers/registry.ts`
5. Add CLI detection in `packages/cli/src/commands/doctor.ts`
```
