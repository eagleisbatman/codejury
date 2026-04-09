import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { type Result, ok, err } from '../types/result.js';

const CREDENTIALS_DIR = join(homedir(), '.config', 'codejury');
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials');

const KEY_MAP: Record<string, string> = {
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
};

const ENV_ALIASES: Record<string, string[]> = {
  ANTHROPIC_API_KEY: ['ANTHROPIC_API_KEY'],
  GEMINI_API_KEY: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  OPENAI_API_KEY: ['OPENAI_API_KEY'],
};

interface Credentials {
  [envVar: string]: string;
}

async function readCredentials(): Promise<Credentials> {
  try {
    const content = await readFile(CREDENTIALS_FILE, 'utf-8');
    const creds: Credentials = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key && value) creds[key] = value;
    }
    return creds;
  } catch {
    return {};
  }
}

async function writeCredentials(creds: Credentials): Promise<void> {
  await mkdir(CREDENTIALS_DIR, { recursive: true });
  const lines = [
    '# CodeJury API credentials',
    '# This file is read by cj. Do NOT commit this file.',
    '',
  ];
  for (const [key, value] of Object.entries(creds)) {
    lines.push(`${key}=${value}`);
  }
  await writeFile(CREDENTIALS_FILE, lines.join('\n') + '\n', { mode: 0o600 });
}

/**
 * Get an API key for a provider. Checks:
 * 1. Environment variables
 * 2. ~/.config/codejury/credentials file
 */
export async function getApiKey(provider: string): Promise<string | null> {
  const envVar = KEY_MAP[provider];
  if (!envVar) return null;

  // Check env vars first
  const aliases = ENV_ALIASES[envVar] ?? [envVar];
  for (const alias of aliases) {
    if (process.env[alias]) return process.env[alias]!;
  }

  // Fall back to credentials file
  const creds = await readCredentials();
  return creds[envVar] ?? null;
}

/**
 * Load all credentials into process.env so providers can find them.
 * Call this once at startup.
 */
export async function loadCredentialsIntoEnv(): Promise<void> {
  const creds = await readCredentials();
  for (const [key, value] of Object.entries(creds)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Set an API key for a provider.
 */
export async function setApiKey(provider: string, key: string): Promise<Result<true>> {
  const envVar = KEY_MAP[provider];
  if (!envVar) {
    return err(new Error(`Unknown provider: "${provider}". Valid: ${Object.keys(KEY_MAP).join(', ')}`));
  }
  const creds = await readCredentials();
  creds[envVar] = key;
  await writeCredentials(creds);
  process.env[envVar] = key;
  return ok(true);
}

/**
 * Remove an API key for a provider.
 */
export async function removeApiKey(provider: string): Promise<Result<true>> {
  const envVar = KEY_MAP[provider];
  if (!envVar) {
    return err(new Error(`Unknown provider: "${provider}".`));
  }
  const creds = await readCredentials();
  delete creds[envVar];
  await writeCredentials(creds);
  delete process.env[envVar];
  return ok(true);
}

/**
 * List all configured keys (masked).
 */
export async function listApiKeys(): Promise<Array<{ provider: string; envVar: string; source: 'env' | 'credentials' | 'none'; masked: string }>> {
  const creds = await readCredentials();
  const result: Array<{ provider: string; envVar: string; source: 'env' | 'credentials' | 'none'; masked: string }> = [];

  for (const [provider, envVar] of Object.entries(KEY_MAP)) {
    const aliases = ENV_ALIASES[envVar] ?? [envVar];
    let source: 'env' | 'credentials' | 'none' = 'none';
    let value = '';

    for (const alias of aliases) {
      if (process.env[alias]) { source = 'env'; value = process.env[alias]!; break; }
    }
    if (source === 'none' && creds[envVar]) {
      source = 'credentials';
      value = creds[envVar]!;
    }

    const masked = value
      ? value.slice(0, 8) + '...' + value.slice(-4)
      : '(not set)';

    result.push({ provider, envVar, source, masked });
  }

  return result;
}

export { CREDENTIALS_DIR, CREDENTIALS_FILE, KEY_MAP };
