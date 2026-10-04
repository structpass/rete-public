import { toCsv } from '../../common/text/csv';

/**
 * 招待 CSV インポート（ST-5）の整形ヘルパ。
 * メンバー CSV エクスポート（members.csv.ts）と対になる分離設計（§3 コピペ禁止）。
 * 汎用 parseCsv / toCsv は common/text/csv に置き、招待固有の整形のみここに集約する。
 */

/** 招待 CSV のヘッダ列名（import template と parse の両方で使う SSOT）。 */
export const INVITE_EMAIL_HEADER = 'メールアドレス';

/**
 * 招待 CSV テキスト（Buffer）から { email, row } 配列を取り出す（論点4: 行番号付き）。
 * - BOM / 引用符 / 前後スペースを処理して返す。
 * - 「メールアドレス」列が存在しない場合は空配列を返す。
 * - 空行はスキップするが、スキップ前の実際の CSV 行番号（1-based: ヘッダ=1）を保持する。
 * - row はエラー報告時に「CSV の何行目か」をユーザーに伝えるための情報。
 *
 * 注: parseCsv を経由すると空行を内部スキップした後の index が返るため行番号がずれる。
 * ライン直接走査で行番号を保持しつつ email を抽出する（email に内部カンマ/改行は不要）。
 */
export function parseInviteCsv(bufferOrText: Buffer | string): { email: string; row: number }[] {
  const raw = Buffer.isBuffer(bufferOrText) ? bufferOrText.toString('utf-8') : bufferOrText;
  // BOM 除去（parseCsv と同じ文字 ﻿）
  const text = raw.startsWith('﻿') ? raw.slice(1) : raw;

  // CRLF / LF / CR を統一して行配列に変換。split で得た index+1 が 1-based 行番号。
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length === 0) return [];

  // ヘッダ行で「メールアドレス」列のインデックスを確認（ヘッダにカンマ/引用符は不要）。
  const headers = lines[0].split(',').map((h) => h.trim());
  const emailColIdx = headers.indexOf(INVITE_EMAIL_HEADER);
  if (emailColIdx === -1) return [];

  const result: { email: string; row: number }[] = [];

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    // 空行スキップ（parseCsv と同等）
    if (line.trim() === '') continue;

    // email 列の抽出。RFC4180 基本アンクォート（email で内部カンマ/改行は実用上不要）。
    // 制約: 素朴なカンマ分割のため、他列に引用符付きカンマ（例 "Smith, John"）を含む多列 CSV では
    // emailColIdx がずれうる。招待 CSV はメール 1 列テンプレートが前提なので許容（code review MEDIUM）。
    // 大小混在（例: NewUser@Example.com / newuser@example.com）で同一人物への PENDING が二重発行
    // できてしまうのを防ぐため、issue() と同じ正規化ポイント（抽出時点）で小文字化する（cmn-0074）。
    const cells = line.split(',');
    const rawCell = cells[emailColIdx] ?? '';
    const email = rawCell
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim()
      .toLowerCase();

    if (email.length > 0) {
      result.push({ email, row: lineIdx + 1 }); // lineIdx は 0-based ラインオフセット、+1 で 1-based 行番号
    }
  }

  return result;
}

/**
 * 招待一括インポート用 CSV テンプレートを BOM 付き CSV 文字列で返す。
 * ヘッダ行 + サンプル 1 行（user@example.com）。
 */
export function buildInviteTemplateCsv(): string {
  return toCsv([INVITE_EMAIL_HEADER], [['user@example.com']], { bom: true });
}
