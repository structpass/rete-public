import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database';

/**
 * 担当者候補の表示用 select（id + 表示名のみ）。select 形状の SSOT は本 repository。
 * email / passwordHash / role / isActive 等の機密・内部列は select しない（§1 DTO 境界の保存側担保）。
 */
const accountSummarySelect = {
  id: true,
  name: true,
} as const;

/** id + 表示名だけに絞った Account（mapper の入力型）。 */
export type AccountSummary = {
  id: string;
  name: string;
};

/** Desk 個人設定の select 形状（rete-desk-0142）。UI が使う比率のみ（内部列は出さない / §1）。 */
const deskPreferenceSelect = {
  leftPaneRatio: true,
} as const;

/** Desk 個人設定の row 型（mapper の入力型）。 */
export type DeskPreferenceRow = {
  leftPaneRatio: number;
};

/** 表示個人設定の select 形状（mdl-0022）。UI が使う 2 値のみ（内部列は出さない / §1）。 */
const displayPreferenceSelect = {
  stripeEnabled: true,
  stripeColor: true,
} as const;

/** 表示個人設定の row 型（mapper の入力型）。 */
export type DisplayPreferenceRow = {
  stripeEnabled: boolean;
  stripeColor: string;
};

/**
 * Account のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 * 担当者割当 UI の候補一覧専用で、最小列（id + name）のみ返す。
 */
