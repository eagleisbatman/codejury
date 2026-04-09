# codejury

Autonomous mixture-of-experts code review agent. Orchestrates multiple AI models in parallel — each independently reviews your code, then a synthesis engine merges findings into a deduplicated, severity-ranked report with consensus scores.

No single model catches everything. CodeJury treats Claude, Gemini, OpenAI, and Ollama as specialist jurors, then synthesizes a verdict.

## How it works

```
Your code changes
       |
       v
  +---------+  +---------+  +---------+  +---------+
  | Claude  |  | Gemini  |  | OpenAI  |  | Ollama  |
  | (tools) |  | (tools) |  | (tools) |  | (tools) |
  +---------+  +---------+  +---------+  +---------+
       |            |            |            |
       v            v            v            v
  Deduplicate -> Consensus scoring -> Calibration filter
       |
       v
  Synthesized report (findings, verdict, expert agreement)
       |
       v
  Self-improving memory (learns from accept/dismiss signals)
```

Each expert is a full **agentic loop** — not a single prompt-response. Agents read files, search code, check git history, follow imports, and call `report_finding` for each issue they discover. They have access to 10 tools and per-project memory that persists across reviews.

## Install

```bash
# From source
git clone https://github.com/eagleisbatman/codejury.git
cd codejury
npm install
npm run build
cd packages/cli && npm link
```

## Quick start

```bash
# 1. Go to any git repo and run the setup wizard
cd /path/to/your/project
cj init
```

The wizard walks you through everything:
- **API keys** — prompts for each provider key (stored in `~/.config/codejury/credentials`, never in your repo). Shows where to get each key.
- **Expert selection** — pick which AI models to use. Shows which ones are already available.
- **Model selection** — choose specific model versions (e.g., Claude Sonnet vs Opus, Gemini Pro vs Flash).
- **Strategy** — Full Panel (thorough), Routed (balanced), or Cascading (cheap).
- **Doctor check** — verifies everything works before your first review.

```bash
# 2. Review code
cj review                              # staged changes (default)
cj review --branch feature/auth        # full branch diff
cj review --diff HEAD~3..HEAD          # last 3 commits
cj review --files src/auth.ts          # specific files
cj review --format html -o report.html # save as HTML

# 3. Launch interactive TUI
cj
```

### Already have API keys?

```bash
# Skip the wizard — set keys directly
cj keys set claude              # interactive (masked input)
cj keys set gemini AIzaSy...    # inline
cj keys list                    # see what's configured

# Quick init with a preset
cj init --preset balanced --skip-keys
```

## Commands

```
cj review [options]   Run a code review
cj init [options]     Initialize CodeJury in a repository
cj doctor             Check expert provider availability
cj history            List past reviews
cj keys               Manage API keys
cj config             View/edit configuration
cj learn              Learning system status and controls
cj tui                Launch interactive terminal UI
```

### Review options

```
--branch <name>       Review branch diff vs default branch
--diff <range>        Review a commit range (e.g., HEAD~3..HEAD)
--pr <url>            Review a pull request by URL
--files <paths...>    Review specific files
--experts <ids>       Comma-separated expert IDs
-f, --format <fmt>    Output: json, markdown, sarif, html, github
-o, --output <file>   Write report to file
-p, --project <path>  Target a different project directory
```

Exit codes: `0` = approve, `1` = request_changes, `2` = error.

## Expert providers

| Provider | SDK | Default model | Strengths |
|----------|-----|---------------|-----------|
| Claude | `@anthropic-ai/sdk` | claude-sonnet-4-20250514 | Architecture, security |
| Gemini | `@google/genai` | gemini-2.5-pro | Large context, cross-file patterns |
| OpenAI | `openai` | codex-mini | Correctness, test gaps |
| Ollama | `ollama` | qwen2.5-coder:32b | Privacy, zero cost, local |

All providers are **agentic** — they run multi-turn tool-use loops, not single prompts. Each agent has access to:

| Tool | What it does |
|------|-------------|
| `read_file` | Read file contents with line numbers |
| `search_files` | Glob pattern file search |
| `grep` | Regex content search |
| `list_directory` | List directory contents |
| `git_blame` | Line-level blame (who, when) |
| `git_log` | Recent commit history |
| `get_dependencies` | Extract imports/requires |
| `report_finding` | Submit a validated finding |
| `read_memory` | Read project memory from past reviews |
| `write_memory` | Write observations for future reviews |

## Configuration

```bash
cj init --preset balanced    # creates .codejury/config.toml
```

Presets: `balanced`, `security-first`, `cost-conscious`, `full-panel`.

Key config sections in `.codejury/config.toml`:

