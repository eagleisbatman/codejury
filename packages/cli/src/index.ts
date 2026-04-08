import { Command } from 'commander';
import { reviewCommand } from './commands/review.js';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { historyCommand } from './commands/history.js';
import { configCommand } from './commands/config.js';

const program = new Command()
  .name('cj')
  .description('CodeJury — Autonomous Mixture-of-Experts Code Review Agent')
  .version('0.1.0')
  .option('--verbose', 'Enable verbose output')
  .option('--no-color', 'Disable colored output')
  .option('--json', 'Output in JSON format');

program.addCommand(reviewCommand);
program.addCommand(initCommand);
program.addCommand(doctorCommand);
program.addCommand(historyCommand);
program.addCommand(configCommand);

// If TTY and no subcommand, launch TUI
program.action(async () => {
  if (process.stdout.isTTY) {
    try {
      const { renderTui } = await import('./tui-launcher.js');
      await renderTui();
    } catch {
      program.help();
    }
  } else {
    program.help();
  }
});

program.parse();
