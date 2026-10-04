'use client';

import { AppShell } from '@/features/shell';
import { useBoardReachable } from '@/features/backlog';
import styles from './page.module.css';

// バックログタブ。Instruction Board v2（別プロセス・別オリジン）の画面を iframe で全面表示する。
// v2 の画面（/v2.html）は自前のナビ（対応中／最終確認待ち／完了＋開発計画・点検）と一覧・詳細を
// 持つため、rete 側にナビやサイドバーを持たない（サイドバーは二重にしない）。
// URL は譲渡先で差し替えられるよう env 経由。未設定なら未配線表示になる（iframe を出さない）。
const BOARD_URL = process.env.NEXT_PUBLIC_INSTRUCTION_BOARD_URL || '';
const BOARD_PATH = '/v2.html';

export default function Page() {
  // Board 停止中は iframe 内に生のブラウザ接続拒否ページが出るため、rete 側で案内を重ねる（brd-0180）。
  const reachable = useBoardReachable(BOARD_URL);

  return (
    <AppShell activeTab="backlog" sidebar={false}>
      <div className={styles.wrap}>
        {BOARD_URL ? (
          // allow=clipboard-write: Board は別オリジンなので、allow が無いと iframe 内の
          // navigator.clipboard.writeText がブラウザに拒否される（チケットNo のコピーボタンが
          // Board 直開きでは効くのにこのタブでは効かない、という壊れ方になる・brd-0224）。
          <iframe
            src={`${BOARD_URL}${BOARD_PATH}`}
            title="指示ボード（バックログ）"
            className={styles.frame}
            allow="clipboard-write"
          />
        ) : (
          // 本番未配線（NEXT_PUBLIC_INSTRUCTION_BOARD_URL 空）: 空 URL のまま iframe を出すと
          // 相対 src で rete 自身を読み込み frame-ancestors 'none' に弾かれるため、出さない。
          <div className={styles.notice} role="status">
            指示ボードは未配線です（NEXT_PUBLIC_INSTRUCTION_BOARD_URL 未設定）
          </div>
        )}
        {BOARD_URL && !reachable && (
          <div className={styles.notice} role="status">
            指示ボードに接続できません
          </div>
        )}
      </div>
    </AppShell>
  );
}