```toml
[experts]
enabled = ["claude", "gemini", "ollama"]

[experts.claude]
model = "claude-sonnet-4-20250514"
timeout = 120
focus = ["security", "maintainability"]

[synthesis]
strategy = "full_panel"     # full_panel | routed | cascading
dedup_threshold = 0.75

[cost]
budget_per_review = 0.50
budget_monthly = 20
prefer_free_tier = true
```

## Self-improving learning system

CodeJury gets better with every review. When you accept or dismiss findings (via TUI or `cj feedback`), the system:

1. **Calibrates** — tracks acceptance rates per (expert, category, severity). Findings from consistently-dismissed combinations are automatically downranked.
2. **Reflects** — analyzes what worked and what didn't after each review, stores observations.
3. **Discovers patterns** — mines accepted findings to identify reusable review patterns (Voyager-style skill library). Patterns with high success rates are injected into future review prompts.
4. **Compresses** — periodically distills episodic data into semantic observations, keeping memory bounded.

```bash
cj learn status     # show calibration, patterns, episodes
cj learn compress   # force compression
cj learn reset      # reset all learning data
```

## TUI

Launch with `cj` (no arguments) or `cj tui`.

### User flow

```
Dashboard (home screen)
  |
  |-- n        → Start new review → Review Progress (live agent activity)
  |                                    |
  |                                    → auto-transitions to Review Detail when done
  |
  |-- Enter    → Open past review  → Review Detail (findings list)
  |                                    |
  |                                    |-- Enter → Finding Inspector (full detail, fix, copy)
  |                                    |-- m     → Consensus Map (expert agreement matrix)
  |                                    |-- Tab   → Cycle per-expert filter
  |
  |-- 2        → Expert Panel (provider status, test connections)
  |-- 3        → History (search past reviews, sort by date/findings/cost)
  |-- 4        → Config (view settings, e to edit in $EDITOR)
  |-- ?        → Help overlay (all keybindings)
  |-- q        → Quit
```

### Screens

| Screen | What you see | Key actions |
|--------|-------------|-------------|
| **Dashboard** | Recent reviews with verdict/severity counts, expert health status bar, total cost | `n` new review, `Enter` open, `j/k` navigate |
| **Review Progress** | Per-expert progress bars, live finding stream as agents discover issues, synthesis status | `Esc` back (auto-navigates to detail when done) |
| **Review Detail** | All findings sorted by severity, expert attribution dots, agreement percentage | `Enter` inspect, `Tab` filter by expert, `m` consensus map |
| **Finding Inspector** | Full description, suggested code fix, dissenting expert views, severity votes | `c` copy fix to clipboard, `a` accept, `d` dismiss |
| **Consensus Map** | Matrix: findings × experts, showing who flagged what, with agreement stats | `Esc` back |
| **Expert Panel** | Each provider with status (ready/offline), configured model, focus areas | `t` test connection, `j/k` navigate |
| **History** | All past reviews with date, branch, verdict, severity counts, cost | `/` search, `s` sort, `Enter` open |
| **Config** | TOML config displayed with sections (experts, synthesis, cost, rules) | `e` open in $EDITOR |

## Output formats

| Format | Use case |
|--------|----------|
| `markdown` | Terminal display, PR descriptions |
| `json` | CI pipelines, programmatic consumption |
| `sarif` | GitHub code scanning, IDE integration |
| `html` | Shareable standalone report (dark theme) |
| `github` | Inline PR review comments via Octokit |

## CI/CD

### GitHub Actions

```yaml
- uses: codejury/review-action@v1
  with:
    experts: claude,gemini
    fail_on_severity: critical
    format: sarif
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

### GitLab CI

```yaml
codejury_review:
  stage: test
  script:
    - npx codejury review --format sarif > report.sarif
  artifacts:
    reports:
      codequality: report.sarif
```

## Architecture

```
codejury/
  packages/
    core/           # Engine: types, config, git, providers, synthesis,
                    # reports, DB, orchestrator, agent loop, learning
    cli/            # CLI: commander, 8 commands
    tui/            # Ink TUI: 8 screens, 5 components, 3 hooks
    ci/             # GitHub Action + GitLab CI templates
```

Key design decisions:
- **AsyncGenerator orchestrator** — `runReview()` yields `ReviewEvent` objects consumed by both CLI and TUI
- **Generic AgentLoop + SDKAdapter** — one loop engine, thin format adapters per SDK
- **Result-based errors** — core never throws, returns `Result<T, E>`
- **Per-project memory** — `.codejury/memory/` persists across reviews
- **SQLite** — review history, trajectories, feedback, calibration, patterns all in `.codejury/reviews.db`

## Development

```bash
npm install          # install all dependencies
npm run build        # build all packages
npm run test         # run all tests (236 across 28 test files)
npm run dev:cli      # CLI in watch mode
npm run dev:tui      # TUI with hot reload
```

## License

MIT
