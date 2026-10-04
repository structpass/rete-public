/**
 * Archivable + sortable container エンティティ（Organization / Project）の共通ユーティリティ。
 * Organization と Project は構造が 80%超同一のため、2 モジュール目（Project）着手前に本ヘルパーを抽出する
 * （ADR 0037 §5 / architecture-invariants §3 コピペ回避）。
 *
 * base-list.helper は list 専用（categoryId 等 Task 固有ロジック漏れがある）のため、
 * archivable container 専用として本ファイルに分離する（base-list と役割が異なる）。
 */
import type { Prisma } from '@prisma/client';

/**
 * archive トグルの DB 更新値を生成する純粋関数。
 * archived=true → archivedAt=現在時刻（アーカイブ） / false → archivedAt=null（復元）。
 */
export function buildArchiveUpdate(archived: boolean): { archivedAt: Date | null } {
  return { archivedAt: archived ? new Date() : null };
}

/**
 * 新規エンティティの sortOrder を採番する。
 * countFn は現在の行数を返す関数（Repository から渡す）。
 * 行数をそのまま次の index とする（0 始まり連番で sortOrder が歯抜けにならない）。
 * count と create は呼び出し側で同一 Serializable tx に含め、同時作成時の重複採番を防ぐ。
 */
export async function nextSortOrder(countFn: () => Promise<number>): Promise<number> {
  return await countFn();
}

/**
 * CHANNEL 種別 Space の cascade archive/restore 共通ヘルパー（§3 コピペ回避）。
 * Organization と Project の両 Repository の $transaction コールバック内から呼ぶ（同一 tx）。
 * tx は Prisma TransactionClient（$transaction コールバックの型）を直接使用。
 * @prisma/client は外部パッケージのため循環 import は発生しない。
 */
export async function cascadeArchiveSpacesByProjectIds(
  tx: Prisma.TransactionClient,
  projectIds: string[],
  archived: boolean,
): Promise<void> {
  if (projectIds.length === 0) return;
  await tx.space.updateMany({
    where: { projectId: { in: projectIds }, kind: 'CHANNEL' },
    data: buildArchiveUpdate(archived),
  });
}
