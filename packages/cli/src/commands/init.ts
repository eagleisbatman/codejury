import { Command } from 'commander';
import { select, confirm, password, checkbox } from '@inquirer/prompts';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import chalk from 'chalk';
import {
  PROJECT_DIR,
  setApiKey,
  listApiKeys,
  discoverAvailableProviders,
  DEFAULT_CONFIG,
} from '@codejury/core';
import { getProjectDir } from '../project-dir.js';

const MODELS: Record<string, Array<{ value: string; label: string }>> = {
  claude: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (recommended — fast, capable)' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (most capable, slower, 5x cost)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest, cheapest)' },
  ],
  gemini: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (recommended — large context)' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (faster, cheaper)' },
  ],
  openai: [
    { value: 'codex-mini', label: 'Codex Mini (recommended — code-focused)' },
    { value: 'gpt-4.1', label: 'GPT-4.1 (general purpose)' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (faster, cheaper)' },
  ],
  ollama: [
    { value: 'qwen2.5-coder:32b', label: 'Qwen 2.5 Coder 32B (recommended)' },
    { value: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B (lighter)' },
    { value: 'deepseek-coder:6.7b', label: 'DeepSeek Coder 6.7B' },
    { value: 'codellama:13b', label: 'Code Llama 13B' },
  ],
};

const KEY_URLS: Record<string, string> = {
  claude: 'https://console.anthropic.com/settings/keys',
  gemini: 'https://aistudio.google.com/apikey',
  openai: 'https://platform.openai.com/api-keys',
};

function generateToml(
  projectName: string,
  experts: string[],
  models: Record<string, string>,
  strategy: string,
): string {
  const expertSections = Object.entries(models)
    .map(([id, model]) => {
      const defaults = DEFAULT_CONFIG.experts[id as keyof typeof DEFAULT_CONFIG.experts];
      const focus = defaults && typeof defaults === 'object' && 'focus' in defaults
        ? (defaults as { focus: string[] }).focus
        : [];
      const timeout = defaults && typeof defaults === 'object' && 'timeout' in defaults
        ? (defaults as { timeout: number }).timeout
        : 120;
      return `[experts.${id}]
model = "${model}"
timeout = ${timeout}
focus = [${focus.map((f) => `"${f}"`).join(', ')}]`;
    })
    .join('\n\n');

  return `[project]
name = "${projectName}"
default_branch = "main"

[experts]
enabled = [${experts.map((e) => `"${e}"`).join(', ')}]

${expertSections}

[synthesis]
strategy = "${strategy}"
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
  .description('Set up CodeJury in a repository (API keys, experts, config)')
  .option('--preset <name>', 'Skip wizard, use preset: balanced, security-first, cost-conscious, full-panel')
  .option('--skip-keys', 'Skip API key setup')
  .action(async (opts) => {
    const cwd = getProjectDir();
    const projectDir = join(cwd, PROJECT_DIR);
    const projectName = basename(cwd) || 'project';

    console.log('');
    console.log(chalk.bold('  codejury setup'));
    console.log(chalk.dim(`  ${cwd}`));
    console.log('');

    // Check if already initialized
    try {
      await access(projectDir);
      const proceed = await confirm({
        message: '.codejury/ already exists. Reconfigure?',
        default: false,
      });
      if (!proceed) return;
    } catch {
      // Fresh setup
    }

    // ── Step 1: API Keys ──
    if (!opts.skipKeys) {
      console.log(chalk.bold('  Step 1: API Keys'));
      console.log(chalk.dim('  Keys are stored in ~/.config/codejury/credentials (never in the repo)'));
      console.log('');

      const existingKeys = await listApiKeys();

      for (const k of existingKeys) {
        if (k.source !== 'none') {
          console.log(`  ${chalk.green('✓')} ${k.provider.padEnd(8)} ${chalk.dim(k.masked)} (${k.source})`);
        } else {
          const url = KEY_URLS[k.provider];
          const shouldSet = await confirm({
            message: `Set up ${k.provider}?${url ? chalk.dim(` (get key: ${url})`) : ''}`,
            default: false,
          });
          if (shouldSet) {
            const key = await password({ message: `  ${k.provider} API key:`, mask: '*' });
            if (key) {
              const result = await setApiKey(k.provider, key);
              if (result.ok) {
                console.log(`  ${chalk.green('✓')} ${k.provider} key saved`);
              } else {
                console.log(`  ${chalk.red('✗')} ${result.error.message}`);
              }
            }
          } else {
            console.log(`  ${chalk.dim('–')} ${k.provider} skipped`);
          }
        }
      }
      console.log('');
    }

    // ── Step 2: Choose experts ──
    console.log(chalk.bold('  Step 2: Expert Panel'));
    console.log('');

    let enabledExperts: string[];
    let selectedModels: Record<string, string> = {};
    let strategy: string;

    if (opts.preset) {
      const presets: Record<string, { experts: string[]; strategy: string }> = {
        balanced: { experts: ['claude', 'gemini', 'ollama'], strategy: 'routed' },
        'security-first': { experts: ['claude', 'ollama'], strategy: 'full_panel' },
        'cost-conscious': { experts: ['ollama'], strategy: 'cascading' },
        'full-panel': { experts: ['claude', 'gemini', 'openai', 'ollama'], strategy: 'full_panel' },
      };
      const p = presets[opts.preset as string];
      if (!p) {
        console.error(chalk.red(`  Unknown preset: "${opts.preset}". Use: ${Object.keys(presets).join(', ')}`));
        process.exit(1);
      }
      enabledExperts = p.experts;
      strategy = p.strategy;
      for (const e of enabledExperts) {
        selectedModels[e] = MODELS[e]?.[0]?.value ?? '';
      }
      console.log(chalk.dim(`  Using preset: ${opts.preset}`));
    } else {
      // Check which providers have keys
      const discoveries = await discoverAvailableProviders({
        claude: DEFAULT_CONFIG.experts.claude,
        gemini: DEFAULT_CONFIG.experts.gemini,
        openai: DEFAULT_CONFIG.experts.openai,
        ollama: DEFAULT_CONFIG.experts.ollama,
      });

      const available = discoveries.filter((d) => d.available).map((d) => d.id);

      enabledExperts = await checkbox({
        message: 'Which experts should review your code?',
        choices: [
          { value: 'claude', name: `Claude${available.includes('claude') ? chalk.green(' (ready)') : chalk.red(' (no key)')}`, checked: available.includes('claude') },
          { value: 'gemini', name: `Gemini${available.includes('gemini') ? chalk.green(' (ready)') : chalk.red(' (no key)')}`, checked: available.includes('gemini') },
          { value: 'openai', name: `OpenAI${available.includes('openai') ? chalk.green(' (ready)') : chalk.red(' (no key)')}`, checked: false },
          { value: 'ollama', name: `Ollama${available.includes('ollama') ? chalk.green(' (running)') : chalk.red(' (not running)')}`, checked: available.includes('ollama') },
        ],
      });

      if (enabledExperts.length === 0) {
        console.log(chalk.yellow('  No experts selected. You need at least one.'));
        enabledExperts = available.length > 0 ? [available[0]!] : ['gemini'];
        console.log(chalk.dim(`  Defaulting to: ${enabledExperts[0]}`));
      }

      // ── Step 3: Choose models ──
      console.log('');
      console.log(chalk.bold('  Step 3: Models'));
      console.log('');

      for (const expertId of enabledExperts) {
        const models = MODELS[expertId];
        if (!models || models.length <= 1) {
          selectedModels[expertId] = models?.[0]?.value ?? '';
          if (models?.[0]) console.log(`  ${expertId}: ${chalk.dim(models[0].value)}`);
          continue;
        }

        const model = await select({
          message: `${expertId} model:`,
          choices: models.map((m) => ({ value: m.value, name: m.label })),
        });
        selectedModels[expertId] = model;
      }

      // ── Step 4: Strategy ──
      console.log('');
      strategy = await select({
        message: 'Review strategy:',
        choices: [
          { value: 'full_panel', name: 'Full Panel — all experts review all changes (thorough, higher cost)' },
          { value: 'routed', name: 'Routed — route files to the best expert per category (balanced)' },
          { value: 'cascading', name: 'Cascading — cheap expert first, escalate if needed (lowest cost)' },
        ],
      });
    }

    // ── Write config ──
    console.log('');
    await mkdir(join(projectDir, 'rules'), { recursive: true });

    const toml = generateToml(projectName, enabledExperts, selectedModels, strategy);
    await writeFile(join(projectDir, 'config.toml'), toml);

    await writeFile(
      join(projectDir, 'rules', 'default.md'),
      `# CodeJury Review Rules\n\n1. Flag any hardcoded secrets or API keys\n2. Warn about functions exceeding 50 lines\n3. Check for missing error handling in async functions\n4. Ensure all public APIs have proper input validation\n5. Flag direct database queries without parameterization\n`,
    );

    await writeFile(join(projectDir, 'sensitive.glob'), `.env*\n*secret*\n*credential*\n*key.pem\nconfig/production/*\n**/secrets/**\n`);
    await writeFile(join(projectDir, '.gitignore'), `reviews.db\nreviews.db-journal\nreviews.db-wal\nmemory/\n`);

    console.log(chalk.green('  ✓') + ' .codejury/ created');
    console.log(chalk.dim(`    experts: ${enabledExperts.join(', ')}`));
    console.log(chalk.dim(`    strategy: ${strategy}`));
    console.log(chalk.dim(`    models: ${Object.values(selectedModels).join(', ')}`));

    // ── Step 5: Verify ──
    console.log('');
    const runDoctor = await confirm({ message: 'Run doctor check?', default: true });
    if (runDoctor) {
      console.log('');
      const verifyResults = await discoverAvailableProviders({
        claude: DEFAULT_CONFIG.experts.claude,
        gemini: DEFAULT_CONFIG.experts.gemini,
        openai: DEFAULT_CONFIG.experts.openai,
        ollama: DEFAULT_CONFIG.experts.ollama,
      });

      for (const d of verifyResults) {
        if (!enabledExperts.includes(d.id)) continue;
        if (d.available) {
          console.log(`  ${chalk.green('✓')} ${d.id} ready`);
        } else {
          console.log(`  ${chalk.red('✗')} ${d.id}: ${d.error}`);
        }
      }

      const readyCount = verifyResults.filter((d) => enabledExperts.includes(d.id) && d.available).length;
      console.log('');
      if (readyCount === enabledExperts.length) {
        console.log(chalk.green(`  All ${readyCount} experts ready.`));
      } else {
        console.log(chalk.yellow(`  ${readyCount}/${enabledExperts.length} experts ready. Run ${chalk.cyan('cj keys set <provider>')} for missing keys.`));
      }
    }

    console.log('');
    console.log(chalk.bold('  Ready to review!'));
    console.log(`  Run ${chalk.cyan('cj review')} to review staged changes`);
    console.log(`  Run ${chalk.cyan('cj')} to launch the interactive TUI`);
    console.log('');
  });
