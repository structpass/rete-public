/**
 * 1 投稿に指定できる宛先（メンション先）アカウント ID の上限（cmn-0281 で SSOT を chat 側から本ファイルへ移動）。
 * 巨大配列による DB 負荷（IN 句 / createMany 行数）を入力境界で遮断する（filter / posting で共通 / rete-desk-0049）。
 * 現実の宛先数を大きく上回る安全側の値（100 は再変更しない／既存 spec で値固定を検証）。
 */
export const MAX_MENTION_IDS = 100;
