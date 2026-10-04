import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipScopeType } from '@rete/shared';
import { ScopeVisibilityRepository } from './repositories/scope-visibility.repository';
import { RequestCacheService } from '../../common/services';

/**
 * scopeType ごとに scopeId をまとめる。membership / grant を種別まとめで1回取得した後の
 * 振り分けを1箇所に集約するための補助（重複除去は union 側の Set が担う）。
 */
function groupScopeIdsByType(
  rows: readonly { scopeId: string; scopeType: string }[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const ids = grouped.get(row.scopeType);
    if (ids) ids.push(row.scopeId);
    else grouped.set(row.scopeType, [row.scopeId]);
  }
  return grouped;
}

/** 振り分け済みの scopeId を読む（該当種別が無ければ空配列）。 */
function readScopeIds(grouped: Map<string, string[]>, scopeType: MembershipScopeType): string[] {
  return grouped.get(scopeType) ?? [];
}

/**
 * 横断サービス: 指定アカウントが可視な Space ID 集合を解決する（ADR 0037 §4.2）。
 * 可視 = ORGANIZATION / PROJECT 経由と直接 CHANNEL / GROUP membership で求まる器 + 個人所有の器。
 *
 * DB アクセスは ScopeVisibilityRepository に閉じ込め（ADR 0002 §2 = データアクセス層分離）、
 * 本サービスは「union / 重複除去 / RequestCache / 404 ガード」ロジックに専念する。
 */
@Injectable()
export class ScopeVisibilityService {
  constructor(
    private readonly repo: ScopeVisibilityRepository,
    private readonly requestCache: RequestCacheService,
  ) {}

  /**
   * 指定アカウントが可視な Space の id 配列を返す（重複なし）。cmn-0051: 同一リクエスト・
   * 同一 accountId の2回目以降の呼び出しは RequestCacheService（AsyncLocalStorage）経由で
   * 1回目の結果（Promise）を再利用し、DB クエリを再発行しない。キャッシュの生存期間は
   * HTTP リクエスト1件に限定される（RequestCacheInterceptor が run() で毎回新規 store を生成するため）。
   * 可視パス:
   *   1. ORGANIZATION membership → 配下 project (archivedAt=null) → project 配下 CHANNEL
   *   2. PROJECT membership（直接）→ 配下 CHANNEL
   *   3. CHANNEL membership / grant → 対象 CHANNEL（親 PROJECT 経由へ加算 OR）
   *   4. GROUP membership → GROUP space
   *   5. 個人所有: PERSONAL_MEMO（ownerId） / PERSONAL_DM（owner または peer）
   */
  resolveVisibleSpaceIds(accountId: string): Promise<string[]> {
    return this.requestCache.getOrSet(`scope-visibility:${accountId}`, () =>
      this.resolveVisibleSpaceIdsUncached(accountId),
    );
  }

