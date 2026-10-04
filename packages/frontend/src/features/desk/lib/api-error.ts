import axios from 'axios';

/**
 * backend の error.message（{ success:false, error:{ message } }）を安全に取り出す（category-settings と同方針）。
 * Space 作成（useCreateSpace）/ 更新（useUpdateSpace）双方の toast 文言生成で共有する（§3 コピペ回避）。
 */
export function apiErrorMessage(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const msg = (e.response?.data as { error?: { message?: unknown } } | undefined)?.error?.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return fallback;
}
