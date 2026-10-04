'use client';

export interface UseAsyncActionOptions {
  onBusyChange?: (busy: boolean) => void;
  onError?: (err: unknown) => void;
}

export interface UseAsyncActionResult {
  run: (action: () => Promise<void>, options?: UseAsyncActionOptions) => Promise<void>;
}

export function useAsyncAction(): UseAsyncActionResult {
  async function run(action: () => Promise<void>, options?: UseAsyncActionOptions): Promise<void> {
    options?.onBusyChange?.(true);
    try {
      await action();
    } catch (err) {
      options?.onError?.(err);
    } finally {
      options?.onBusyChange?.(false);
    }
  }

  return { run };
}
