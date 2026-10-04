'use client';

import { REACTION_EMOJIS } from '@rete/shared';
import { cn } from '@/lib/utils';
import { EMOJI_CATEGORIES } from '../lib/emoji-data';

/**
 * リアクション絵文字ピッカー（rete-desk-0094）。
 * 「最近使った」(最大10件・localStorage 由来) を先頭に、その下へ一般絵文字をカテゴリ別グリッドで全表示する。
 * presentational：recent と onSelect/busy のみ受け取り、永続化（useRecentEmojis）と toggle は呼び出し側（ReactionBar）が持つ。
 * 最近使用が空のときは既定クイックセット（REACTION_EMOJIS）をフォールバック表示する。
 * floating=true のとき自前の絶対配置を捨て静的フローになる（rete-desk-0136: 呼び出し側 ReactionBar が
 * body 直下 portal + fixed でビューポート基準に配置し、スクロール容器の overflow クリップを回避する）。
 */
export function ReactionPicker({
  recent,
  onSelect,
  busy,
  floating = false,
}: {
  recent: string[];
  onSelect: (emoji: string) => void;
  busy: boolean;
  floating?: boolean;
}) {
  const recentDisplay = recent.length > 0 ? recent : [...REACTION_EMOJIS];

  return (
    <div
      className={cn('desk-reaction-picker', floating && 'is-floating')}
      role="menu"
      aria-label="絵文字を選択"
    >
      <div className="desk-reaction-picker-scroll">
        <section className="desk-reaction-picker-section">
          <h4 className="desk-reaction-picker-heading">最近使った</h4>
          <div className="desk-reaction-picker-grid">
            {recentDisplay.map((emoji, i) => (
              <button
                key={`recent-${emoji}-${i}`}
                type="button"
                role="menuitem"
                className="desk-reaction-picker-item"
                aria-label={emoji}
                disabled={busy}
                onClick={() => onSelect(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </section>
        {EMOJI_CATEGORIES.map((cat) => (
          <section key={cat.key} className="desk-reaction-picker-section">
            <h4 className="desk-reaction-picker-heading">{cat.label}</h4>
            <div className="desk-reaction-picker-grid">
              {cat.emojis.map((emoji) => (
                <button
                  key={`${cat.key}-${emoji}`}
                  type="button"
                  role="menuitem"
                  className="desk-reaction-picker-item"
                  aria-label={emoji}
                  disabled={busy}
                  onClick={() => onSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
