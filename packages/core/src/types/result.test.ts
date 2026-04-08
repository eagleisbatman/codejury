import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, unwrap, unwrapOr, fromPromise } from './result.js';

describe('Result', () => {
  it('ok() creates a success result', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('err() creates a failure result', () => {
    const result = err(new Error('fail'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('fail');
  });

  it('isOk() narrows to success', () => {
    const result = ok('hello');
    if (isOk(result)) {
      expect(result.value).toBe('hello');
    } else {
      expect.unreachable();
    }
  });

  it('isErr() narrows to failure', () => {
    const result = err('nope');
    if (isErr(result)) {
      expect(result.error).toBe('nope');
    } else {
      expect.unreachable();
    }
  });

  it('unwrap() returns value on success', () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it('unwrap() throws on failure', () => {
    expect(() => unwrap(err(new Error('boom')))).toThrow('boom');
  });

  it('unwrapOr() returns value on success', () => {
    expect(unwrapOr(ok(42), 0)).toBe(42);
  });

  it('unwrapOr() returns fallback on failure', () => {
    expect(unwrapOr(err(new Error('fail')), 0)).toBe(0);
  });
});

describe('fromPromise', () => {
  it('wraps resolved promise as ok', async () => {
    const result = await fromPromise(Promise.resolve(42));
    expect(isOk(result)).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('wraps rejected promise as err', async () => {
    const result = await fromPromise(Promise.reject(new Error('fail')));
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error.message).toBe('fail');
  });

  it('wraps non-Error rejection as Error', async () => {
    const result = await fromPromise(Promise.reject('string error'));
    expect(isErr(result)).toBe(true);
    if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  });
});
