'use client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DiscardConfirmDialog } from '@/components/ui/discard-confirm-dialog';
import { avatarColor, avatarInitial } from '@/features/desk/components/desk-avatar';
import { DeskTaskForm } from '@/features/desk/components/desk-task-form';
import { ReactionBar } from '@/features/desk/components/reaction-bar';
import { RichTextView } from '@/features/desk/components/rich-text-view';
import { AttachmentList, AttachmentPanel } from '@/features/desk/components/task-attachments';
import { CommentEditForm } from '@/features/desk/components/task-detail/comment-edit-form';
import { DetailCommentComposer } from '@/features/desk/components/task-detail/detail-comment-composer';
import { TaskDetailHead } from '@/features/desk/components/task-detail/task-detail-head';
import { TaskDetailHistory } from '@/features/desk/components/task-detail/task-detail-history';
import { TaskDetailOutcome } from '@/features/desk/components/task-detail/task-detail-outcome';
import { useTaskDetailController } from '@/features/desk/hooks/use-task-detail-controller';
import type { TaskDetailOverlayProps } from '@/features/desk/lib/task-detail-types';
import { isRichTextEmpty } from '@/features/desk/lib/validations';
import { taskToFormValues } from '@/features/tasks/lib/api';
import { formatDateTime } from '@/lib/utils';
import { type ReactionEmoji } from '@rete/shared';
import { MoreHorizontal, Pencil, X } from 'lucide-react';
export { formatActivityText } from '@/features/desk/lib/task-activity-text';

