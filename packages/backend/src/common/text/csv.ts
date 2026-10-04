/**
 * 汎用 CSV シリアライザ / パーサ（RFC4180 準拠・UTF-8 BOM 既定）。
 * Settings ST-4 メンバー CSV エクスポートで導入。ST-6 操作ログ CSV など他のエクスポートからも再利用する
 * 想定（§3 コピペ禁止のため最初から共通化）。値は呼び出し側で文字列化してから渡す（型責務を分離）。
 */

const CRLF = '\r\n';
/** UTF-8 BOM。Excel が UTF-8 を Shift_JIS と誤認して日本語が文字化けするのを防ぐ。 */
const BOM = '﻿';

/**
 * CSV Formula Injection（OWASP）対策。Excel / LibreOffice は = + - @ タブ CR で始まるセルを
 * 数式として解釈・実行するため、これらで始まる値の先頭に ' を付けて無害化する。
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * RFC4180: カンマ / 改行 / ダブルクォートを含むセルは引用符で囲み、内部の " は "" にエスケープする。
 * formulaGuard 有効時は先に数式トリガーを無害化してから RFC4180 整形する。
 */
function escapeCell(value: string, formulaGuard: boolean): string {
  const guarded = formulaGuard && FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/**
 * ヘッダ + 行を CSV 文字列へ整形する。各行は CRLF 区切り、末尾にも改行を付ける。
 * @param headers 見出し列
 * @param rows 各行のセル（文字列化済み）
 * @param opts.bom 先頭に BOM を付けるか（既定 true）
 * @param opts.formulaGuard 数式トリガー文字を ' で無害化するか（既定 true・数値列等は false でオプトアウト）
 */
export function toCsv(
  headers: string[],
  rows: string[][],
  opts: { bom?: boolean; formulaGuard?: boolean } = {},
): string {
  const { bom = true, formulaGuard = true } = opts;
  const lines = [headers, ...rows].map((cols) =>
    cols.map((c) => escapeCell(c, formulaGuard)).join(','),
  );
  return (bom ? BOM : '') + lines.join(CRLF) + CRLF;
}

/**
 * CSV テキスト（RFC4180 準拠）をヘッダ keyed の Record 配列へ変換する。
 * - 先頭の UTF-8 BOM（﻿）を自動除去する。
 * - CR+LF / LF / CR のいずれかを行区切りとして受け付ける。
 * - 引用符付きセル（内部 "" → "、内部改行含む）を正しくアンクォートする。
 * - 空行はスキップする。
 * - 列数がヘッダより少ない行は不足列を空文字で補う。
 * - 値の前後空白は trim しない（呼び出し側の責務）。
 *
 * 招待 CSV インポート（ST-5）などのパース用として ST-4 の toCsv と対になる共通ヘルパ。
 */
export function parseCsv(text: string): Record<string, string>[] {
  // BOM 除去
  const stripped = text.startsWith('﻿') ? text.slice(1) : text;

  // RFC4180 準拠の行/セル分割（引用符内の改行をまたぐ必要があるため 1 文字ずつ走査）。
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < stripped.length) {
    const ch = stripped[i];

    if (inQuotes) {
      if (ch === '"') {
        // 次が " なら "" → " のエスケープ
        if (stripped[i + 1] === '"') {
          cell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        cell += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        current.push(cell);
        cell = '';
        i++;
      } else if (ch === '\r' && stripped[i + 1] === '\n') {
        // CRLF
        current.push(cell);
        cell = '';
        rows.push(current);
        current = [];
        i += 2;
      } else if (ch === '\r' || ch === '\n') {
        // CR / LF 単体
        current.push(cell);
        cell = '';
        rows.push(current);
        current = [];
        i++;
      } else {
        cell += ch;
        i++;
      }
    }
  }

  // ファイル末尾に改行がない場合の残余セル
  if (cell !== '' || current.length > 0) {
    current.push(cell);
    rows.push(current);
  }

  if (rows.length === 0) return [];

  const headers = rows[0];
  const result: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // 空行（すべてのセルが空文字）はスキップ
    if (row.length === 1 && row[0] === '') continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = row[c] ?? '';
    }
    result.push(record);
  }

  return result;
}
