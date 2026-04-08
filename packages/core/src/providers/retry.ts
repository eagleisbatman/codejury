import { type Result, ok, err } from '../types/result.js';
import { ProviderError, type ProviderErrorCode } from '../types/provider.js';

export interface RetryOptions {
  maxRetries: number;
  timeoutMs: number;
  providerId: string;
}

const NON_RETRYABLE_CODES: ProviderErrorCode[] = ['auth_failed', 'model_not_found', 'budget_exceeded'];

function isRetryable(error: ProviderError): boolean {
  return !NON_RETRYABLE_CODES.includes(error.code);
}

export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions,
): Promise<Result<T, ProviderError>> {
  let lastError: ProviderError | null = null;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const result = await fn(controller.signal);
      clearTimeout(timeout);
      return ok(result);
    } catch (e) {
      clearTimeout(timeout);

      const providerError =
        e instanceof ProviderError
          ? e
          : new ProviderError(
              controller.signal.aborted ? 'timeout' : 'unknown',
              e instanceof Error ? e.message : String(e),
              options.providerId,
              e instanceof Error ? e : undefined,
            );

      lastError = providerError;

      if (!isRetryable(providerError) || attempt === options.maxRetries) {
        return err(providerError);
      }

      // Brief delay before retry
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  return err(
    lastError ?? new ProviderError('unknown', 'No attempts made', options.providerId),
  );
}
