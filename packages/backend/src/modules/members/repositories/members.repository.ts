import { Injectable } from '@nestjs/common';
import { Prisma, Role as DbRole } from '@prisma/client';
import { Role } from '@rete/shared';
import { PrismaService } from '../../../database/prisma.service';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';

/**
 * メンバー（= Account）の select 形状の SSOT は本 repository。
 * **select で明示列のみ取得**し、passwordHash / role / mustChangePassword 等の機密・内部列は出さない
 * （§1 DTO 境界の保存側担保。include だと全スカラ列が載り passwordHash が漏れるため select を使う）。
 */
const memberSelect = {
  id: true,
  name: true,
  familyName: true,
  givenName: true,
  email: true,
  isActive: true,
  // ログイン試行ロックアウト（set-0025 P4）の解除予定時刻。管理画面の「ロックアウト中」表示 + 手動解除（set-0030）用。
  // failedLoginAttempts（失敗回数）は秒精度の内部状態で DTO へ晒さない（lockedUntil の分概算のみ管理画面で使う）。
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
  // 二段階認証（MFA/TOTP・ST-2-2）の有効状態。管理画面の「MFA 有効」表示 + 管理者強制リセット（set-0033）用。
  // totpSecret（暗号化済 secret）等は出さず enabled の真偽のみを載せる（DTO 境界・機密 secret を晒さない）。
  mfaSetting: { select: { enabled: true } },
} as const;

/** mapper の入力型（select で絞った Account）。 */
export type MemberWithRelations = Prisma.AccountGetPayload<{
  select: typeof memberSelect;
}>;

/**
 * メンバーの部分更新データ。各項目 undefined はスキップ（既存値保持）。
 * email は service で trim+小文字正規化済みの値を渡す（set-0097）。
 */
export interface UpdateMemberData {
  /** 表示名（familyName/givenName から再組み立て済み）。 */
  name?: string;
  familyName?: string;
  givenName?: string;
  isActive?: boolean;
  /** メールアドレス（=ログイン識別子・set-0097）。service が正規化済みの小文字を渡す。 */
  email?: string;
}

/**
 * メンバー管理のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 */
@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 全メンバー（作成順）。件数は単一テナント運用のため上限を設けない。 */
  findAll(): Promise<MemberWithRelations[]> {
    return this.prisma.account.findMany({
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string): Promise<MemberWithRelations | null> {
    return this.prisma.account.findUnique({
      where: { id },
      select: memberSelect,
    });
  }

  /**
   * 指定 email を持つ Account が他にいるか返す（email 更新時の重複チェック・set-0097）。
   * 自分自身の id を除外することで「同じ値を据え置き」は hit せず、別 Account が同じ email を
   * 持っている時のみ id を返す（呼び出し側はこの id が存在すれば ConflictException）。
   * email は保存前に service が trim+小文字正規化済のものを渡す（DB は小文字のみ格納する規約）。
   */
  async findOtherAccountByEmail(
    excludeId: string,
    normalizedEmail: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.account.findFirst({
      where: { email: normalizedEmail, NOT: { id: excludeId } },
      select: { id: true },
    });
  }

  /**
   * メンバーを部分更新する。
   */
  update(id: string, data: UpdateMemberData): Promise<MemberWithRelations> {
    return this.prisma.account.update({
      where: { id },
      data,
      select: memberSelect,
    });
  }

  /**
   * ログイン試行ロックアウト（set-0025 P4）を即時クリアする（管理者手動解除・set-0030）。
   * failedLoginAttempts と lockedUntil を AccountRepository.resetLoginState と同一形でゼロ/null へ戻すため、
   * 自動 15 分経過時のリセットと完全に同じ状態へ収束する（解除ロジックを二重化しない＝既存機構と整合）。
   * cmn-0232 MEDIUM2: payload 形（{ failedLoginAttempts: 0, lockedUntil: null }）を repository 層の
   * spec で完全一致固定する。lockedUntil を undefined に退行すると Prisma は「その列を更新しない」と
   * 解釈しロックが永久に解けない（service spec は repo をモックし呼び出し有無しか見ないため未カバー）。
   */
  clearLockout(id: string): Promise<MemberWithRelations> {
    return this.prisma.account.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: memberSelect,
    });
  }

  /**
   * システムロール昇格/降格の対象 Account を id+現 role で取得する（cmn-0047）。
   * memberSelect は role を伏せる（DTO 境界）が、昇格/降格判定には現 role が要るため
   * 本メソッドは role を明示取得する専用パス（ADMIN 限定エンドポイントからのみ呼ばれる）。
   */
  async findAccountRole(id: string): Promise<{ id: string; role: Role } | null> {
    const row = await this.prisma.account.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    // role は app 層 @rete/shared Role で扱う（Prisma DbRole ↔ 値域同一・橋渡し）。
    return row ? { id: row.id, role: row.role as unknown as Role } : null;
  }

  /** 対象 Account のシステムロール（Account.role）を更新する（昇格＝MEMBER→ADMIN の実体・ガード不要）。 */
  async updateSystemRole(id: string, role: Role): Promise<{ id: string; role: Role }> {
    const row = await this.prisma.account.update({
      where: { id },
      data: { role: role as unknown as DbRole },
      select: { id: true, role: true },
    });
    return { id: row.id, role: row.role as unknown as Role };
  }

  /**
   * システム ADMIN の降格（ADMIN→MEMBER）を TOCTOU 安全にアトミック実行する（cmn-0047 全消失ガード）。
   * ADMIN 総数を数え、最後の 1 人なら降格せず blocked=true を返す。
   * count→他行 update は READ COMMITTED では write skew（並行降格で双方が count>1 を読み別行を落とす）を
   * 防げないため、Serializable(SSI) で直列化する（P2034 abort は runInSerializableTransaction が自動リトライ）。
   */
  async demoteSystemRoleAtomic(
    id: string,
  ): Promise<{ blocked: boolean; row?: { id: string; role: Role } }> {
    return runInSerializableTransaction(this.prisma, async (tx) => {
      const adminCount = await tx.account.count({
        where: { role: Role.ADMIN as unknown as DbRole },
      });
      if (adminCount <= 1) {
        return { blocked: true };
      }
      const updated = await tx.account.update({
        where: { id },
        data: { role: Role.MEMBER as unknown as DbRole },
        select: { id: true, role: true },
      });
      return { blocked: false, row: { id: updated.id, role: updated.role as unknown as Role } };
    });
  }
}