const DETAIL_FORM_ID = 'desk-detail-task-form';
export function TaskDetailOverlay({
  task,
  categories,
  parentTasks,
  accounts,
  currentUserId,
  error,
  saving,
  onClose,
  onSave,
  onReparent,
  onDirtyChange,
  escapeInterceptorRef,
  taskKeyword,
  onToggleReaction,
}: TaskDetailOverlayProps) {
  const {
    activeTab,
    setActiveTab,
    tabStripRef,
    onTabStripMouseOver,
    onTabStripMouseLeave,
    tabHoverBandStyle,
    setCommentDirty,
    mentionItems,
    attachmentsCtl,
    attachmentDirty,
    taskComments,
    editingCommentId,
    setEditingCommentId,
    deleteCommentId,
    setDeleteCommentId,
    setCommentEditDirty,
    commentEditAttachments,
    deleteCommentError,
    setDeleteCommentError,
    deletingComment,
    setDeletingComment,
    commentMenuId,
    setCommentMenuId,
    commentMenuRef,
    commentMenuBtnRef,
    threadPaneBodyRef,
    commentMenuFlip,
    activitiesTruncated,
    activitiesError,
    reloadActivities,
    tenmatsu,
    setTenmatsu,
    tenmatsuEditing,
    setTenmatsuEditing,
    formDirty,
    setFormDirty,
    gateError,
    setGateError,
    saveError,
    tenmatsuDirty,
    editingHead,
    setEditingHead,
    headTitle,
    setHeadTitle,
    headDescription,
    setHeadDescription,
    headDirty,
    guardBeforeSubmit,
    handleSubmit,
    handleHeadSave,
    editDiscard,
    handleCancelCommentEdit,
    handleHeadCancel,
    handleSaveTenmatsu,
    tenmatsuKeyword,
    showTenmatsuHighlight,
    creatorLabel,
    isHeadOwner,
    historyRows,
  } = useTaskDetailController({
    task,
    accounts,
    currentUserId,
    onSave,
    onReparent,
    onDirtyChange,
    escapeInterceptorRef,
    taskKeyword,
  });

  return (
    <section data-left-view="detail" aria-label="タスク詳細" className="desk-view is-active">
      {/* コメント削除の確認（dsk-0241）。チャットのメッセージ削除と同じ Rete デザインダイアログを文言差し替えで共用。
          確認で taskComments.remove を呼ぶ。フックは DELETE 成功を待ってから一覧から取り除く（楽観削除ではない）。
          失敗（false）時は一覧を変えずエラーを表示する（編集失敗と対称に「消えなかった」ことを明示）。 */}
      <ConfirmDialog
        open={deleteCommentId != null}
        message="このコメントを削除しますか？元に戻せません。"
        destructive
        busy={deletingComment}
        onConfirm={() => {
          const id = deleteCommentId;
          if (!id || deletingComment) return;
          setDeletingComment(true);
          setDeleteCommentError(null);
          void taskComments
            .remove(id)
            .then((ok) => {
              if (ok) setDeleteCommentId(null);
              setDeleteCommentError(ok ? null : 'コメントの削除に失敗しました');
            })
            .finally(() => setDeletingComment(false));
        }}
        onCancel={() => setDeleteCommentId(null)}
      />
      {/* 編集モード解除（起点カード / コメント編集）の破棄確認（mdl-0034 規約②）。 */}
      <DiscardConfirmDialog
        open={editDiscard.open}
        onConfirm={editDiscard.onConfirm}
        onCancel={editDiscard.onCancel}
      />
      {/* dsk-0219: タスク切替/再取得時は直前内容を保持し裏で差し替える（stale-while-revalidate）。
          dsk-0234（案A）: 開く瞬間のスピナーフラッシュ源を断つため、初回ロード中（task 未確定）は
          スピナーを描画せず空（取得完了で内容が差し込まれる）。遅延表示方式でも残ったフラッシュを、
          スピナーを出す経路自体を断って恒久的に解消する。 */}
      {error && (
        <p role="alert" className="px-3 pt-2 text-xs text-[var(--sp-accent-red)]">
          {error}
        </p>
      )}
      {/* dsk-0219: loading を条件から外し、stale な task があれば再取得中も内容を出し続ける。
          取得失敗時は error が立ち content を隠してエラー表示へフォールバックする。 */}
      {!error && task && (
        <div className="desk-detail-split">
          {/* ===== 左列: スレッド / 顛末 / プロパティ履歴 ===== */}
          <div className="desk-detail-thread">
            <div
              className="desk-ticket-tabs"
              role="tablist"
              aria-label="タスク詳細タブ"
              ref={tabStripRef}
              onMouseOver={onTabStripMouseOver}
              onMouseLeave={onTabStripMouseLeave}
            >
              {tabHoverBandStyle ? (
                <div
                  aria-hidden="true"
                  className="desk-ticket-tab-hoverband"
                  style={tabHoverBandStyle}
                />
              ) : null}
              <button
                type="button"
                role="tab"
                data-detail-tab="thread"
                aria-selected={activeTab === 'thread'}
                className={`desk-ticket-tab${activeTab === 'thread' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('thread')}
              >
                スレッド
              </button>
              <button
                type="button"
                role="tab"
                data-detail-tab="tenmatsu"
                aria-selected={activeTab === 'tenmatsu'}
                className={`desk-ticket-tab${activeTab === 'tenmatsu' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('tenmatsu')}
              >
                顛末
              </button>
              <button
                type="button"
                role="tab"
                data-detail-tab="history"
                aria-selected={activeTab === 'history'}
                className={`desk-ticket-tab${activeTab === 'history' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('history')}
              >
                履歴
              </button>
            </div>

            {activeTab === 'thread' && (
              <div className="desk-pane-body" data-detail-tabpanel="thread" ref={threadPaneBodyRef}>
                <div className="desk-thread-view">
                  {/* 起点カード: 題名 + 説明 + アクション（編集 = 配線済 rete-desk-0189 / その他 = 見た目のみ・Phase C） */}
                  <TaskDetailHead
                    task={task}
                    saving={saving}
                    taskKeyword={taskKeyword}
                    onToggleReaction={onToggleReaction}
                    mentionItems={mentionItems}
                    attachmentsCtl={attachmentsCtl}
                    saveError={saveError}
                    editingHead={editingHead}
                    setEditingHead={setEditingHead}
                    headTitle={headTitle}
                    setHeadTitle={setHeadTitle}
                    headDescription={headDescription}
                    setHeadDescription={setHeadDescription}
                    handleHeadSave={handleHeadSave}
                    handleHeadCancel={handleHeadCancel}
                    creatorLabel={creatorLabel}
                    isHeadOwner={isHeadOwner}
                  />
                  {/* コメント一覧（dsk-0214・GET /tasks/:id/comments を createdAt 昇順で時系列表示）。chat 詳細の
                      発話一覧と同じ .desk-thread-comment 意匠。メンション（dsk-0203）/編集（dsk-0241）/
                      リアクション（dsk-0297）対応。 */}
                  {/* dsk-0234（案A）: 開く度に走るコメント取得のスピナーが詳細を開く瞬間にフラッシュするため、
                      初回ロード中はスピナーを出さず空にする（取得完了でコメントが差し込まれる）。 */}
                  {taskComments.error && (
                    <p role="alert" className="px-1 py-2 text-xs text-[var(--sp-accent-red)]">
                      {taskComments.error}
                    </p>
                  )}
                  {/* 削除失敗のフィードバック（dsk-0241）。成功で消える（onConfirm が null へ戻す）。 */}
                  {deleteCommentError && (
                    <p role="alert" className="px-1 py-2 text-xs text-[var(--sp-accent-red)]">
                      {deleteCommentError}
                    </p>
                  )}
                  {taskComments.comments.length > 0 && (
                    <ul className="m-0 list-none p-0">
                      {taskComments.comments.map((c) => {
                        // 自分のコメントのみ編集・削除導線を出す（dsk-0241・所有判定 c.author.id===currentUserId）。
                        // 他人のコメントにはボタンを出さない（backend も 403 で IDOR を塞ぐ・表示は UX ガード）。
                        const isOwnComment = currentUserId != null && c.author.id === currentUserId;
                        const isEditingComment = editingCommentId === c.id;
                        return (
                          <li key={c.id} className="desk-thread-comment">
                            <span
                              className="desk-thread-comment-avatar"
                              style={{ background: avatarColor(c.author.id), color: 'white' }}
                            >
                              {avatarInitial(c.author.name)}
                            </span>
                            <div className="desk-thread-comment-body">
                              <div className="desk-thread-comment-head">
                                <span className="desk-thread-comment-author truncate">
                                  {c.author.name}
                                </span>
                                {/* dsk-0243: スレッド日時は全画面で年付き yyyy/mm/dd hh:mm（formatDateTime）に統一。
                                    チャット詳細の発話/起点カード日時も同フォーマッタに揃えた（旧 formatChatTimestamp は撤去）。 */}
                                <span className="shrink-0">{formatDateTime(c.createdAt)}</span>
                                {/* 編集・その他トリガ（dsk-0241 → dsk-0267）。編集中の行ではトリガを隠して
                                    フォームへ集中させる（チャット発話編集 rete-desk-0146 と同方針）。
                                    削除は独立 trash ボタンから「その他」メニューへ一本化（dsk-0267）。 */}
                                {isOwnComment && !isEditingComment && (
                                  <span className="ml-auto flex shrink-0 gap-1">
                                    <button
                                      type="button"
                                      className="desk-thread-head-icon-btn"
                                      title="編集"
                                      aria-label="コメントを編集"
                                      onClick={() => {
                                        // メニューを開いたまま編集へ入ると commentMenuId が残留し、
                                        // document リスナー（ESC 消費）が生き続ける／編集キャンセルで
                                        // メニューが再出現する。編集開始時に必ず閉じる（dsk-0267）。
                                        setCommentMenuId(null);
                                        setEditingCommentId(c.id);
                                      }}
                                    >
                                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      ref={commentMenuId === c.id ? commentMenuBtnRef : undefined}
                                      className="desk-thread-head-icon-btn"
                                      title="その他"
                                      aria-label="その他"
                                      aria-haspopup="menu"
                                      aria-expanded={commentMenuId === c.id}
                                      aria-controls={`desk-thread-comment-menu-${c.id}`}
                                      onClick={() =>
                                        setCommentMenuId((cur) => (cur === c.id ? null : c.id))
                                      }
                                    >
                                      <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                )}
                                {/* その他メニュー（dsk-0267）。chat 起点カード（rete-desk-0095/dsk-0248）の横展開。
                                    head（position:relative）の右肩から下へ開く。下端付近では is-flip-up で
                                    上向きへ開く（dsk-0288・スクロールリスト内での見切れ対策）。 */}
                                {commentMenuId === c.id && !isEditingComment && (
                                  <div
                                    id={`desk-thread-comment-menu-${c.id}`}
                                    ref={commentMenuRef}
                                    className={
                                      commentMenuFlip
                                        ? 'desk-thread-head-menu is-flip-up'
                                        : 'desk-thread-head-menu'
                                    }
                                    role="menu"
                                    aria-label="その他メニュー"
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="desk-thread-head-menu-item"
                                      onClick={() => {
                                        setCommentMenuId(null);
                                        // 空本文はコピーもタブ切替もしない（chat 起点カード dsk-0248 と同ガード）。
                                        if (isRichTextEmpty(c.body)) return;
                                        // 顛末ドラフトが空なら置換・内容ありなら末尾追記（chat 起点カード踏襲・
                                        // コピーは保存ではなくドラフト反映＝顛末タブの保存で確定）。
                                        setTenmatsu((prev) =>
                                          isRichTextEmpty(prev) ? c.body : `${prev}${c.body}`,
                                        );
                                        setGateError(false);
                                        setActiveTab('tenmatsu');
                                      }}
                                    >
                                      メッセージを顛末へコピー
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="desk-thread-head-menu-item is-destructive"
                                      onClick={() => {
                                        setCommentMenuId(null);
                                        setDeleteCommentError(null);
                                        setDeleteCommentId(c.id);
                                      }}
                                    >
                                      メッセージの削除
                                    </button>
                                  </div>
                                )}
                              </div>
                              {isEditingComment ? (
                                <CommentEditForm
                                  initialBody={c.body}
                                  mentionItems={mentionItems}
                                  attachmentsController={commentEditAttachments}
                                  onDirtyChange={setCommentEditDirty}
                                  onSave={async (body, mentionAccountIds) => {
                                    const ok = await taskComments.update(
                                      c.id,
                                      body,
                                      mentionAccountIds,
                                    );
                                    if (!ok) return false;
                                    // 本文更新の成功後に保留添付を一括確定する（dsk-0279・dsk-0265 の hook 契約
                                    // ＝部分失敗は全体失敗として false を返し編集モードに留まる。個々の失敗理由は
                                    // hook 内 toast が投影し、再試行は commit 内の 409/404 許容で冪等）。
                                    if (commentEditAttachments.dirty) {
                                      const committed = await commentEditAttachments.commit();
                                      if (!committed) return false;
                                      // update() が差し替えた行は commit 前のスナップショットで attachments が
                                      // 古いため、確定後に一覧を取り直して読み取り専用一覧へ反映する。
                                      await taskComments.reload();
                                    }
                                    // 編集は Task 本体の updatedAt を進めないため、履歴タブの revalidateKey に
                                    // 乗らず反映漏れになる（dsk-0298）。記録自体は正常なので明示 reload で拾う。
                                    void reloadActivities();
                                    setEditingCommentId(null);
                                    return true;
                                  }}
                                  onCancel={handleCancelCommentEdit}
                                />
                              ) : (
                                // 本文はリッチテキスト（HTML）。sanitize 描画（ADR 0019・多層防御）。
                                <RichTextView html={c.body} className="desk-thread-comment-text" />
                              )}
                              {/* リアクション（dsk-0297・チャット発話 ReactionBar と共有コンポーネント）。
                                  編集中は隠す（本文編集に集中させる・チャット発話編集と同方針）。 */}
                              {!isEditingComment && (
                                <ReactionBar
                                  reactions={c.reactions}
                                  onToggle={(emoji: ReactionEmoji) =>
                                    taskComments.toggleReaction(c.id, emoji)
                                  }
                                />
                              )}
                              {/* コメント＝スレッド投稿物にぶら下がる添付（dsk-0249・チャット発話 AttachmentList と対称）。
                                  編集中は CommentEditForm 内の編集可能一覧（保留合成・dsk-0279）だけを出し、
                                  読み取り専用一覧は隠す（二重表示の回避）。 */}
                              {!isEditingComment && <AttachmentList items={c.attachments} />}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tenmatsu' && (
              <TaskDetailOutcome
                saving={saving}
                mentionItems={mentionItems}
                tenmatsu={tenmatsu}
                setTenmatsu={setTenmatsu}
                tenmatsuEditing={tenmatsuEditing}
                setTenmatsuEditing={setTenmatsuEditing}
                gateError={gateError}
                setGateError={setGateError}
                tenmatsuDirty={tenmatsuDirty}
                handleSaveTenmatsu={handleSaveTenmatsu}
                tenmatsuKeyword={tenmatsuKeyword}
                showTenmatsuHighlight={showTenmatsuHighlight}
              />
            )}

            {activeTab === 'history' && (
              <TaskDetailHistory
                activitiesTruncated={activitiesTruncated}
                activitiesError={activitiesError}
                historyRows={historyRows}
              />
            )}

            {activeTab === 'thread' && (
              <DetailCommentComposer
                // key=task.id でタスク切替時に再マウント（DeskTaskForm と同方式）。activeTab='thread' のまま
                // task が差し替わると本コンポーザはアンマウントされず、書きかけ body / commentDirty が前タスクの
                // まま残る（leftDirty が新タスクで誤再活性化＝破棄確認の誤発火）。remount で cleanup→新マウントが
                // onDirtyChange(false) を流し body='' / dirty=false へ戻す（dsk-0258）。
                key={task.id}
                onSubmit={async (body, fileIds, mentionAccountIds) => {
                  const ok = await taskComments.submit(body, fileIds, mentionAccountIds);
                  // 投稿は Task 本体の updatedAt を進めないため、履歴タブの revalidateKey に乗らず
                  // 反映漏れになる（dsk-0298）。記録自体は正常なので明示 reload で拾う。
                  if (ok) void reloadActivities();
                  return ok;
                }}
                submitting={taskComments.submitting}
                mentionItems={mentionItems}
                onDirtyChange={setCommentDirty}
              />
            )}
          </div>

          {/* ===== 右列: 更新ボタン帯 + 属性情報 ===== */}
          <div className="desk-detail-info">
            <div className="desk-detail-info-head">
              <button
                type="submit"
                form={DETAIL_FORM_ID}
                className="desk-ticket-btn desk-ticket-btn-save"
                // dsk-0272: mutating（添付 commit 中を内包）も無効化条件へ。saving（onSave 中）は commit 完了前に
                // false へ戻るため、saving だけだと onSave 完了〜commit 完了の窓で再度押せて属性 PATCH が二重発火する。
                disabled={
                  saving || attachmentsCtl.mutating || !(formDirty || headDirty || attachmentDirty)
                }
                aria-busy={saving || attachmentsCtl.mutating}
              >
                保存
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="閉じる"
                className="desk-pane-close ml-1"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {saveError && (
              <p role="alert" className="desk-tenmatsu-error px-3">
                {saveError}
              </p>
            )}
            <div className="desk-pane-body">
              {/* チケットNo — フォーム外の読み取りメタ。元チャット表示は dsk-0217 で削除（裏のリレーションは保持）。 */}
              <div className="desk-detail-info-form">
                <div className="desk-detail-info-field">
                  <span className="desk-detail-info-label">チケットNo</span>
                  <span className="desk-detail-info-id">{`#${task.id}`}</span>
                </div>
              </div>

              {/* 属性フォーム（題名/説明は左起点カードに置くため非表示。更新は上部帯のボタンが submit）。
                  key=task.id でタスク切替時に再マウントし初期値を更新する。 */}
              <DeskTaskForm
                key={task.id}
                id={DETAIL_FORM_ID}
                mode="edit"
                categories={categories}
                parentTasks={parentTasks}
                accounts={accounts}
                defaultValues={taskToFormValues(task)}
                loading={saving}
                onSubmit={handleSubmit}
                beforeSubmit={guardBeforeSubmit}
                onDirtyChange={setFormDirty}
                hideTitleDescription
                hideActions
              />

              {/* ファイル（実機能・FL-3）— フォーム外の補助メタ。親タスクは上の属性フォーム内 picker に統合済み
                  （rete-desk-0071・読み取り表示から編集可能 select へ）。 */}
              <div className="desk-detail-info-form">
                <div className="desk-detail-info-field">
                  <span className="desk-detail-info-label">ファイル</span>
                  {/* 添付一覧 + ファイル追加（実機能・FL-3 / 元 rete-desk-0047）。dsk-0272 で保留方式
                      （useDeferredAttachments）へ変更＝追加/解除は更新ボタン押下（handleSubmit の commit）で確定。 */}
                  <AttachmentPanel controller={attachmentsCtl} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
