/**
 * set-0180: システム利用権限（BusinessRole / RoleDefinition / FeaturePermission）は撤去。
 * 本ファイルは空モジュールとして残し、`export * from './role'` の barrel 参照を維持する。
 * 依存する consumer（roles モジュール・権限画面・FeaturePermissionGuard）は各フェーズで撤去済み。
 */
export {};
