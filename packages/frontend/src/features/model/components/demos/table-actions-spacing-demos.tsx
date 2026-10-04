'use client';

import { Button } from '@/components/ui/button';
import { Labeled, DemoRow } from './shared';

/**
 * ui.ts「table-actions-spacing」テーマの実描画見本（cmn-0145）。
 * 上のアクションボタン行（透過地・枠なし）から下の表ヘッダ罫線までの隙間を 4px / 12px で対比する。
 * 規約違反の展示のため bad 側は意図的に inline style で書いている（実装で真似しない）。
 */

/** 良い例: ボタン行と表の間が 4px（mb-1）。reference ListPageActions mb-1 = 4px 準拠。 */
export function TableActionsSpacingGoodDemo() {
  return (
    <Labeled label="4px — mb-1（推奨）">
      <div className="w-72 rounded-md border border-[var(--sp-line-warm)]">
        <div className="mb-1 flex justify-end px-2 pt-2">
          <Button type="button" variant="sp-action" size="sp-compact">
            新規登録
          </Button>
        </div>
        <table className="sp-table">
          <thead>
            <tr>
              <th>タイトル</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>テストデータ</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Labeled>
  );
}

/** だめな例: ボタン行と表の間が 12px（mb-3）。ボタンが表から浮いて見える状態。 */
export function TableActionsSpacingBadDemo() {
  return (
    <Labeled label="12px — mb-3（cmn-0145 撤廃対象）">
      <div className="w-72 rounded-md border border-[var(--sp-line-warm)]">
        <div className="mb-3 flex justify-end px-2 pt-2">
          <Button type="button" variant="sp-action" size="sp-compact">
            新規登録
          </Button>
        </div>
        <table className="sp-table">
          <thead>
            <tr>
              <th>タイトル</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>テストデータ</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Labeled>
  );
}

/** 良い例 + だめ例 を並べるデモ。 */
export function TableActionsSpacingDemo() {
  return (
    <DemoRow>
      <TableActionsSpacingGoodDemo />
      <TableActionsSpacingBadDemo />
    </DemoRow>
  );
}
