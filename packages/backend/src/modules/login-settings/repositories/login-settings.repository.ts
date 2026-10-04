import { Injectable } from '@nestjs/common';
import { IpWhitelistEntry, PasswordPolicy, Prisma } from '@prisma/client';
import { runInSerializableTransaction } from '../../../common/database/serializable-tx';
import { PrismaService } from '../../../database/prisma.service';
import { PASSWORD_POLICY_SINGLETON_ID } from '../login-settings.constants';

/** パスワードポリシーの保存値（singleton upsert 用・全フィールド）。 */
export interface PasswordPolicyPatch {
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  minLength: number;
  /** 全体強制 MFA（ST-2-2）。全置換 upsert の対象。 */
  mfaEnforced: boolean;
}

/**
 * ログイン設定のデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 */
@Injectable()
export class LoginSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- パスワードポリシー（単一行 singleton）---

  /** パスワードポリシー（singleton）を引く。未設定なら null（mapper が既定値で補完）。 */
  findPasswordPolicy(): Promise<PasswordPolicy | null> {
    return this.prisma.passwordPolicy.findUnique({
      where: { id: PASSWORD_POLICY_SINGLETON_ID },
    });
  }

  /** パスワードポリシーを全置換 upsert する（singleton）。 */
  upsertPasswordPolicy(patch: PasswordPolicyPatch): Promise<PasswordPolicy> {
    return this.prisma.passwordPolicy.upsert({
      where: { id: PASSWORD_POLICY_SINGLETON_ID },
      create: { id: PASSWORD_POLICY_SINGLETON_ID, ...patch },
      update: { ...patch },
    });
  }

  // --- IP 許可リスト ---

  /**
   * 一覧の並び順（sortOrder 昇順・同順位は id で安定化）。GET と全置換後の再読込で同一の順序を返すため、
   * 定義を 1 本に寄せる（片方だけ変えると保存直後と再読込後で並びが食い違う）。
   */
  private static readonly IP_WHITELIST_ORDER_BY = [
    { sortOrder: 'asc' },
    { id: 'asc' },
  ] satisfies Prisma.IpWhitelistEntryOrderByWithRelationInput[];

  /** IP 許可リストを sortOrder 昇順で引く（同順位は id で安定化）。 */
  findIpWhitelist(): Promise<IpWhitelistEntry[]> {
    return this.prisma.ipWhitelistEntry.findMany({
      orderBy: LoginSettingsRepository.IP_WHITELIST_ORDER_BY,
    });
  }

  /**
   * IP 許可リストを全置換する（deleteMany→createMany→再読込を 1 トランザクションで原子的に）。
   * sortOrder は配列位置で採番し入力順を保持する。空配列なら全削除のみ（制限解除）。途中失敗は全ロールバック。
   * Serializable で直列化し、空テーブル（初回）での並行 PUT が両者マージ（lost update）になるのを防ぐ
   * — IP 許可リストはセキュリティ境界の設定のため reorderSystems と同水準の保護を要する。
   * 共通ヘルパ経由のため競合 abort（P2034）は既定 3 回まで自動リトライされる。
   */
  async replaceIpWhitelist(entries: { cidr: string; note: string }[]): Promise<IpWhitelistEntry[]> {
    // 再読込まで同一 tx に閉じる。tx の外で読み直すと、ほぼ同時の別 PUT の結果が返り
    // 「保存した内容と画面の一覧が食い違う」（cmn-0209）。共通ヘルパに乗せて P2034 リトライも効かせる。
    return runInSerializableTransaction(this.prisma, async (tx) => {
      await tx.ipWhitelistEntry.deleteMany({});
      if (entries.length > 0) {
        await tx.ipWhitelistEntry.createMany({
          data: entries.map((e, index) => ({ cidr: e.cidr, note: e.note, sortOrder: index })),
        });
      }
      return tx.ipWhitelistEntry.findMany({
        orderBy: LoginSettingsRepository.IP_WHITELIST_ORDER_BY,
      });
    });
  }
}
