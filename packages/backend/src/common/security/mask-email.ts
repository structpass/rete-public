/** ログ用にメールアドレスをドメインのみへマスクする（ローカル部 PII を出さない・***@domain 形式）。 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 ? `***${email.slice(at)}` : '***';
}
