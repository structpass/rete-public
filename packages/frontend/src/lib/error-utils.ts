/**
 * API レスポンスからエラーメッセージを抽出する。
 * backend の AllExceptionsFilter は `{ success: false, error: { code, message } }` を返す。
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  const resp = (err as { response?: { data?: { error?: { message?: string } } } })?.response;
  return resp?.data?.error?.message || fallback;
}

/**
 * バリデーション詳細（`details.validationErrors`）を優先してエラーメッセージを抽出する。
 * backend は class-validator 由来の失敗で error.message を generic な 'Validation failed' にし、
 * どの項目がどう悪いかは details.validationErrors[] にしか入れない（AllExceptionsFilter）。
 * 理由を捨てて固定文言だけを出すと、利用者はどの入力を直せば通るのか分からなくなる（v2-198）。
 */
export function extractValidationErrorMessage(err: unknown, fallback: string): string {
  const error = (
    err as {
      response?: {
        data?: { error?: { message?: string; details?: { validationErrors?: unknown } } };
      };
    }
  )?.response?.data?.error;
  const validation = error?.details?.validationErrors;
  if (Array.isArray(validation)) {
    const messages = validation.filter(
      (message): message is string => typeof message === 'string' && message.length > 0,
    );
    if (messages.length > 0) return messages.join(' / ');
  }
  // 詳細が無い時の message は英語の generic 文言（'Validation failed'）になり得るため、それは fallback へ倒す。
  return error?.message && error.message !== 'Validation failed' ? error.message : fallback;
}

/**
 * API エラーの code（'TOO_MANY_REQUESTS' / 'UNAUTHORIZED' 等）を取り出す。
 * code で分岐したい場面（ログイン画面のロックアウト文言の出し分け等）で使う。未取得は undefined。
 */
export function extractErrorCode(err: unknown): string | undefined {
  const resp = (err as { response?: { data?: { error?: { code?: string } } } })?.response;
  return resp?.data?.error?.code;
}
