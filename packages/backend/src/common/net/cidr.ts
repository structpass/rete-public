import { isIP } from 'node:net';

/**
 * CIDR 表記（IPv4 / IPv6）の妥当性を検証する。新規依存を足さず Node 標準 `net.isIP` で住所部を判定する。
 * 形式: `<address>/<prefix>`。prefix は IPv4=0-32 / IPv6=0-128 の整数。
 * ネットワークアラインメント（host ビット 0）は強制しない（/32・/128 のホスト指定を許容するため）。
 */
export function isValidCidr(value: string): boolean {
  const slash = value.indexOf('/');
  if (slash === -1) return false;
  const addr = value.slice(0, slash);
  const prefixStr = value.slice(slash + 1);
  const family = isIP(addr); // 0 = 非 IP / 4 / 6
  if (family === 0) return false;
  if (!/^\d+$/.test(prefixStr)) return false;
  const prefix = Number(prefixStr);
  const max = family === 4 ? 32 : 128;
  return prefix >= 0 && prefix <= max;
}

/**
 * IP アドレスをバイト配列へ正規化する（IPv4=4 byte / IPv6=16 byte）。CIDR マッチの前段。
 * `net.isIP` で family を確定してからパースするため、ここでは展開（`::` 圧縮 / IPv4-mapped 末尾）のみ扱う。
 * 想定外（パース不能）は **null を返し fail-secure**（呼び出し側でマッチ不成立＝拒否側に倒す）。新規依存は足さない。
 */
function ipToBytes(ip: string): Uint8Array | null {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    const bytes = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(parts[i])) return null;
      const n = Number(parts[i]);
      if (n > 255) return null;
      bytes[i] = n;
    }
    return bytes;
  }
  if (family === 6) return ipv6ToBytes(ip);
  return null;
}

/** IPv6 文字列を 16 byte へ展開する（`::` ゼロ圧縮 + 末尾 IPv4-mapped 記法に対応）。不正は null。 */
function ipv6ToBytes(input: string): Uint8Array | null {
  let ip = input;
  // 末尾 IPv4-mapped（例: ::ffff:192.0.2.1）を 2 hextet へ畳み込んでから 8 群展開する。
  const lastColon = ip.lastIndexOf(':');
  const tail = ip.slice(lastColon + 1);
  if (tail.includes('.')) {
    const p = tail.split('.');
    if (p.length !== 4) return null;
    const oct: number[] = [];
    for (const s of p) {
      if (!/^\d{1,3}$/.test(s)) return null;
      const n = Number(s);
      if (n > 255) return null;
      oct.push(n);
    }
    const hi = ((oct[0] << 8) | oct[1]).toString(16);
    const lo = ((oct[2] << 8) | oct[3]).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const back = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + back.length);
    if (missing < 0) return null;
    groups = [...head, ...new Array(missing).fill('0'), ...back];
  } else {
    groups = head; // `::` 無しは 8 群フル必須
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) return null;
    const n = parseInt(groups[i], 16);
    bytes[i * 2] = (n >> 8) & 0xff;
    bytes[i * 2 + 1] = n & 0xff;
  }
  return bytes;
}

/**
 * IP が単一 CIDR レンジに含まれるか判定する。family 不一致（IPv4 IP vs IPv6 CIDR 等）は **false（不一致）**。
 * prefix ビットだけを上位から byte 単位 + 端数 byte のマスク比較で照合する。パース不能はすべて false（fail-secure）。
 * 注: 入力は正規化済みである前提（IPv4-mapped IPv6 の `::ffff:` は入口側の `clientIp` / `normalizeIp` が
 * 素の IPv4 へ畳んでから渡す・set-0025）。本関数は正規化を行わない。リバースプロキシ背後での
 * 運用（trust proxy 設定）は `docs/architecture/operational-policy.md` §9 を参照。
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf('/');
  if (slash === -1) return false;
  const ipBytes = ipToBytes(ip);
  const netBytes = ipToBytes(cidr.slice(0, slash));
  if (!ipBytes || !netBytes || ipBytes.length !== netBytes.length) return false;
  const prefixStr = cidr.slice(slash + 1);
  if (!/^\d+$/.test(prefixStr)) return false;
  const prefix = Number(prefixStr);
  if (prefix < 0 || prefix > ipBytes.length * 8) return false;

  let bitsLeft = prefix;
  for (let i = 0; i < ipBytes.length && bitsLeft > 0; i++) {
    if (bitsLeft >= 8) {
      if (ipBytes[i] !== netBytes[i]) return false;
      bitsLeft -= 8;
    } else {
      const mask = (0xff << (8 - bitsLeft)) & 0xff;
      if ((ipBytes[i] & mask) !== (netBytes[i] & mask)) return false;
      bitsLeft = 0;
    }
  }
  return true;
}

/**
 * IP がいずれかの許可 CIDR にマッチするか。許可リストが空なら判定は呼び出し側の責務
 * （本関数は「空配列 → false」を返すため、自己ロックアウト防止の "空＝全許可" は guard 側で別扱いする）。
 */
export function isIpAllowed(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => ipInCidr(ip, cidr));
}
