import { Command } from 'commander';
import { resolve } from 'node:path';
import { loadCredentialsIntoEnv } from '@codejury/core';
import { reviewCommand } from './commands/review.js';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { historyCommand } from './commands/history.js';
import { configCommand } from './commands/config.js';
import { keysCommand } from './commands/keys.js';
import { learnCommand } from './commands/learn.js';

// Load credentials from ~/.config/codejury/credentials before anything else
await loadCredentialsIntoEnv();

const program = new Command()
  .name('cj')
  .description('CodeJury — Autonomous Mixture-of-Experts Code Review Agent')
  .version('0.1.0')
  .option('-p, --project <path>', 'Path to project directory (default: current directory)')
  .option('--verbose', 'Enable verbose output')
  .option('--no-color', 'Disable colored output')
  .option('--json', 'Output in JSON format')
  .hook('preAction', (thisCommand) => {
    // Resolve --project to an absolute path and set as working dir for all commands
    const projectPath = thisCommand.opts()['project'] as string | undefined;
    if (projectPath) {
      const resolved = resolve(projectPath);
      process.env['CJ_PROJECT_DIR'] = resolved;
    } else {
      process.env['CJ_PROJECT_DIR'] = process.cwd();
    }
  });

program.addCommand(reviewCommand);
program.addCommand(initCommand);
program.addCommand(doctorCommand);
program.addCommand(historyCommand);
program.addCommand(learnCommand);
program.addCommand(configCommand);
program.addCommand(keysCommand);

// Explicit `tui` subcommand
program
  .command('tui')
  .description('Launch the interactive terminal UI')
  .action(async () => {
    await launchTui();
  });

// If TTY and no subcommand → launch TUI
program.action(async () => {
  if (process.stdout.isTTY) {
    await launchTui();
  } else {
    program.help();
  }
});

async function launchTui(): Promise<void> {
  try {
    const ink = await import('ink');
    const { default: App } = await import('@codejury/tui');
    const react = await import('react');
    ink.render(react.createElement(App));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Cannot find')) {
      console.error('TUI dependencies not found. Install: npm install ink react @codejury/tui');
    } else {
      console.error(`Failed to launch TUI: ${msg}`);
    }
    process.exit(1);
  }
}

program.parse();
