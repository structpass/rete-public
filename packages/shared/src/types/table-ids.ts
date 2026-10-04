// 列幅永続化機能用の table 識別子 SSOT。
// backend の入力検証と frontend の型安全（TableId 型）の双方が import する。
export const TABLE_IDS = ['files-list'] as const;

export type TableId = (typeof TABLE_IDS)[number];
