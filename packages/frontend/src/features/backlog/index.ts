// バックログタブの公開境界。Board v2 の画面は iframe で全面表示し、rete 側は疎通判定だけを持つ
// （ナビ定義・並列セッション一覧は v2 で廃止）。
export { useBoardReachable } from './hooks/use-board-reachable';
