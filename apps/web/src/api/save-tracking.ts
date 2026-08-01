import { useSaveStatusStore } from '../stores/saveStatusStore';

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Returns a copy of `api` whose listed methods report to the save-status store
 * (pendingCount / lastError). Results and throw/rejection semantics pass
 * through unchanged — including the demo client's synchronous throws.
 * Only content mutations belong in the allowlist; never track reads.
 */
export function trackMutations<T extends object>(
  api: T,
  methods: ReadonlyArray<keyof T & string>
): T {
  const wrapped = { ...api };
  for (const name of methods) {
    const original = api[name];
    if (typeof original !== 'function') continue;
    const fn = original as (...args: unknown[]) => unknown;
    (wrapped as Record<string, unknown>)[name] = (...args: unknown[]): unknown => {
      const { beginSave, endSave } = useSaveStatusStore.getState();
      beginSave();
      let result: unknown;
      try {
        result = fn.apply(api, args);
      } catch (error) {
        endSave(error);
        throw error;
      }
      if (isThenable(result)) {
        return result.then(
          (value) => {
            endSave();
            return value;
          },
          (error: unknown) => {
            endSave(error);
            throw error;
          }
        );
      }
      endSave();
      return result;
    };
  }
  return wrapped;
}
