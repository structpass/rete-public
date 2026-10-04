import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TAG_NAME_MAX_LEN } from '@rete/shared';
import { sanitizeDisplayName } from '../text/sanitize-name';

/**
 * タグマスタ（TagsService / AnnouncementTagsService）共通の検証ロジック（§3 コピペ回避）。
 * - name のサニタイズ（制御文字除去・前後空白詰め・空チェック）
 * - 重複チェックの呼び出し（repository インタフェース非依存・callback パターン）
 *
 * Prisma delegate が model ごとに型が異なるため repository には依存しない。
 * findByName / findById の実装はそれぞれの repository に留め、戻り値だけを callback で受ける。
 *
 * rete-home-0043 で追加（File タグマスタとお知らせタグマスタの共通ロジック）。
 */

/** サニタイズ後の name を返す。空・制御文字のみは BadRequestException。 */
export function sanitizeTagName(raw: string): string {
  return sanitizeDisplayName(raw, { maxLen: TAG_NAME_MAX_LEN, label: 'タグ名' });
}

/**
 * 作成時の重複チェック。findByName が null 以外を返したら ConflictException。
 * アーカイブ済みタグとの衝突は「アーカイブ済みタグ名は再利用不可」仕様（hom-0103・案B）に基づき、
 * 原因がアーカイブ済みだと分かる専用文言を返す（fil-0094 で File Tag も archivedAt を持つため両マスタで発火しうる）。
 * @param name サニタイズ済みの name
 * @param existing findByName(name) の結果（null=未使用 / non-null=衝突）
 */
export function assertNoDuplicateName(
  name: string,
  existing: { id: string; archivedAt?: Date | null } | null,
): void {
  if (existing) {
    if (existing.archivedAt != null) {
      throw new ConflictException(
        `タグ名「${name}」はアーカイブ済みのタグと同名です（復元するか別名にしてください）`,
      );
    }
    throw new ConflictException(`タグ名「${name}」は既に使用されています`);
  }
}

/**
 * 更新時の重複チェック（自分自身は除外）。
 * @param selfId 更新対象の id
 * @param existing findByName(name) の結果（null=未使用 / non-null=衝突候補）
 */
export function assertNoDuplicateNameForUpdate(
  selfId: string,
  existing: { id: string } | null,
): void {
  if (existing && existing.id !== selfId) {
    throw new ConflictException('同名のタグが既に存在します');
  }
}

/**
 * name / icon / color / archived のうち少なくとも 1 つが指定されているか検証する。
 * 全て undefined は BadRequest（何も更新しない無意味なリクエスト）。
 * エラー文言は呼び出し側のタグ種別に合わせる（hom-0086）: archived 対応マスタは includeArchived:true で
 * archived を含む文言を出す（fil-0094 で File タグも archived 対応＝両 service が includeArchived:true）。
 */
export function assertAtLeastOneField(
  dto: {
    name?: string;
    icon?: string;
    color?: string;
    archived?: boolean;
  },
  options?: { includeArchived?: boolean },
): void {
  if (
    dto.name === undefined &&
    dto.icon === undefined &&
    dto.color === undefined &&
    dto.archived === undefined
  ) {
    const fields = options?.includeArchived
      ? 'name / icon / color / archived'
      : 'name / icon / color';
    throw new BadRequestException(`更新する項目（${fields}）がありません`);
  }
}

/**
 * archived 入力（true=アーカイブ / false=解除 / undefined=変更なし）を archivedAt 更新値へ畳む
 * （fil-0094・AnnouncementTagsService の既存ロジックを File タグと共用するため抽出）。
 * - archived:true かつ未アーカイブ → 現在時刻を刻む
 * - archived:false かつアーカイブ済 → null 化（解除）
 * - それ以外（無変化・再送）→ undefined を返し、repo/Prisma が更新スキップして既存値を保持する
 *   （既アーカイブ済へ archived:true 再送で初回アーカイブ日時を上書きしない）。
 * @param currentArchivedAt 更新対象の現在の archivedAt（null=未アーカイブ）
 * @param archived DTO の archived 入力
 */
export function computeArchivedAt(
  currentArchivedAt: Date | null,
  archived: boolean | undefined,
): Date | null | undefined {
  if (archived === undefined) return undefined;
  const isArchived = currentArchivedAt != null;
  if (archived && !isArchived) return new Date();
  if (!archived && isArchived) return null;
  return undefined;
}

/**
 * 対象レコードの存在を確認する。null なら NotFoundException。
 * @param entity findById の結果
 * @param label エラーメッセージ用ラベル（例: '更新対象のタグ' / '削除対象のタグ'）
 */
export function assertEntityExists<T>(entity: T | null, label: string): asserts entity is T {
  if (entity === null || entity === undefined) {
    throw new NotFoundException(`${label}が見つかりません`);
  }
}
