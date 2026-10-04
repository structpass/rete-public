import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * dev / start ラッパーが next に渡す listen ポートを解決する。
 *
 * Next.js は PORT を .env ファイルからは読まない（起動コマンド時点の process.env のみ）ため、
 * .env.local / .env に書いた PORT を効かせるにはラッパー側で読み取る必要がある。
 * ここで必要なのは listen ポートだけなので、PORT 行のみを拾う最小パーサーに留める
 * （NEXT_PUBLIC_* 等の env ロードは Next 本体に任せる。@next/env は pnpm では frontend から
 *  直接 resolve できないため依存させない）。
 *
 * 優先順位: shell の PORT（明示） > .env.local > .env > fallback。
 */
function readEnvPort(file) {
  try {
    const text = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*PORT\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '').trim();
    }
  } catch {
    // ファイルが無ければ無視（次の候補へフォールバック）
  }
  return undefined;
}

export function resolvePort(fallback = '3000') {
  const fromShell =
    process.env.PORT && process.env.PORT.trim() !== '' ? process.env.PORT.trim() : undefined;
  return fromShell ?? readEnvPort('.env.local') ?? readEnvPort('.env') ?? fallback;
}
