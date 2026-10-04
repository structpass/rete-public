'use client';

import { useState } from 'react';
import { Pagination } from '@/components/shared/pagination';
import { Labeled, DemoRow } from './shared';

/**
 * comp-table テーマの実描画見本（mdl-0016）。
 * 実物の .sp-table クラス・共通 Pagination コンポーネントを描画するため、実装改修に自動追随する。
 */

/** ヘッダー行の意匠（Desk 由来・font-size/中央寄せ/薄罫線/列区切り）。 */
export function TableHeaderDemo() {
  return (
    <div className="max-w-lg overflow-hidden rounded-md border border-[var(--sp-line-warm)]">
      <table className="sp-table">
        <thead>
          <tr>
            <th>タイトル</th>
            <th style={{ width: 90 }}>状態</th>
            <th style={{ width: 110 }}>更新日</th>
            <th style={{ width: 90, textAlign: 'right' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>金庫 屋内用</td>
            <td>公開中</td>
            <td>2026/07/05</td>
            <td style={{ textAlign: 'right' }}>編集</td>
          </tr>
          <tr>
            <td>センサーライト</td>
            <td>下書き</td>
            <td>2026/07/03</td>
            <td style={{ textAlign: 'right' }}>編集</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** フッター（ページネーション）の意匠。実データあり=ナビ有効、全件表示のみ=ナビなし静的の2パターン。 */
export function TableFooterDemo() {
  const [page, setPage] = useState(2);
  const totalPages = 20;
  return (
    <DemoRow>
      <Labeled label="実ページング（監査ログ等・ナビ有効）">
        <div className="w-80 overflow-hidden rounded-md border border-[var(--sp-line-warm)]">
          <Pagination
            total={`全 1,000 件`}
            pageLabel={`${page} / ${totalPages} page`}
            onFirst={() => setPage(1)}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            onLast={() => setPage(totalPages)}
            canPrev={page > 1}
            canNext={page < totalPages}
          />
        </div>
      </Labeled>
      <Labeled label="全件表示のみ（メンバー一覧等・ナビなし静的）">
        <div className="w-80 overflow-hidden rounded-md border border-[var(--sp-line-warm)]">
          <Pagination total="全 12 件" />
        </div>
      </Labeled>
    </DemoRow>
  );
}

/** 正しい例: 共通 .sp-table + Pagination をそのまま使う。 */
export function TableUsageGoodDemo() {
  return (
    <div className="max-w-md overflow-hidden rounded-md border border-[var(--sp-line-warm)]">
      <table className="sp-table">
        <thead>
          <tr>
            <th>タグ名</th>
            <th style={{ width: 70, textAlign: 'right' }}>件数</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>優先度高</td>
            <td style={{ textAlign: 'right' }}>8</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * だめな例: ヘッダーと明細を同じ文字サイズにする / 濃い罫線色を使う。
 * 規約違反の展示のため意図的に inline style で書いている（実装で真似しない）。
 */
export function TableUsageBadDemo() {
  return (
    <div className="max-w-md overflow-hidden rounded-md border border-[var(--sp-line-warm)]">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr>
            <th
              style={{
                textAlign: 'left',
                fontSize: '0.875rem',
                color: 'var(--sp-text-warm-mute)',
                borderBottom: '1px solid var(--sp-line-warm)',
                padding: '0.5rem',
              }}
            >
              タグ名
            </th>
            <th
              style={{
                textAlign: 'right',
                fontSize: '0.875rem',
                borderBottom: '1px solid var(--sp-line-warm)',
                padding: '0.5rem',
              }}
            >
              件数
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '0.5rem' }}>優先度高</td>
            <td style={{ padding: '0.5rem', textAlign: 'right' }}>8</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
