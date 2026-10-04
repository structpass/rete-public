/**
 * メンバー（アカウント管理・Settings ST-4）の共有型（SSOT）。
 *
 * メンバー実体は既存 Account を流用する（新 user_account モデルは作らず二重化を避ける）。
 * 「有効/ロック」は既存 Account.isActive を流用（false=ロック / ログイン不可）。lock は即時有効で
 * hardening H4 の enforcement を待たない（認証経路が isActive=false を 401 で弾く既存境界に乗る）。
 *
 * 二層併存（ST-3 と同じ）: ここで割り当てる「業務ロール」（RoleDefinition）は、システム権限層の
 * `Role`（account.ts の ADMIN/MEMBER）とは別レイヤ。1 アカウント 1 業務ロール（単一割当）。
 *
 * enforcement（割当に基づく各 API の認可強制）は本トラックの責務外（hardening H4）。ST-4 は「割当」まで。
 * backend の DTO / mapper と frontend のメンバー画面が本定義を import して使う（§5 shared 型整合）。
 */

/** メンバー 1 件の Response 形（= Account）。email を含むため ADMIN 限定。 */
export interface MemberDto {
  id: string;
  /** 表示名（familyName + givenName を半角スペース連結した導出値。一覧・検索・イニシャル用）。 */
  name: string;
  /** 姓（set-0096）。 */
  familyName: string;
  /** 名（set-0096・空文字可）。 */
  givenName: string;
  /** メールアドレス（PII・一覧表示用。endpoint は ADMIN 限定）。 */
  email: string;
  /** 有効 / ロック（false=ロック・ログイン不可）。既存 Account.isActive。 */
  isActive: boolean;
  /**
   * ログイン試行ロックアウト（brute-force 防御・set-0025 P4）の解除予定時刻（ISO 文字列）。null=ロックアウトなし。
   * 値が未来＝現在ロックアウト中（自動解除待ち）/ 過去＝期限切れ（次回ログインで自動リセット）。
   * 管理画面はこの値が未来のアカウントを「ロックアウト中」と表示し、自動 15 分を待たず手動即時解除を提供する。
   * 既存 isActive ロック（管理者の手動無効化）とは別軸（こちらは認証失敗の連続による自動防御）。
   */
  lockedUntil: string | null;
  /**
   * 二段階認証（MFA/TOTP・ST-2-2）を有効化済みか（set-0033）。true=確認済 MFA あり。
   * 管理画面はこの値が true のメンバーに「MFA を管理者リセット」操作を提供する（TOTP・バックアップ全喪失時の復旧）。
   * MFA は self-service（本人のみ setup/disable）だが、認証手段を全喪失した利用者は管理者リセットでのみ復旧できる。
   */
  mfaEnabled: boolean;
  /** 作成日時（ISO 文字列）。 */
  createdAt: string;
  /** 最終更新日時（ISO 文字列）。 */
  updatedAt: string;
}

/**
 * メンバー更新の入力（部分更新・PATCH /members/:id）。項目はすべて省略可（全未指定は backend が BadRequest）。
 * - familyName / givenName: 姓・名（set-0096）。どちらか指定時は両方が更新対象となり name を再組み立てする。
 * - isActive: ロック/解除（false=ロック）。自分自身のロックは backend が弾く（自己ロックアウト防止）。
 * - email: メールアドレス（=ログイン識別子・set-0097）。保存時に小文字へ正規化され、既に使用中の値は弾く。
 *   同じ値を送った場合は据え置き扱い（差分なし）。変更後は次回ログインから新 email が必要。
 */
export interface MemberUpdateInput {
  familyName?: string;
  givenName?: string;
  isActive?: boolean;
  email?: string;
}