  /** resolveVisibleSpaceIds の実処理（キャッシュ非経由）。Repository 経由の集約クエリ群。 */
  private async resolveVisibleSpaceIdsUncached(accountId: string): Promise<string[]> {
    // Step 1: membership（4種別）・管理グループ所属 grant（set-0164）・個人スペースを、
    //   種別ごとに繰り返さず各1回で取得する（membership 1回 + グループ所属 1回 + grant 1回 + 個人 1回）。
    const [memberships, grants, personalSpaces] = await Promise.all([
      this.repo.findMembershipScopes(accountId),
      this.repo.findGrantScopes(accountId),
      // space.findMany call 1: 個人スペース（PERSONAL_MEMO / PERSONAL_DM）
      this.repo.findPersonalSpaces(accountId),
    ]);

    // 種別の振り分けはここ1箇所。grant は所属グループの物理削除に連鎖して消えるため実在分だけが来る。
    const membershipIds = groupScopeIdsByType(memberships);
    const grantIds = groupScopeIdsByType(grants);

    // Step 2: org membership + org grant → 配下の非アーカイブ project を取得
    const orgIds = [
      ...new Set([
        ...readScopeIds(membershipIds, MembershipScopeType.ORGANIZATION),
        ...readScopeIds(grantIds, MembershipScopeType.ORGANIZATION),
      ]),
    ];
    const orgProjects = orgIds.length > 0 ? await this.repo.findActiveProjectsByOrgIds(orgIds) : [];

    // Step 3: org 由来 + direct membership + project grant の project id を union（dedup）
    const allProjectIds = [
      ...new Set([
        ...orgProjects.map((p) => p.id),
        ...readScopeIds(membershipIds, MembershipScopeType.PROJECT),
        ...readScopeIds(grantIds, MembershipScopeType.PROJECT),
      ]),
    ];

    // Step 4: グループスペースとチャネルスペースを並列取得（grant が寄与するのは ORGANIZATION/PROJECT/CHANNEL）
    //  - space.findMany call 2: GROUP spaces（groupScopeIds が空でも常に呼ぶ）
    //  - space.findMany call 3: CHANNEL spaces（allProjectIds が空でも常に呼ぶ）
    const groupScopeIds = readScopeIds(membershipIds, MembershipScopeType.GROUP);
    const directChannelIds = [
      ...new Set([
        ...readScopeIds(membershipIds, MembershipScopeType.CHANNEL),
        ...readScopeIds(grantIds, MembershipScopeType.CHANNEL),
      ]),
    ];
    const [groupSpaces, channelSpaces, directChannelSpaces] = await Promise.all([
      this.repo.findGroupSpaces(groupScopeIds),
      this.repo.findChannelSpacesByProjectIds(allProjectIds),
      this.repo.findActiveChannelSpacesByIds(directChannelIds),
    ]);

    // Step 5: 全パスの id を union・dedup して返す
    const allIds = [
      ...personalSpaces.map((s) => s.id),
      ...groupSpaces.map((s) => s.id),
      ...channelSpaces.map((s) => s.id),
      ...directChannelSpaces.map((s) => s.id),
    ];
    return [...new Set(allIds)];
  }

  /** 指定スペースが指定アカウントの可視範囲に入っていれば true を返す。 */
  async canAccessSpace(accountId: string, spaceId: string): Promise<boolean> {
    const ids = await this.resolveVisibleSpaceIds(accountId);
    return ids.includes(spaceId);
  }

  /**
   * 存在秘匿の共通ガード（開発統括合意）。指定アカウントが対象 Space を可視でなければ
   * NotFoundException(404) を throw する。「権限が無いリソースは無いことにする」方針のため
   * ForbiddenException(403) ではなく 404 で揃える。
   *
   * accountId が undefined / null の内部経路（チャット昇格・seed 等の非認証パス）は検証をスキップする
   * （認証経路は controller が必ず id を渡す契約）。write 対象 / 単体 GET の非可視判定に使う共通点。
   *
   * 文言は対象種別を知らない本サービス共通の 'Resource not found'。呼び出し元の経路に「対象不在」の
   * 404（例: tasks の 'Task not found'）がある場合、非可視だけ文言が割れると応答本文が「存在するか」の
   * oracle になる（存在秘匿・ADR 0038 / operational-policy §8）。その経路は呼び出し元が本ガードの 404 を
   * 対象不在と同一の文言へ写し替える（写し替えは common/visibility の assertSpaceVisibleOr404 に一本化）。
   * 対象不在の 404 を持つ経路・器だけを弾く経路は、同じ文言を渡して本関数を通すこと（v2-254）。
   */
  async assertVisibleOr404(accountId: string | undefined | null, spaceId: string): Promise<void> {
    if (accountId === undefined || accountId === null) return;
    const canAccess = await this.canAccessSpace(accountId, spaceId);
    if (!canAccess) {
      throw new NotFoundException('Resource not found');
    }
  }
}
