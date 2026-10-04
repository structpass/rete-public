import axios from 'axios';

/**
 * backend の error.message（{ success:false, error:{ message } }）を安全に取り出す。
 * settings 画面間での逐語複製を避けるため settings/lib に集約（architecture-invariants §3）。
 * desk/lib/api-error.ts と同 shape で settings 専用に定義（cross-feature 依存を避ける）。
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { error?: { message?: unknown } } | undefined)?.error
      ?.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return fallback;
}
