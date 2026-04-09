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
# 1. Set up API keys (stored in ~/.config/codejury/credentials)
cj keys set claude      # interactive prompt
cj keys set gemini AIzaSy...

# 2. Initialize in any git repo
cd /path/to/your/project
cj init

# 3. Review code
cj review                              # staged changes (default)
cj review --branch feature/auth        # full branch diff
cj review --diff HEAD~3..HEAD          # last 3 commits
cj review --files src/auth.ts          # specific files
cj review --format html -o report.html # save as HTML

# 4. Launch interactive TUI
cj
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

Launch with `cj` (no arguments) or `cj tui`. 8 screens:

- **Dashboard** — recent reviews, expert health, cost
- **Review Progress** — live agent activity (tool calls, findings stream)
- **Review Detail** — findings list, Tab to filter by expert, severity summary
- **Finding Inspector** — full detail, suggested fix (c to copy), dissenting views
- **Consensus Map** — expert agreement matrix
- **Expert Panel** — provider status, models, test connections
- **History** — searchable review list with sort
- **Config** — read-only view, e to open in $EDITOR

Keyboard: `j/k` navigate, `Enter` select, `Esc` back, `?` help, `q` quit.

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