@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 呼び出し元が ORGANIZATION membership を持つ組織 id 一覧（dsk-0408・org 境界解決の一段目）。
   * scope-visibility.service の org membership クエリと同型（accountId × scopeType で scopeId を引く）。
   */
  findOrgScopeIds(accountId: string): Promise<string[]> {
    return this.prisma.membership
      .findMany({
        where: { accountId, scopeType: 'ORGANIZATION' },
        select: { scopeId: true },
      })
      .then((rows) => rows.map((r) => r.scopeId));
  }

  /**
   * 指定組織群のいずれかに ORGANIZATION membership を持つ有効アカウントの和集合を返す
   * （dsk-0408・候補一覧のテナント境界化）。findActiveByProject と同じ Membership join 1 クエリ構成。
   * 複数組織所属アカウントは membership 行が組織ぶん重複するため distinct で 1 行へ縮約する
   * （dsk-0414 criteria ③・JS Map dedup から DB 側 DISTINCT 相当へ置換）。
   *
   * 注: PostgreSQL の `DISTINCT ON` は distinct 列を ORDER BY 先頭に前置する仕様（Prisma 6 でも同じ）
   * ため、本クエリの結果は account_id ASC（≒ UUID 順）になる。表示名昇順契約は service.findAll 側で
   * localeCompare('ja') ソートをかけて満たす（repository の orderBy は DB 側の負荷軽減目的のみで
   * 順序の SSOT ではない）。
   */
  findActiveByOrgs(orgIds: string[]): Promise<AccountSummary[]> {
    if (orgIds.length === 0) return Promise.resolve([]);
    return this.prisma.membership
      .findMany({
        where: { scopeType: 'ORGANIZATION', scopeId: { in: orgIds }, account: { isActive: true } },
        distinct: ['accountId'],
        select: { account: { select: accountSummarySelect } },
        orderBy: { account: { name: 'asc' } },
      })
      .then((rows) => rows.map((r) => r.account));
  }

  /**
   * 本人 1 件の summary（dsk-0408・org membership 0 件でも候補一覧へ caller 自身を含める保険）。
   * 存在しない id は null（authenticated 経路では実質発生しない防御）。
   *
   * isActive は敢えてフィルタしない（dsk-0414 criteria ④）。Auth 経路で無効化アカウントは
   * auth.service.ts:177-181 の findActiveUser がセッション自体を無効化するため、到達不能。
   * 経路を限定するほうが DB クエリ 1 段で済み、findUnique の利用意義が活きる。
   */
  findSummaryById(id: string): Promise<AccountSummary | null> {
    return this.prisma.account.findUnique({ where: { id }, select: accountSummarySelect });
  }

  /** id で 1 件取得（実在確認専用・id のみ）。DM 作成時の peerAccountId 実在チェック等に使う（cmn-0074）。 */
  findById(id: string): Promise<{ id: string } | null> {
    return this.prisma.account.findUnique({ where: { id }, select: { id: true } });
  }

  /**
   * CHANNEL Space に紐づく project の id（未紐付け / space 不在 / 非 CHANNEL なら null）。
   * assignee 候補を Space メンバーへ絞る経路（Task→space(spaceId)→project→Membership）の最初の一段。
   * kind=CHANNEL で AND するのは、タスクが属するのは CHANNEL Space に限る設計（projectId 非 null は
   * CHANNEL のみ）かつ GROUP/PERSONAL_* に将来 projectId が付いても非メンバー一覧を引けない穴を塞ぐため
   * （非 CHANNEL は null→全員フォールバックに落とし、他器のメンバー越境参照を構造的に不可能にする）。
   * unique 制約（id）に kind を AND するため findFirst を使う。
   */
  findProjectIdBySpace(spaceId: string): Promise<string | null> {
    return this.prisma.space
      .findFirst({ where: { id: spaceId, kind: 'CHANNEL' }, select: { projectId: true } })
      .then((s) => s?.projectId ?? null);
  }

  /**
   * project に PROJECT スコープで所属する有効アカウントを表示名昇順で返す（dsk-0211・assignee 候補の Space 限定）。
   * Membership(scopeType=PROJECT, scopeId=projectId) を account へ join し 1 クエリで取得（N+1 回避）。
   * Membership.scopeId はポリモーフィック参照（FK なし）のため scopeType と AND で projectId を引く。
   * select は accountSummarySelect（id + 表示名のみ）を再利用し、機密列を出さない（§1 DTO 境界）。
   */
  findActiveByProject(projectId: string): Promise<AccountSummary[]> {
    return this.prisma.membership
      .findMany({
        where: { scopeType: 'PROJECT', scopeId: projectId, account: { isActive: true } },
        select: { account: { select: accountSummarySelect } },
        orderBy: { account: { name: 'asc' } },
      })
      .then((rows) => rows.map((r) => r.account));
  }

  /** Desk 個人設定（ペイン幅比率 / rete-desk-0142）。未保存なら null。 */
  findDeskPreference(accountId: string): Promise<DeskPreferenceRow | null> {
    return this.prisma.deskPreference.findUnique({
      where: { accountId },
      select: deskPreferenceSelect,
    });
  }

  /**
   * Desk 個人設定の upsert（初回保存 = create / 以降 = update）。アカウント 1:1 の設定行のため
   * 個別の create/update を分けず常に upsert で冪等にする（rete-desk-0142）。
   */
  upsertDeskPreference(accountId: string, leftPaneRatio: number): Promise<DeskPreferenceRow> {
    return this.prisma.deskPreference.upsert({
      where: { accountId },
      create: { accountId, leftPaneRatio },
      update: { leftPaneRatio },
      select: deskPreferenceSelect,
    });
  }

  /** 表示個人設定（明細の縞模様 / mdl-0022）。未保存なら null。 */
  findDisplayPreference(accountId: string): Promise<DisplayPreferenceRow | null> {
    return this.prisma.displayPreference.findUnique({
      where: { accountId },
      select: displayPreferenceSelect,
    });
  }

  /**
   * 表示個人設定の upsert（初回保存 = create / 以降 = update）。アカウント 1:1 の設定行のため
   * 個別の create/update を分けず常に upsert で冪等にする（DeskPreference と同方式 / mdl-0022）。
   */
  upsertDisplayPreference(
    accountId: string,
    data: { stripeEnabled: boolean; stripeColor: string },
  ): Promise<DisplayPreferenceRow> {
    return this.prisma.displayPreference.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
      select: displayPreferenceSelect,
    });
  }
}
