'use client';
import { useDeferredAttachments } from '@/features/desk/hooks/use-deferred-attachments';
import { useTaskActivities } from '@/features/desk/hooks/use-task-activities';
import { useTaskComments } from '@/features/desk/hooks/use-task-comments';
import { extractMentionAccountIds } from '@/features/desk/lib/mentions';
import { formatActivityText } from '@/features/desk/lib/task-activity-text';
import type { DetailTab, TaskDetailOverlayProps } from '@/features/desk/lib/task-detail-types';
import { isRichTextEmpty } from '@/features/desk/lib/validations';
import { toTaskPayload } from '@/features/tasks/lib/api';
import type { TaskFormData } from '@/features/tasks/lib/validations';
import { useDiscardConfirm } from '@/hooks/use-discard-confirm';
import { useOutsideClose } from '@/hooks/use-outside-close';
import { useRowHoverBand } from '@/hooks/use-row-hover-band';
import { TaskStatus } from '@rete/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
export function useTaskDetailController({
  task,
  accounts,
  currentUserId,
  onSave,
  onReparent,
  onDirtyChange,
  escapeInterceptorRef,
  taskKeyword,
}: Pick<
  TaskDetailOverlayProps,
  | 'task'
  | 'accounts'
  | 'currentUserId'
  | 'onSave'
  | 'onReparent'
  | 'onDirtyChange'
  | 'escapeInterceptorRef'
  | 'taskKeyword'
>) {
  const [activeTab, setActiveTab] = useState<DetailTab>('thread');

  // dsk-0386: スレッド/顛末/履歴タブ strip へ帯スライドを配線（chat-thread.tsx と同型）。
  // dsk-0424: 非タブ領域で帯を消すのは hook の leaveOnNoMatch が担う（ローカルラッパーを置換）。
  const {
    listRef: tabStripRef,
    onMouseOver: onTabStripMouseOver,
    onMouseLeave: onTabStripMouseLeave,
    bandStyle: tabHoverBandStyle,
  } = useRowHoverBand<HTMLDivElement>('.desk-ticket-tab', 'horizontal', true);

  // 書きかけコメント（DetailCommentComposer）の dirty。leftDirty へ合流させ Esc/× の破棄確認に乗せる（dsk-0258）。
  const [commentDirty, setCommentDirty] = useState(false);

  // @ メンション候補（dsk-0203）。チャット側（ThemeComposer 等）と同じ accounts 一覧を {id, label} へ写像する。
  // RichTextEditor は mentionItems を ref 経由で読むため、accounts の遅延ロードにも追従する。
  const mentionItems = useMemo(
    () => (accounts ?? []).map((a) => ({ id: a.id, label: a.name })),
    [accounts],
  );

  // タスク本体の添付（FL-3）。右列ファイル節の一覧/解除/追加が使う（左コメント欄の DetailCommentComposer は
  // 独自の usePendingAttachments でコメントへ紐づけるため無関係）。task 未確定（ロード中）は enabled=false で
  // 無効 id への GET を避ける。
  // dsk-0272: 追加・解除の即時確定をやめ、更新ボタン押下時に一括確定する保留方式（useDeferredAttachments・
  // dsk-0265 新設）へ変更。「保留あり＝dirty」が更新ボタン活性と破棄ガードを兼ねるため、旧 attachmentBaseline/
  // attachmentDirty（dsk-0238）とそのタイミング依存の誤活性（dsk-0282）は原因ごと撤去。タスク切替時の保留破棄は
  // hook 内の targetId 変化 effect が担う。
  const attachmentsCtl = useDeferredAttachments({
    targetType: 'task',
    targetId: task?.id ?? 0,
    enabled: task != null,
  });

  // 保留中の添付変更（追加/解除）があれば dirty（dsk-0272）。更新ボタン活性と破棄ガード（onDirtyChange 合流）に使う。
  const attachmentDirty = attachmentsCtl.dirty;

  // attachmentsCtl はレンダー毎に新オブジェクトのため、handleSubmit の deps には安定参照の commit だけを渡す。
  const commitAttachments = attachmentsCtl.commit;

  // タスクコメント（dsk-0214・GET/POST /tasks/:id/comments）。task 未確定（ロード中）は null で無効 id への
  // GET を避ける。投稿成功で submit 内が一覧を再取得し時系列表示へ反映する。
  const taskComments = useTaskComments(task?.id ?? null);

  // 自分のコメントの編集／削除（dsk-0241）。編集対象 id（インライン編集フォーム表示）と削除確認対象 id を保持する。
  // 所有判定は c.author.id === currentUserId（チャット発話 rete-desk-0146 と同基準）。backend も assertOwnerOrAdmin
  // で 403 を返すため、ボタン表示は「押せそうで押すと 403」を防ぐ表示ガード（IDOR 防御は backend が単独で担保）。
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);

  // コメント編集フォームの編集差分（本文変更 or 保留添付・dsk-0279）。leftDirty へ合流させ、書きかけの
  // まま × / Esc で閉じた時に破棄確認を出す（CommentEditForm の onDirtyChange が報告する）。
  const [commentEditDirty, setCommentEditDirty] = useState(false);

  // 編集中コメントの添付（dsk-0279・deferred 方式）。編集は一度に 1 件のみ（排他）のため hook は 1 つで
  // 足りる（chat の messageAttachments / dsk-0265 と同方式）。編集中の行だけ enabled にして余計な GET を
  // 避け、追加・解除は保留に積んで「保存」で commit ／キャンセルで discard する。編集対象の切替
  // （targetId 変化）で保留は hook 内 effect が破棄する。
  const commentEditAttachments = useDeferredAttachments({
    targetType: 'taskComment',
    targetId: editingCommentId ?? '',
    enabled: editingCommentId != null,
  });

  // 削除失敗時のフィードバック（dsk-0241 code-review MEDIUM）。DELETE が 403/通信失敗で false を返すと
  // 一覧から消えないため、編集失敗（フォーム内 inline）と対称に「消えなかった」ことを明示する。
  const [deleteCommentError, setDeleteCommentError] = useState<string | null>(null);

  const [deletingComment, setDeletingComment] = useState(false);

  // コメントの「その他」メニュー（dsk-0267）。開いているコメント id を保持（同時に1つ）。
  // 外側クリック / ESC クローズは chat 起点カードのその他メニュー（rete-desk-0095）の横展開。
  // ESC は document 段階で消費し、desk-shell の closeAllGuarded（オーバーレイごと閉じる）へ伝播させない。
  const [commentMenuId, setCommentMenuId] = useState<string | null>(null);

  const commentMenuRef = useRef<HTMLDivElement | null>(null);

  const commentMenuBtnRef = useRef<HTMLButtonElement | null>(null);

  // スクロールリスト（.desk-pane-body）の可視域計測用 ref（dsk-0288）。下端付近のコメントで
  // その他メニューを開くと可視域外へはみ出すため、開く度に計測して flip の要否を判定する。
  const threadPaneBodyRef = useRef<HTMLDivElement | null>(null);

  const [commentMenuFlip, setCommentMenuFlip] = useState(false);

  // 外側 pointerdown / Esc クローズは useOutsideClose へ統合（brd-0227）。
  useOutsideClose({
    active: commentMenuId != null,
    refs: [commentMenuRef, commentMenuBtnRef],
    onClose: () => setCommentMenuId(null),
    eventType: 'pointerdown',
  });

  // dsk-0288: メニューをまず既定（下向き）で描画してから、可視域下端をはみ出す時だけ上向きへ flip する
  // （useLayoutEffect でペイント前に計測・反映しちらつきを防ぐ）。
  // dsk-0294: 開いたまま .desk-pane-body をスクロールしても再計測されるよう、計測ロジックを
  // 1関数（recalc）へ集約し、開閉時の初回計測と scroll/resize 時の再計測の両方から呼ぶ。
  useLayoutEffect(() => {
    if (commentMenuId == null) {
      setCommentMenuFlip(false);
      return;
    }
    const containerEl = threadPaneBodyRef.current;
    const recalc = () => {
      const menuEl = commentMenuRef.current;
      if (!menuEl || !containerEl) return;
      const overflowsBottom =
        menuEl.getBoundingClientRect().bottom > containerEl.getBoundingClientRect().bottom;
      setCommentMenuFlip(overflowsBottom);
    };
    recalc();
    containerEl?.addEventListener('scroll', recalc, { passive: true });
    window.addEventListener('resize', recalc);
    return () => {
      containerEl?.removeEventListener('scroll', recalc);
      window.removeEventListener('resize', recalc);
    };
  }, [commentMenuId]);

  // タスク変更履歴（監査ログ・dsk-0223）。属性更新で記録された実データを履歴タブに昇順描画する。
  // revalidateKey=task.updatedAt: 保存で updatedAt が進むと履歴を再取得し、記録行を即反映する。
  // dsk-0286: 取得失敗時の activitiesError を取り出し、履歴タブで role="alert" 注記に使う
  // （コメント側 966-970 と同型・useTaskActivities の catch 節は last-good 保持規約で不変）。
  const {
    activities,
    truncated: activitiesTruncated,
    error: activitiesError,
    reload: reloadActivities,
  } = useTaskActivities(task?.id ?? null, task?.updatedAt ?? null);

  // 顛末（このチケットの結論）。属性フォーム外の状態のため overlay ローカルで保持し、保存時に payload へ合流する。
  // baseline は dirty 判定（C-編集 の破棄ガードへ顛末編集も含める）と保存後の dirty 解消に使う。
  const [tenmatsu, setTenmatsu] = useState(task?.tenmatsu ?? '');

  const [tenmatsuBaseline, setTenmatsuBaseline] = useState(task?.tenmatsu ?? '');

  // dsk-0339: 検索語あり時は保存済み顛末を RichTextView+highlight で見せ、編集時のみ RTE に切り替える。
  const [tenmatsuEditing, setTenmatsuEditing] = useState(false);

  const [formDirty, setFormDirty] = useState(false);

  // 完了ゲートのブロック表示（顛末タブ内）と、保存失敗（backend エラー）の安全網表示。
  const [gateError, setGateError] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  // チャット顛末（rete-desk-0134）と同じ dirty 判定。RTE が空内容で `<p></p>` を吐くため、
  // 単純比較だと「空 ↔ 空（別表現）」を誤って dirty 化し保存ボタン点灯/破棄ガード誤発火する。
  const tenmatsuDirty =
    tenmatsu !== tenmatsuBaseline &&
    !(isRichTextEmpty(tenmatsu) && isRichTextEmpty(tenmatsuBaseline));

  // 起点カード（題名 + 説明）のインライン編集（rete-desk-0189）。chat のテーマ編集（ThemeEditForm）と同方式。
  // 題名 + 説明のみを部分更新（onSave に {title, description} を渡す）。右列の属性フォームとは独立に保存する。
  // 説明の @ メンションは dsk-0203 で対応（説明面の宛先を description 変更時のみ再抽出して送る）。
  const [editingHead, setEditingHead] = useState(false);

  const [headTitle, setHeadTitle] = useState(task?.title ?? '');

  const [headDescription, setHeadDescription] = useState(task?.description ?? '');

  const headDirty =
    editingHead &&
    (headTitle !== (task?.title ?? '') ||
      (headDescription !== (task?.description ?? '') &&
        !(isRichTextEmpty(headDescription) && isRichTextEmpty(task?.description ?? ''))));

  // タスク切替（task.id 変化）でのみ顛末・baseline・各エラーを初期化する。保存後はサーバ確定値で
  // 同一 id の task が差し替わる（task.tenmatsu 変化）が、その時は再初期化しない — 編集中入力の上書きや
  // 「保存済みなのに dirty フリッカ」を防ぐため。保存後の baseline 同期は handleSubmit が唯一担う。
  useEffect(() => {
    setTenmatsu(task?.tenmatsu ?? '');
    setTenmatsuBaseline(task?.tenmatsu ?? '');
    setGateError(false);
    setSaveError(null);
    // タスク切替で起点カード編集を畳む（編集中の他タスクへの持ち越しを防ぐ / rete-desk-0189）。
    setEditingHead(false);
    // 検索ハイライト読取モードもタスクごとに初期化（dsk-0339）。
    setTenmatsuEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // フォーム dirty・顛末 dirty・起点カード dirty・書きかけコメント dirty を OR して上位（leftDirtyRef）へ
  // 報告（C-編集・DBT-7・0189 / dsk-0258 でコメント入力を追加）。書きかけコメントを leftDirty に載せることで
  // × / Esc で閉じる時に破棄確認ダイアログが出る（チャット詳細の返信欄が rightDirty に載るのと対称）。
  // dsk-0272: 保留添付（未確定の追加/解除）も保留方式化に伴い破棄ガードへ含める（閉じると保留は失われるため）。
  // dsk-0279: コメント編集フォームの差分（本文変更・保留添付）も破棄ガードへ含める（閉じると保留は失われるため）。
  useEffect(() => {
    onDirtyChange?.(
      formDirty ||
        tenmatsuDirty ||
        headDirty ||
        commentDirty ||
        attachmentDirty ||
        commentEditDirty,
    );
  }, [
    formDirty,
    tenmatsuDirty,
    headDirty,
    commentDirty,
    attachmentDirty,
    commentEditDirty,
    onDirtyChange,
  ]);

  // アンマウント時のみ dirty=false を報告し、詳細を閉じた後の破棄確認の誤発火を防ぐ。
  // onDirtyChange（reportLeftDirty）は安定参照のため deps 空で初回クロージャを使う。
  useEffect(() => {
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 完了ゲート: status=完了 かつ 顛末が空なら保存をブロックし、顛末タブへ誘導してエラーを出す。
  const guardBeforeSubmit = useCallback(
    (data: TaskFormData): boolean => {
      // 顛末は RTE（HTML）化済（rete-desk-0190）。空判定は空 <p> 等を畳む isRichTextEmpty で行う。
      if (data.status === TaskStatus.DONE && isRichTextEmpty(tenmatsu)) {
        setActiveTab('tenmatsu');
        setGateError(true);
        return false;
      }
      setGateError(false);
      return true;
    },
    [tenmatsu],
  );

  const handleSubmit = useCallback(
    async (data: TaskFormData) => {
      setSaveError(null);
      // 親付け替えの判定（rete-desk-0071）。空文字＝トップレベル(null)。元の親と異なる時のみ move を呼ぶ。
      const newParentId = data.parentTaskId ? Number(data.parentTaskId) : null;
      const parentChanged = newParentId !== (task?.parentTaskId ?? null);
      try {
        // reparent は構造変更（sortOrder / 循環 / カテゴリ波及）なので属性更新より先に move 経由で確定する。
        // categoryId は picker の分類連動で親と一致済み（親選択時）。失敗時は属性更新へ進まず中断。
        if (parentChanged) {
          // 分類は任意（rete-desk-0158）。未選択（空文字）は null（未分類）で move へ流す。
          await onReparent(newParentId, data.categoryId ? Number(data.categoryId) : null);
        }
        // 顛末は空（RTE 空 HTML 含む）なら null（クリア）で送る。@IsOptional のため null 受理（backend が tenmatsu: null で消す）。
        // 顛末面の宛先（dsk-0203）は顛末を実際に変更した時のみ送る（undefined=据え置き・[]=全クリアの面別セマンティクス。
        // 説明は左起点カード（handleHeadSave）経路のみ編集可能のため、ここでは descriptionMentionAccountIds を送らない）。
        await onSave({
          ...toTaskPayload(data),
          tenmatsu: isRichTextEmpty(tenmatsu) ? null : tenmatsu,
          ...(tenmatsuDirty
            ? {
                tenmatsuMentionAccountIds: isRichTextEmpty(tenmatsu)
                  ? []
                  : extractMentionAccountIds(tenmatsu),
              }
            : {}),
        });
        setTenmatsuBaseline(tenmatsu);
        // dsk-0272: 保留中の添付変更（追加/解除）を属性・顛末と同じタイミングで一括確定する。一部でも失敗
        // したら hook が保留を保持したまま false を返す（dsk-0265 契約＝部分失敗は全体失敗扱い）ので、編集画面に
        // 留まる（dirty が残り更新ボタンも活性のまま＝再試行できる）。onSave 側は既に成功 toast を出している
        // （desk-shell handleSaveTask）ため、文言は「属性は保存済み・添付だけ未確定」を正確に伝える（二重信号回避）。
        if (!(await commitAttachments())) {
          setSaveError(
            '添付の確定に失敗しました。未確定の添付が残っています。もう一度「更新」を押して再試行してください。',
          );
        }
      } catch {
        // 例外 message を画面へそのまま投影しない（backend 内部文言の漏洩防止）。固定の利用者向け文言に統一。
        setSaveError('保存に失敗しました。入力内容を確認して再試行してください。');
      }
    },
    [onSave, onReparent, task?.parentTaskId, tenmatsu, tenmatsuDirty, commitAttachments],
  );

  // 起点カードの題名 + 説明をインライン保存（rete-desk-0189）。属性更新（handleSubmit）とは別に
  // {title, description} のみを部分更新する。成功で読み取り表示へ戻る（task prop は親の再取得で更新）。
  const handleHeadSave = useCallback(async () => {
    if (!headTitle.trim()) return;
    setSaveError(null);
    // 説明面の宛先（dsk-0203）は説明を実際に変更した時のみ再抽出して送る（chat ThemeEditForm の
    // descriptionDirty 条件と同型）。未変更時は undefined（据え置き）で既存宛先を壊さない。
    const descriptionDirty =
      headDescription !== (task?.description ?? '') &&
      !(isRichTextEmpty(headDescription) && isRichTextEmpty(task?.description ?? ''));
    try {
      // 説明 HTML は backend 側で sanitize される（ADR 0019 / tasks.service update）。
      await onSave({
        title: headTitle.trim(),
        description: headDescription,
        ...(descriptionDirty
          ? { descriptionMentionAccountIds: extractMentionAccountIds(headDescription) }
          : {}),
      });
      setEditingHead(false);
    } catch {
      setSaveError('保存に失敗しました。入力内容を確認して再試行してください。');
    }
  }, [headTitle, headDescription, task?.description, onSave]);

  // 編集モード解除（起点カード / コメント編集）の破棄確認（mdl-0034 規約②）。変更ありのキャンセル / Esc は
  // 確認を挟み、未変更なら即解除する（チャット側 handleCancelEdit / handleCancelMessageEdit と同型）。
  // コメント削除確認の DiscardConfirmDialog とは別インスタンス（文言・確定処理が異なる）。
  const editDiscard = useDiscardConfirm();

  // コメント編集のキャンセル。保留中の添付変更（追加・解除）を破棄してから編集モードを閉じる（dsk-0279）。
  // dirty（本文差分 or 保留添付 = CommentEditForm が報告する commentEditDirty）なら破棄確認を通す。
  const handleCancelCommentEdit = useCallback(() => {
    editDiscard.request(commentEditDirty, () => {
      commentEditAttachments.discard();
      setEditingCommentId(null);
    });
  }, [editDiscard, commentEditDirty, commentEditAttachments]);

  // 起点カード編集のキャンセル。dirty（headDirty）なら破棄確認を通してから編集モードのみ畳む。
  const handleHeadCancel = useCallback(() => {
    editDiscard.request(headDirty, () => setEditingHead(false));
  }, [editDiscard, headDirty]);

  // dsk-0242: 起点カード編集中の Esc は「編集モードのみ解除」して詳細画面は閉じない（キャンセルボタンと同挙動）。
  // dsk-0285: コメント編集中（editingCommentId）も同じ扱いに拡張（従来は素通りしてオーバーレイごと閉じていた）。
  // mdl-0034 規約②: いずれも dirty なら破棄確認を挟む（キャンセルボタンと同じガードへ合流）。
  // desk-shell の window Esc リスナーが closeAllGuarded を呼ぶ前にこの interceptor を consult する。
  // 破棄確認の表示中は AlertDialog 側が document 段階で Esc を消費するため本 interceptor まで届かない。
  // editingHead / editingCommentId 等を closure で読むため変化で再登録し、アンマウントで null に戻す。
  useEffect(() => {
    const ref = escapeInterceptorRef;
    if (!ref) return;
    ref.current = () => {
      if (editingCommentId != null) {
        handleCancelCommentEdit();
        return true; // Esc を消費（閉じない）
      }
      if (!editingHead) return false; // 非編集時は従来どおり desk-shell が閉じる
      handleHeadCancel();
      return true; // Esc を消費（閉じない）
    };
    return () => {
      ref.current = null;
    };
  }, [
    editingHead,
    editingCommentId,
    escapeInterceptorRef,
    handleCancelCommentEdit,
    handleHeadCancel,
  ]);

  // 顛末のみを部分保存（rete-desk-0190/0192）。chat 顛末タブと同じ RTE + 専用「保存」ボタン意匠に揃える。
  // 全体保存（handleSubmit）とは独立に tenmatsu のみ PATCH する。空（RTE 空 HTML）は null でクリア。
  // 顛末面の宛先（dsk-0203）も同時に送る（空なら [] で全クリア・chat handleSaveTenmatsu と同型）。
  const handleSaveTenmatsu = useCallback(async () => {
    setSaveError(null);
    setGateError(false);
    try {
      const isEmpty = isRichTextEmpty(tenmatsu);
      await onSave({
        tenmatsu: isEmpty ? null : tenmatsu,
        tenmatsuMentionAccountIds: isEmpty ? [] : extractMentionAccountIds(tenmatsu),
      });
      setTenmatsuBaseline(tenmatsu);
      // 検索ハイライト表示へ戻す（dsk-0339）。次の編集は「編集」から。
      setTenmatsuEditing(false);
    } catch {
      setSaveError('保存に失敗しました。入力内容を確認して再試行してください。');
    }
  }, [onSave, tenmatsu]);

  // 検索語あり・未編集・空でないときだけハイライト読み取り。完了ゲート誘導や空顛末は RTE を出す。
  const tenmatsuKeyword = taskKeyword?.trim() || '';

  const showTenmatsuHighlight =
    tenmatsuKeyword.length > 0 && !tenmatsuEditing && !gateError && !isRichTextEmpty(tenmatsu);

  // dsk-0223: ダミー履歴を実データへ置換。先頭に「作成」行（task.createdAt 起点・合成）、
  // 続けて属性変更の監査ログ（activities）を createdAt 昇順で並べる。実行者は activity.actor。
  // dsk-0235: 作成行 actor は作成者（owner）名で固定する。以前は担当者ラベルを流用していたため
  // 担当者を変更すると「このチケットを作成」の実行者が変更実行者に追従して見える不具合があった。
  // owner は担当者と独立した不変の作成者なので、担当者変更後も作成者表示は変わらない（未所有/失効は '—'）。
  const creatorLabel = task?.owner?.name ?? null;

  // dsk-0244: 起点カード（題名・説明）の編集ボタンは作成者本人のみに表示する。owner 未取得（fixture 等）や
  // 未ログイン時は出さない（chat 詳細のテーマ編集と同じ owner.id===currentUserId 基準）。backend は
  // assertOwnerOrAdmin で他人を 403 にするため、表示ガードは「押せそうで 403」の UX 不整合を防ぐ目的。
  const isHeadOwner = currentUserId != null && task?.owner?.id === currentUserId;

  const historyRows = task
    ? [
        { time: task.createdAt, actor: creatorLabel ?? '—', text: 'このチケットを作成' },
        ...activities.map((a) => ({
          time: a.createdAt,
          actor: a.actor?.name ?? '—',
          text: formatActivityText(a.field, a.fromLabel, a.toLabel),
        })),
      ]
    : [];
  return {
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
  };
}
