import { Command } from 'commander';
import { select, confirm } from '@inquirer/prompts';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import { PROJECT_DIR } from '@codejury/core';
import { getProjectDir } from '../project-dir.js';

const PRESETS: Record<string, { description: string; experts: string[]; strategy: string }> = {
  balanced: {
    description: 'Claude + Gemini + Ollama, Routed strategy',
    experts: ['claude', 'gemini', 'ollama'],
    strategy: 'routed',
  },
  'security-first': {
    description: 'Claude + Ollama, Full Panel, strict rules',
    experts: ['claude', 'ollama'],
    strategy: 'full_panel',
  },
  'cost-conscious': {
    description: 'Ollama primary, cloud escalation only',
    experts: ['ollama'],
    strategy: 'cascading',
  },
  'full-panel': {
    description: 'All experts, all changes, maximum coverage',
    experts: ['claude', 'gemini', 'openai', 'ollama'],
    strategy: 'full_panel',
  },
};

function generateToml(preset: string, projectName: string): string {
  const p = PRESETS[preset]!;
  return `[project]
name = "${projectName}"
default_branch = "main"

[experts]
enabled = [${p.experts.map((e) => `"${e}"`).join(', ')}]

[experts.claude]
model = "claude-sonnet-4-20250514"
timeout = 120
focus = ["security", "maintainability"]

[experts.gemini]
model = "gemini-2.5-pro"
timeout = 90
focus = ["performance", "correctness"]

[experts.openai]
model = "codex-mini"
timeout = 90
focus = ["correctness", "test_coverage"]

[experts.ollama]
model = "qwen2.5-coder:32b"
timeout = 60
focus = ["correctness", "style"]

[synthesis]
strategy = "${p.strategy}"
synthesizer = "claude"
dedup_threshold = 0.75

[output]
default_format = "markdown"
severity_threshold = "info"

[cost]
budget_per_review = 0.50
budget_monthly = 20
prefer_free_tier = true

[rules]
custom_rules = [
  "Flag any hardcoded secrets or API keys",
  "Warn about functions exceeding 50 lines",
  "Check for missing error handling in async functions"
]

[ci]
fail_on_severity = "critical"
max_review_time_seconds = 300
`;
}

export const initCommand = new Command('init')
  .description('Initialize CodeJury in the current repository')
  .option('--preset <name>', 'Use a preset (balanced, security-first, cost-conscious, full-panel)')
  .addHelpText('after', `
Presets:
  balanced         Claude + Gemini + Ollama, Routed strategy
  security-first   Claude + Ollama, Full Panel, strict rules
  cost-conscious   Ollama primary, cloud escalation only
  full-panel       All experts, all changes, maximum coverage

Examples:
  $ cj init
  $ cj init --preset balanced`)
  .action(async (opts) => {
    const cwd = getProjectDir();
    const projectDir = join(cwd, PROJECT_DIR);
    const projectName = basename(cwd) || 'project';

    // Check if already initialized
    try {
      await access(projectDir);
      const proceed = await confirm({
        message: `.codejury/ already exists. Reinitialize?`,
        default: false,
      });
      if (!proceed) {
        console.log(chalk.yellow('Aborted.'));
        return;
      }
    } catch {
      // Directory doesn't exist, proceed
    }

    let preset = opts.preset as string | undefined;
    if (!preset) {
      preset = await select({
        message: 'Select review preset:',
        choices: Object.entries(PRESETS).map(([key, val]) => ({
          name: `${key.padEnd(18)} ${chalk.dim(val.description)}`,
          value: key,
        })),
      });
    }

    if (!PRESETS[preset]) {
      console.error(chalk.red(`Unknown preset: "${preset}"`));
      console.error(chalk.dim(`Available presets: ${Object.keys(PRESETS).join(', ')}`));
      process.exit(1);
    }

    // Create directories
    await mkdir(join(projectDir, 'rules'), { recursive: true });

    // Write config
    const toml = generateToml(preset, projectName);
    await writeFile(join(projectDir, 'config.toml'), toml);

    // Write default rules
    await writeFile(
      join(projectDir, 'rules', 'default.md'),
      `# Default CodeJury Review Rules

These rules are injected into every expert's system prompt.

1. Flag any hardcoded secrets or API keys
2. Warn about functions exceeding 50 lines
3. Check for missing error handling in async functions
4. Ensure all public APIs have proper input validation
5. Flag direct database queries without parameterization
`,
    );

    // Write sensitive file patterns
    await writeFile(
      join(projectDir, 'sensitive.glob'),
      `.env*
*secret*
*credential*
*key.pem
config/production/*
**/secrets/**
`,
    );

    // Write .gitignore for the .codejury directory
    await writeFile(
      join(projectDir, '.gitignore'),
      `reviews.db
reviews.db-journal
reviews.db-wal
`,
    );

    console.log('');
    console.log(chalk.green('  ✓') + ' Created .codejury/config.toml');
    console.log(chalk.green('  ✓') + ' Created .codejury/rules/');
    console.log(chalk.green('  ✓') + ' Created .codejury/sensitive.glob');
    console.log(chalk.green('  ✓') + ' Initialized .codejury/.gitignore');
    console.log('');
    console.log(chalk.bold(`  Project initialized with "${preset}" preset!`));
    console.log('');
    console.log(chalk.dim('  Next steps:'));
    console.log(chalk.dim('    1. ') + 'Run ' + chalk.cyan('cj doctor') + ' to verify expert availability');
    console.log(chalk.dim('    2. ') + 'Run ' + chalk.cyan('cj review') + ' to start your first review');
  });
