'use client';

import { useEffect, useState } from 'react';
import { GripVertical, Package, Star, Trash2, X } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  FAVORITE_KIND_BADGE_LABELS,
  type FavoriteDto,
  type ReferenceObjectTypeSummary,
} from '@rete/shared';
import { cn } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/error-utils';
import { useOptimisticReorder } from '@/hooks/use-optimistic-reorder';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { Spinner } from '@/components/ui/spinner';
import { OverlayCloseButton, OverlayDialog } from '@/components/ui/overlay-dialog';

interface FavoritesManageOverlayProps {
  open: boolean;
  onClose: () => void;
  items: FavoriteDto[];
  loading: boolean;
  /** useFavorites 由来のエラー（取得失敗 / mutation 後の再取得失敗）。操作エラーと併せて表示する。 */
  error: string | null;
  remove: (id: string) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
  /** hom-0067: reference の ObjectType 種別一覧（動的取得・ADMIN 限定表示）。 */
  referenceObjectTypes?: ReferenceObjectTypeSummary[];
  /** hom-0067: お気に入り追加（reference 種別トグル用）。 */
  add?: (input: { kind: 'system'; targetRef: string; label: string }) => Promise<void>;
  /** hom-0067: reference 種別グループを表示するか（ADMIN ロールのみ・criteria【7】）。 */
  canShowReferenceGroup?: boolean;
}

/**
 * HOME サイドバーの横断お気に入り（HM-1）の管理オーバーレイ（hom-0137 で追加機能を撤去）。
 * 削除 / D&D による並び替えを行う。データ取得・楽観並び替えは親が持つ useFavorites に委譲し、
 * 本コンポーネントは操作 UI と操作中の多重送信ガード・エラー表示のみを担う。
 */
