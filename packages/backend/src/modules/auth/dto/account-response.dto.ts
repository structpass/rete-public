/**
 * ログインユーザーの公開 shape（§1 DTO 境界・v2-245 で shared へ集約）。
 * 契約形（shape）は @rete/shared の `types/account` を単一ソースとし、本ファイルは同名・同形の
 * 別名として再公開する（mapper / controller / frontend の import パスは変えない）。
 *
 * Prisma Account を直返ししないことで passwordHash / isActive / 内部タイムスタンプの漏洩を防ぐ。
 * role は frontend の権限出し分け（掲示板の編集導線表示）に使う公開情報。
 * mfaSetupRequired / mustChangePassword の意味と任意のまま維持する理由は shared 側の
 * コメント（set-0032 / set-0035 / set-0041）を参照。
 */

export type { AccountResponseDto } from '@rete/shared';
