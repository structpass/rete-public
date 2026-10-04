import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
// MAX_MENTION_IDS の SSOT は同じディレクトリ配下の ./max-mention-ids（cmn-0281 で移動）。
// 値の正本はそちら・本ファイルは TOCTOU 変換ヘルパに専化する。

/**
 * 宛先（メンション先）アカウント id 群を重複排除し、全件の実在を検証する共通ヘルパー（chat.service の
 * validateMentionAccountIds を task/comment 双方から使えるよう一般化したもの / dsk-0203）。
 * undefined（未指定）はそのまま undefined を返し「据え置き」を表す。空配列は空配列のまま返す
 * （update での「宛先を全クリア」意図と「据え置き(undefined)」を区別する）。
 * 実在しない id が混ざれば 400（FK 違反による 500 を避け原因を明示）。
 * 件数照合クエリ（countAccountsByIds 相当）は呼び出し元（各 repository）の実装を引数で受ける
 * （chat/task で repository が別クラスのため共通化の境界をここに置く）。
 */
export async function validateMentionAccountIds(
  ids: string[] | undefined,
  countAccountsByIds: (ids: string[]) => Promise<number>,
): Promise<string[] | undefined> {
  if (ids === undefined) return undefined;
  const unique = [...new Set(ids)];
  if (unique.length > 0) {
    const existing = await countAccountsByIds(unique);
    if (existing !== unique.length) {
      throw new BadRequestException('mentionAccountIds に存在しないアカウントが含まれています');
    }
  }
  return unique;
}

/**
 * メンション行作成時の TOCTOU（存在検証通過後・createMany 実行前に対象アカウント削除で FK 違反 P2003）を
 * 400 へ揃える（chat.service.toMentionBadRequest と同一ロジック）。P2003 以外は再 throw し上位（filter）へ委ねる。
 * 戻り値は never（catch 節で `toMentionBadRequest(e)` と呼べば TS の control flow 解析が以降を到達可能と見なさない）。
 */
export function toMentionBadRequest(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
    throw new BadRequestException('mentionAccountIds に存在しないアカウントが含まれています');
  }
  throw e;
}
