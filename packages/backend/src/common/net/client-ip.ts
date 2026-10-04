import type { Request } from 'express';

/**
 * IPv4-mapped IPv6（`::ffff:a.b.c.d`）を素の IPv4（`a.b.c.d`）へ正規化する。
 * Node のデュアルスタック（`::` バインド・既定）では IPv4 クライアントの接続が `::ffff:x.x.x.x` で届くため、
 * 正規化しないと IPv4 CIDR（4 byte）と family 長が食い違い許可リストが全 IPv4 を取りこぼす（set-0025 P1 HIGH 修正）。
 * dotted-quad 末尾を持つ標準形のみ畳む（hex 圧縮形 `::ffff:c000:0201` は実運用で出ないため対象外）。
 */
export function normalizeIp(ip: string): string {
  const m = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(ip);
  return m ? m[1] : ip;
}

/**
 * リクエストからクライアント IP を取り出す（IP 許可リスト遮断の判定＋自己ロックアウト警告表示用）。
 * express の `req.ip`（trust proxy 設定に従う）を優先し、無ければ socket の remoteAddress、最後に空文字。
 * IPv4-mapped IPv6 は素の IPv4 へ正規化して返す（許可リスト判定が family を跨いで成立するように）。
 */
export function clientIp(req: Request): string {
  return normalizeIp(req.ip ?? req.socket?.remoteAddress ?? '');
}

/**
 * リクエストからブラウザ情報（User-Agent）を取り出す（監査記録の userAgent 列用・fil-0106 項目3）。
 * ヘッダ未送出は null。切り詰め（MAX_USER_AGENT_LENGTH）は記録直前の AuditRecorderService が一元化する
 * ので、ここでは型の吸収だけ行う。監査を記録する箇所ごとに同じキャストを書き写していたのを 1 か所へ寄せた
 * （clientIp と対で使う想定＝IP だけ共通部品で UA だけ手書き、という非対称を残さない）。
 */
export function clientUserAgent(req: Request): string | null {
  return req.headers['user-agent'] ?? null;
}
