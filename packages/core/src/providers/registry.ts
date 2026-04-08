import type { ExpertProvider, ExpertConfig } from '../types/index.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { ProviderError } from '../types/provider.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { OpenAIProvider } from './openai.js';
import { OllamaProvider } from './ollama.js';

type ProviderFactory = (config: ExpertConfig) => ExpertProvider;

const BUILT_IN_PROVIDERS: Record<string, ProviderFactory> = {
  claude: (c) => new AnthropicProvider(c),
  gemini: (c) => new GoogleProvider(c),
  openai: (c) => new OpenAIProvider(c),
  ollama: (c) => new OllamaProvider(c),
};

export function createProvider(
  id: string,
  config: ExpertConfig,
): Result<ExpertProvider, ProviderError> {
  const factory = BUILT_IN_PROVIDERS[id];
  if (!factory) {
    return err(
      new ProviderError('unknown', `Unknown provider: "${id}"`, id),
    );
  }
  try {
    return ok(factory(config));
  } catch (e) {
    return err(
      new ProviderError(
        'unknown',
        `Failed to create provider "${id}": ${e instanceof Error ? e.message : String(e)}`,
        id,
        e instanceof Error ? e : undefined,
      ),
    );
  }
}

export function listProviderIds(): string[] {
  return Object.keys(BUILT_IN_PROVIDERS);
}

export interface ProviderDiscovery {
  id: string;
  available: boolean;
  error?: string;
}

export async function discoverAvailableProviders(
  configs: Record<string, ExpertConfig>,
): Promise<ProviderDiscovery[]> {
  const results: ProviderDiscovery[] = [];

  for (const id of Object.keys(BUILT_IN_PROVIDERS)) {
    const config = configs[id];
    if (!config) {
      results.push({ id, available: false, error: 'No config' });
      continue;
    }
    const providerResult = createProvider(id, config);
    if (!providerResult.ok) {
      results.push({ id, available: false, error: providerResult.error.message });
      continue;
    }
    const available = await providerResult.value.isAvailable();
    results.push({
      id,
      available: available.ok,
      error: available.ok ? undefined : available.error.message,
    });
  }

  return results;
}
