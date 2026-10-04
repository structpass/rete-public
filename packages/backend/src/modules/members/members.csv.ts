import type { MemberDto } from '@rete/shared';
import { toCsv } from '../../common/text/csv';

/**
 * メンバー一覧（ST-4）の CSV エクスポート行生成。MemberDto を業務カラムへ写し、generic な toCsv で整形する。
 */

const MEMBER_CSV_HEADERS = ['表示名', 'メールアドレス', '状態', '作成日時', '最終更新日時'];

/**
 * @param members 一覧（mapper 済 DTO・作成順）
 */
export function buildMembersCsv(members: MemberDto[]): string {
  const rows = members.map((m) => [
    m.name,
    m.email,
    m.isActive ? '有効' : 'ロック',
    m.createdAt,
    m.updatedAt,
  ]);
  return toCsv(MEMBER_CSV_HEADERS, rows);
}
