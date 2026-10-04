import { Injectable } from '@nestjs/common';
import { ok } from '../../common/dto';
import { assertSpaceVisibleOr404 } from '../../common/visibility';
import { AccountsRepository } from './repositories/accounts.repository';
import { toAccountSummary, toDeskPreference, toDisplayPreference } from './accounts.mapper';
import { UpdateDeskPreferenceDto } from './dto/desk-preference.dto';
import { UpdateDisplayPreferenceDto } from './dto/display-preference.dto';
import { ScopeVisibilityService } from '../memberships/scope-visibility.service';

/**
 * by-space（担当者候補の Space 絞り込み）で器が引けない時の文言。spaces.service の「不在の器」と
 * 同じ文言を使う（非可視の 404 も同じ文言で返す・common/visibility の写し替え・v2-254）。
 */
export const ACCOUNT_SPACE_NOT_FOUND_MESSAGE = '器が見つかりません';

/**
 * Account のアプリケーションサービス。担当者割当 UI 向けの候補一覧（id + 表示名）のみを提供する。
 * DB アクセスは Repository 経由（§2）、Entity→DTO 変換は mapper（§1）。
 *
 * 認可境界は controller の AuthenticatedGuard（ログイン必須）を土台に、Space を指定する経路（by-space）は
 * ScopeVisibilityService の可視判定を本サービスで enforce する（operational-policy §8: chat / tasks / files と
 * 同じく可視性の判定主体を ScopeVisibilityService へ一本化する）。一覧自体は ADMIN 限定にしない（MEMBER も
 * タスク担当に割り当てるため tasks / chat と同じ認証のみ境界）。
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly repo: AccountsRepository,
    private readonly scopeVisibility: ScopeVisibilityService,
  ) {}

  /**
   * 有効アカウントの候補一覧（表示名昇順）— 呼び出し元の組織境界で絞る（dsk-0408）。
   * caller が ORGANIZATION membership を持つ全組織に対し、同じく ORGANIZATION membership を持つ
   * 有効アカウントの和集合を返す（水平越境の視認防止・dsk-0309 security MEDIUM の解消）。
   * caller 本人は常に含める（org 未所属アカウントでも候補ゼロの詰みにしない・findBySpace の
   * フォールバック思想と一貫）。ADMIN カーブアウトは設けない（グローバル ADMIN ロールが存在しないため）。
   *
   * 表示順の決定性（dsk-0414 criteria ① + database-reviewer HIGH）: PostgreSQL の `DISTINCT ON` は
   * distinct 列を ORDER BY 先頭に前置する仕様（Prisma 6 も同じ）なので、repository 側で distinct を
   * 使うと結果が account_id ASC（≒ UUID 順）となり、表示名昇順の JSDoc 契約を破る。そのため本サービス
   * で `accounts.sort(localeCompare 'ja')` を**主結果経路と caller 補完経路の両方で常に**適用する。
   * 1 リクエスト内で順序が経路により微差する旧状態を解消し、表示順を JS 側に寄せて統一する。
   */
  async findAll(callerId: string) {
    const orgIds = await this.repo.findOrgScopeIds(callerId);
    const accounts = orgIds.length > 0 ? await this.repo.findActiveByOrgs(orgIds) : [];
    if (!accounts.some((a) => a.id === callerId)) {
      const self = await this.repo.findSummaryById(callerId);
      if (self) {
        accounts.push(self);
      }
    }
    accounts.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return ok(accounts.map(toAccountSummary));
  }

  /**
   * 担当者候補を「タスクの属する Space のメンバー」に絞る（dsk-0211 criteria 1）。
   *
   * 認可（v2-230）: spaceId 指定時は repository を呼ぶ前に
   * ScopeVisibilityService.assertVisibleOr404 で呼び出し元の可視性を検証する。非可視 Space は 404
   * （存在秘匿・ADR 0038）で、氏名・表示名を列挙させない。文言は器の不在と同じ「器が見つかりません」
   * へ揃える（common/visibility の写し替え・v2-254。ガードの英語 'Resource not found' を返すと、
   * 同じ経路の不在と本文で読み分けられ、応答がそのまま存在の oracle になる）。旧コメントの
   * 「dsk-0408 でフォールバック先の findAll が org 境界化されたため本経路も自動的に境界化される」は
   * **fallback 経路だけが真**で、主経路（findProjectIdBySpace → findActiveByProject）には caller が
   * 届かず、任意の spaceId で非メンバー project の所属者を列挙できていた。
   *
   * spaceId 未指定 / 可視だが space が project 未紐付け（projectId=null・GROUP / PERSONAL /
   * 移行期の名残）の場合は findAll へフォールバックする（候補ゼロで担当者を選べない詰みを避ける
   * 保険・design 確定。可視の確認後にだけ通る経路なので、ここでのフォールバックは越境にならない）。
   */
  async findBySpace(callerId: string, spaceId?: string) {
    if (!spaceId) return this.findAll(callerId);
    await assertSpaceVisibleOr404(
      this.scopeVisibility,
      callerId,
      spaceId,
      ACCOUNT_SPACE_NOT_FOUND_MESSAGE,
    );
    const projectId = await this.repo.findProjectIdBySpace(spaceId);
    if (!projectId) return this.findAll(callerId);
    const accounts = await this.repo.findActiveByProject(projectId);
    return ok(accounts.map(toAccountSummary));
  }

  /**
   * Desk 個人設定の取得（rete-desk-0142）。未保存なら data:null（frontend は既定比率で描画）。
   * 対象は常にセッション本人（accountId は @CurrentUser 由来）のため所有チェック不要。
   */
  async getDeskPreference(accountId: string) {
    const pref = await this.repo.findDeskPreference(accountId);
    return ok(pref ? toDeskPreference(pref) : null);
  }

  /** Desk 個人設定の保存（upsert / rete-desk-0142）。値域は DTO（0.25〜0.75）で検証済み。 */
  async updateDeskPreference(accountId: string, dto: UpdateDeskPreferenceDto) {
    const pref = await this.repo.upsertDeskPreference(accountId, dto.leftPaneRatio);
    return ok(toDeskPreference(pref));
  }

  /**
   * 表示個人設定の取得（mdl-0022）。未保存なら data:null（frontend は CSS 既定＝縞 ON・#FAFCFF で描画）。
   * 対象は常にセッション本人（accountId は @CurrentUser 由来）のため所有チェック不要。
   */
  async getDisplayPreference(accountId: string) {
    const pref = await this.repo.findDisplayPreference(accountId);
    return ok(pref ? toDisplayPreference(pref) : null);
  }

  /** 表示個人設定の保存（upsert / mdl-0022）。縞色の形式は DTO（#RRGGBB）で検証済み。 */
  async updateDisplayPreference(accountId: string, dto: UpdateDisplayPreferenceDto) {
    const pref = await this.repo.upsertDisplayPreference(accountId, {
      stripeEnabled: dto.stripeEnabled,
      stripeColor: dto.stripeColor,
    });
    return ok(toDisplayPreference(pref));
  }
}