export function FavoritesManageOverlay({
  open,
  onClose,
  items,
  loading,
  error,
  remove,
  reorder,
  referenceObjectTypes,
  add,
  canShowReferenceGroup,
}: FavoritesManageOverlayProps) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 開くたびにエラーをリセットする。
  useEffect(() => {
    if (!open) return;
    setActionError(null);
    setBusy(false);
  }, [open]);

  const run = async (op: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setActionError(null);
    try {
      await op();
      return true;
    } catch (e) {
      setActionError(extractErrorMessage(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = (id: string) => {
    void run(() => remove(id), 'お気に入りの削除に失敗しました');
  };

  // cmn-0357: センサー設定・共通判定・順序計算・施錠は共通フックへ集約した。
  // busy（他操作の往復中）は本画面固有の追加抑止として isBlocked で渡す。run() 内でも弾かれるが、
  // 他操作の往復中は「掴めるのに黙って戻る」無言の失敗になるため意図を明示しておく。
  const { sensors, handleDragEnd } = useOptimisticReorder<FavoriteDto>({
    items,
    isBlocked: () => busy,
    onReorder: (reordered) =>
      run(() => reorder(reordered.map((f) => f.id)), '並び替えに失敗しました'),
  });

  // フック由来エラー（取得 / mutation 後の再取得失敗）を優先表示し、無ければ操作エラー。
  // これにより remove 成功後の再取得失敗が「成功表示のまま放置」されるのを防ぐ。
  const shownError = error ?? actionError;

  // hom-0138: 行 hover は行個別の :hover 背景ではなく共通の帯スライド（正本=モデルタブ
  // 「マウスホバー表現」）。@dnd-kit の transform は offsetTop 測位に影響しない（file-list.tsx の
  // DnD+帯共存が実働先例）。帯はラッパ（position:relative）末尾の装飾専用要素。
  const { listRef, onMouseOver, onMouseLeave, bandStyle } =
    useRowHoverBand<HTMLDivElement>('li.sp-row-pillable');

  return (
    <OverlayDialog
      open={open}
      onClose={onClose}
      ariaLabel="お気に入りの管理"
      width="min(290px, 90vw)"
    >
      <div className="flex h-[420px] max-h-[80vh] w-full flex-col rounded-lg bg-white shadow-xl">
        {/* cmn-0355 適用外: file-overlay-* を使わない別意匠（sp-* Tailwind 直書き）のため OverlayHeader を使わない。 */}
        <div className="flex items-center justify-between border-b border-[var(--sp-line-warm)] px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--sp-text-warm)]">
            <Star className="h-4 w-4" aria-hidden="true" />
            お気に入りの管理
          </h2>
          <OverlayCloseButton
            className="rounded p-1 text-[var(--sp-text-warm-mute)] hover:bg-[var(--sp-accent-soft)] hover:text-[var(--sp-accent-ink)]"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </OverlayCloseButton>
        </div>

        {shownError && (
          <p className="px-4 pt-3 text-sm text-[var(--sp-accent-red)]" role="alert">
            {shownError}
          </p>
        )}

        {/* hom-0067: reference 種別グループ（ADMIN ロールのみ表示・criteria【7】）。 */}
        {canShowReferenceGroup && (
          <div className="border-b border-[var(--sp-line-warm)] px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--sp-text-warm)]">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              reference 種別から追加
            </div>
            {loading ? (
              <div className="flex justify-center py-2">
                <Spinner className="h-3.5 w-3.5" />
              </div>
            ) : referenceObjectTypes && referenceObjectTypes.length > 0 ? (
              <div className="flex max-h-40 flex-col gap-px overflow-y-auto">
                {referenceObjectTypes.map((t) => {
                  const existing = items.find((f) => f.kind === 'system' && f.targetRef === t.key);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={cn(
                        'flex items-center gap-2 rounded px-2 py-1 text-left text-sm text-[var(--sp-text-warm)] hover:bg-[var(--sp-accent-soft)]',
                      )}
                      aria-pressed={existing != null}
                      disabled={busy}
                      onClick={() => {
                        void run(() => {
                          if (existing) {
                            return remove(existing.id);
                          }
                          return add!({ kind: 'system', targetRef: t.key, label: t.name });
                        }, 'お気に入りの更新に失敗しました');
                      }}
                    >
                      <Star
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                        fill={existing ? 'currentColor' : 'none'}
                      />
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="shrink-0 text-[10px] text-[var(--sp-text-warm-mute)]">
                        {existing ? '登録済み' : t.isPreset ? 'プリセット' : '台帳'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--sp-text-warm-mute)]">
                reference 種別を取得できませんでした（未接続または縮退）
              </p>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-6">
              <Spinner className="h-4 w-4" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--sp-text-warm-mute)]">
              お気に入りはまだありません
            </p>
          ) : (
            <div
              ref={listRef}
              className="relative"
              onMouseOver={onMouseOver}
              onMouseLeave={onMouseLeave}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex flex-col divide-y divide-[var(--sp-line-warm)] rounded border border-[var(--sp-line-warm)]">
                    {items.map((fav) => (
                      <SortableFavoriteRow
                        key={fav.id}
                        fav={fav}
                        busy={busy}
                        onRemove={() => handleRemove(fav.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              {/* hover 帯（装飾専用）。一覧の後に置き、bandStyle 非 null の時だけ描く。 */}
              {bandStyle ? (
                <div aria-hidden className="sp-row-hoverband" style={bandStyle} />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </OverlayDialog>
  );
}

/**
 * 並べ替え可能な 1 行（hom-0129）。listeners は左端のグリップにだけ張り、行全体はドラッグ対象に
 * しない（削除ボタンのクリックがドラッグ開始と競合しないようにするため・分類設定と同型）。
 */
function SortableFavoriteRow({
  fav,
  busy,
  onRemove,
}: {
  fav: FavoriteDto;
  busy: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fav.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'sp-row-pillable flex items-center gap-2 px-2 py-1.5',
        isDragging && 'relative z-10 bg-white shadow',
      )}
    >
      <span
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="shrink-0 text-[var(--sp-text-warm-mute)]"
        aria-label={`${fav.label} を並び替え`}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className={cn('fav-kind-sidebar shrink-0', `kind-${fav.kind}`)}>
        {FAVORITE_KIND_BADGE_LABELS[fav.kind]}
      </span>
      <span className="flex-1 truncate text-sm text-[var(--sp-text-warm)]" title={fav.label}>
        {fav.label}
      </span>
      <button
        type="button"
        className="rounded p-1 text-[var(--sp-text-warm-mute)] enabled:hover:bg-[color-mix(in_srgb,var(--sp-accent-red)_8%,transparent)] enabled:hover:text-[var(--sp-accent-red)] disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={`${fav.label} を削除`}
        disabled={busy}
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}
