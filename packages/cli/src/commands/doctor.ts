import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, discoverAvailableProviders } from '@codejury/core';

export const doctorCommand = new Command('doctor')
  .description('Check expert provider availability and API key status')
  .action(async () => {
    const cwd = process.cwd();
    const configResult = await loadConfig(cwd);
    if (!configResult.ok) {
      console.log(chalk.yellow('  No .codejury/config.toml found. Using defaults.'));
      console.log(chalk.dim('  Run `cj init` to create a project config.\n'));
    }

    const config = configResult.ok ? configResult.value : (await import('@codejury/core')).DEFAULT_CONFIG;

    console.log(chalk.bold('  Checking expert providers...\n'));

    const expertConfigs: Record<string, { model: string }> = {
      claude: config.experts.claude,
      gemini: config.experts.gemini,
      openai: config.experts.openai,
      ollama: config.experts.ollama,
    };

    const discoveries = await discoverAvailableProviders(expertConfigs);

    let allGood = true;
    const enabled = config.experts.enabled;

    for (const d of discoveries) {
      const model = expertConfigs[d.id]?.model ?? 'unknown';
      const isEnabled = enabled.includes(d.id);
      const enabledTag = isEnabled ? '' : chalk.dim(' (not in panel)');
      if (d.available) {
        console.log(`  ${chalk.green('✓')} ${d.id.padEnd(12)} ${chalk.green('ready')}    ${chalk.dim(model)}${enabledTag}`);
      } else {
        console.log(`  ${chalk.red('✗')} ${d.id.padEnd(12)} ${chalk.red(d.error ?? 'unavailable')}${enabledTag}`);
        if (isEnabled) allGood = false;
      }
    }

    console.log('');
    if (allGood) {
      console.log(chalk.green(`  All ${enabled.length} panel experts ready. You're good to go!`));
    } else {
      const available = discoveries.filter((d) => d.available && enabled.includes(d.id)).length;
      console.log(
        chalk.yellow(`  ${available}/${enabled.length} panel experts available.`),
      );
      console.log(chalk.dim('  Configure missing API keys or install Ollama for local review.'));
      console.log(chalk.dim('  See: https://codejury.dev/docs/setup'));
    }
  });
