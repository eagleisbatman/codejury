import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig, PROJECT_DIR } from '@codejury/core';
import { getProjectDir } from '../project-dir.js';

const configGetCommand = new Command('get')
  .description('Get a config value by dotted key')
  .argument('<key>', 'Config key (e.g., synthesis.strategy, cost.budget_per_review)')
  .addHelpText('after', `
Examples:
  $ cj config get synthesis.strategy
  $ cj config get experts.enabled
  $ cj config get cost.budget_per_review`)
  .action(async (key: string) => {
    const cwd = getProjectDir();
    const configResult = await loadConfig(cwd);
    if (!configResult.ok) {
      console.error(chalk.red(configResult.error.message));
      console.error(chalk.dim('Run `cj init` to create a project config.'));
      process.exit(1);
    }

    const parts = key.split('.');
    let value: unknown = configResult.value;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        console.error(chalk.red(`Key "${key}" not found in config.`));
        console.error(chalk.dim(`Available top-level keys: project, experts, synthesis, output, cost, rules, ci`));
        process.exit(1);
      }
    }

    console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
  });

const configEditCommand = new Command('edit')
  .description('Open config.toml in $EDITOR')
  .action(async () => {
    const cwd = getProjectDir();
    const configPath = join(cwd, PROJECT_DIR, 'config.toml');

    const editor = process.env['EDITOR'] ?? process.env['VISUAL'] ?? (process.platform === 'win32' ? 'notepad' : 'vi');

    try {
      await readFile(configPath);
    } catch {
      console.error(chalk.red('No .codejury/config.toml found. Run `cj init` first.'));
      process.exit(1);
    }

    const child = spawn(editor, [configPath], { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('Config saved.'));
      } else if (code !== null) {
        console.error(chalk.red(`Editor exited with code ${code}.`));
      }
    });
    child.on('error', (err) => {
      console.error(chalk.red(`Failed to open editor "${editor}": ${err.message}`));
      console.error(chalk.dim(`Set $EDITOR to your preferred text editor, or edit manually:\n  ${configPath}`));
      process.exit(1);
    });
  });

export const configCommand = new Command('config')
  .description('Manage CodeJury configuration')
  .addCommand(configGetCommand)
  .addCommand(configEditCommand);
