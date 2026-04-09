import { Command } from 'commander';
import chalk from 'chalk';
import { password } from '@inquirer/prompts';
import { setApiKey, removeApiKey, listApiKeys, CREDENTIALS_FILE, KEY_MAP } from '@codejury/core';

const keysListCommand = new Command('list')
  .description('Show configured API keys (masked)')
  .action(async () => {
    const keys = await listApiKeys();

    console.log(chalk.bold('  API Keys\n'));
    for (const k of keys) {
      const sourceTag = k.source === 'env' ? chalk.dim('env')
        : k.source === 'credentials' ? chalk.dim('file')
        : chalk.red('missing');

      const status = k.source !== 'none'
        ? chalk.green('✓')
        : chalk.red('✗');

      console.log(`  ${status} ${k.provider.padEnd(10)} ${k.masked.padEnd(24)} ${sourceTag}`);
    }

    console.log(chalk.dim(`\n  Credentials file: ${CREDENTIALS_FILE}`));
    console.log(chalk.dim('  Env vars override credentials file.'));
  });

const keysSetCommand = new Command('set')
  .description('Set an API key for a provider')
  .argument('<provider>', `Provider name: ${Object.keys(KEY_MAP).join(', ')}`)
  .argument('[key]', 'API key (omit to enter interactively)')
  .action(async (provider: string, key?: string) => {
    if (!key) {
      key = await password({
        message: `Enter API key for ${provider}:`,
        mask: '*',
      });
    }

    if (!key) {
      console.error(chalk.red('No key provided.'));
      process.exit(1);
    }

    const result = await setApiKey(provider, key);
    if (result.ok) {
      console.log(chalk.green(`  ✓ ${provider} API key saved to ${CREDENTIALS_FILE}`));
    } else {
      console.error(chalk.red(`  ✗ ${result.error.message}`));
      process.exit(1);
    }
  });

const keysRemoveCommand = new Command('remove')
  .description('Remove an API key for a provider')
  .argument('<provider>', 'Provider name')
  .action(async (provider: string) => {
    const result = await removeApiKey(provider);
    if (result.ok) {
      console.log(chalk.green(`  ✓ ${provider} API key removed.`));
    } else {
      console.error(chalk.red(`  ✗ ${result.error.message}`));
    }
  });

export const keysCommand = new Command('keys')
  .description('Manage API keys for expert providers')
  .addHelpText('after', `
Keys are stored in ${CREDENTIALS_FILE}
Environment variables take priority over stored keys.

Examples:
  $ cj keys list                    Show all configured keys
  $ cj keys set claude              Set Claude key (interactive)
  $ cj keys set gemini AIza...      Set Gemini key directly
  $ cj keys remove openai           Remove OpenAI key`)
  .addCommand(keysListCommand)
  .addCommand(keysSetCommand)
  .addCommand(keysRemoveCommand);
