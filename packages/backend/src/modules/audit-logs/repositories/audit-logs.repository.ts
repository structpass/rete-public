import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { AUDIT_SYSTEM_COMMON } from '@rete/shared';
import { PrismaService } from '../../../database/prisma.service';

/**
 * 操作ログ書き込みの入力型（§1 DTO 境界・Entity 直返し禁止の write 側）。
 * recorder service → repository 境界で使う内部型（HTTP DTO とは別物）。
 */
export interface CreateAuditLogInput {
  actorAccountId?: string | null;
  actorName: string;
  actorEmail: string;
  systemId?: string | null;
  systemName: string;
  actionType: string;
  feature?: string;
  summary?: string;
  /** 構造化詳細（任意）。null / undefined は DB null として省略する。 */
  details?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * 操作ログの正規化済みフィルタ（service が DTO を Date 境界へ解決した後の形）。
 * 期間は from=日初 / to=日末（含む）で受け取る（DTO の ISO 日付 → 境界変換は service の責務）。
 */
export interface AuditLogFilter {
  search?: string;
  actionType?: string;
  /** TenantSystem.id / 横断操作は AUDIT_SYSTEM_COMMON（→ systemId IS NULL）。 */
  systemId?: string;
  from?: Date;
  to?: Date;
}

/**
 * フィルタ → Prisma where 句（純関数・§3 共通化 + ユニットテスト可能化）。
 * search はユーザー名 / メールの部分一致（大文字小文字無視）。systemId センチネル AUDIT_SYSTEM_COMMON は
 * systemId IS NULL（横断操作）へ写す。期間は createdAt の gte / lte。
 */
export function buildAuditLogWhere(f: AuditLogFilter): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (f.search) {
    where.OR = [
      { actorName: { contains: f.search, mode: 'insensitive' } },
      { actorEmail: { contains: f.search, mode: 'insensitive' } },
    ];
  }
  if (f.actionType) {
    where.actionType = f.actionType;
  }
  if (f.systemId) {
    where.systemId = f.systemId === AUDIT_SYSTEM_COMMON ? null : f.systemId;
  }
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to ? { lte: f.to } : {}),
    };
  }

  return where;
}

/** Entity の配列・総件数・keyset カーソル（DTO 変換・レスポンス整形前の生結果）。 */
export interface AuditLogPage {
  data: AuditLog[];
  total: number;
  cursors: { next: string | null; prev: string | null };
}

/** keyset カーソルの復号後の値（createdAt, id の複合境界）。 */
interface DecodedCursor {
  createdAt: Date;
  id: string;
}

/**
 * keyset カーソルの符号化 / 復号（(createdAt, id) を base64 の不透明トークンにする）。
 * OFFSET を使わないため、カーソルは「このページの端の行」を指す座標そのものとして持ち運ぶ。
 */
export function encodeCursor(row: Pick<AuditLog, 'createdAt' | 'id'>): string {
  return Buffer.from(
    JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }),
    'utf8',
  ).toString('base64url');
}

/**
 * cursor は外部（クライアント）由来の不透明文字列のため、壊れた base64/JSON や不正な日時・空 id を
 * DB クエリへ素通りさせない（Invalid Date は Prisma の比較で静かに空/不定結果を返し得るため 400 で弾く）。
 */
export function decodeCursor(token: string): DecodedCursor {
  let parsed: { c?: unknown; id?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('cursor の形式が不正です');
  }
  if (typeof parsed.c !== 'string' || typeof parsed.id !== 'string' || parsed.id === '') {
    throw new BadRequestException('cursor の形式が不正です');
  }
  const createdAt = new Date(parsed.c);
  if (Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException('cursor の形式が不正です');
  }
  return { createdAt, id: parsed.id };
}

/** (createdAt, id) が cursor より「古い」行（= createdAt 降順で cursor より後ろ）を選ぶ複合条件。 */
function beforeCursor(cursor: DecodedCursor): Prisma.AuditLogWhereInput {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/** (createdAt, id) が cursor より「新しい」行（= createdAt 降順で cursor より前）を選ぶ複合条件。 */
function afterCursor(cursor: DecodedCursor): Prisma.AuditLogWhereInput {
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}

/**
 * 操作ログのデータアクセス層（§2 Repository 分離）。読み取り（ST-6）と書き込み（H5）を統合。
 * Service / Recorder は本クラス経由でのみ DB に触る。
 */
@Injectable()
export class AuditLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 操作ログを 1 件挿入する（H5 記録 infra）。
   * §1 DTO 境界: 戻り値は void（Entity を返さない）。
   * best-effort 例外制御は呼び出し元（AuditRecorderService）の責務（ここは純粋な write のみ担う）。
   */
  async create(input: CreateAuditLogInput): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      actorAccountId: input.actorAccountId ?? null,
      actorName: input.actorName,
      actorEmail: input.actorEmail,
      systemId: input.systemId ?? null,
      systemName: input.systemName,
      actionType: input.actionType,
      feature: input.feature ?? '',
      summary: input.summary ?? '',
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    };
    // details は省略時は DB null（nullable Json）。null / undefined 以外の値のみ付与する。
    if (input.details != null) {
      data.details = input.details;
    }
    await this.prisma.auditLog.create({ data });
  }

  /**
   * retention 超過（createdAt < cutoff）の操作ログをバッチ分割で物理削除し、総削除件数を返す（H5 purge）。
   *
   * audit_logs は mutating リクエスト毎に 1 行 INSERT されるため他テーブルより桁違いに成長する。
   * 単一 deleteMany で全件削除すると大量 WAL / dead tuple / I/O スパイクが 1 トランザクションに集中するため、
   * id を batchSize 件ずつ拾って分割削除する（並行 INSERT をブロックせず autovacuum 圧力を平準化）。
   */
  async deleteOlderThan(cutoff: Date, batchSize = 1000): Promise<number> {
    let totalDeleted = 0;
    for (;;) {
      const rows = await this.prisma.auditLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: batchSize,
      });
      if (rows.length === 0) break;

      const { count } = await this.prisma.auditLog.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      totalDeleted += count;

      // 拾えた行が batchSize 未満なら最終バッチ（次回 findMany は 0 件確定）。
      if (rows.length < batchSize) break;
    }
    return totalDeleted;
  }

  /**
   * フィルタ + keyset カーソルで操作ログを引く（createdAt, id の複合順で OFFSET を使わない）。
   * direction='next'/'prev' は cursor 必須（欠けば first と同義に倒す）。'last' は末尾から昇順で
   * limit 件取り、表示順（降順）に戻すため配列を反転する。total は監査ログ画面の「全 N 件」
   * 表示（set-0150 で設定タブの語彙へ統一・意味は絞り込み後の件数のまま）とページ数計算に使うため、
   * keyset 化後も count クエリは維持する。
   */
  async search(
    filter: AuditLogFilter,
    opts: { limit: number; direction?: 'next' | 'prev' | 'last'; cursor?: string },
  ): Promise<AuditLogPage> {
    const where = buildAuditLogWhere(filter);
    const { limit, direction, cursor } = opts;
    const decoded = cursor ? decodeCursor(cursor) : null;

    let scopedWhere: Prisma.AuditLogWhereInput = where;
    let orderBy: Prisma.AuditLogOrderByWithRelationInput[];
    let reverseResult = false;
    // 実際に採った分岐（direction 指定だが cursor 欠落時は 'first' 相当に倒れる点を cursors 算出にも反映する）。
    let mode: 'first' | 'next' | 'prev' | 'last' = 'first';

    if (direction === 'next' && decoded) {
      scopedWhere = { AND: [where, beforeCursor(decoded)] };
      orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
      mode = 'next';
    } else if (direction === 'prev' && decoded) {
      scopedWhere = { AND: [where, afterCursor(decoded)] };
      orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
      reverseResult = true;
      mode = 'prev';
    } else if (direction === 'last') {
      orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
      reverseResult = true;
      mode = 'last';
    } else {
      orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
    }

    // limit+1 件を先読みし、「移動先方向にまだ続きがあるか」を実データで判定する（余分な1件は捨てる）。
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where: scopedWhere, orderBy, take: limit + 1 }),
      this.prisma.auditLog.count({ where }),
    ]);
    const hasExtra = rows.length > limit;
    const trimmed = hasExtra ? rows.slice(0, limit) : rows;
    const data = reverseResult ? [...trimmed].reverse() : trimmed;

    // 「到達済み方向」（cursor で辿り着いた側）は必ず戻れることが保証済みなので常に non-null。
    // 「未踏方向」（これから進む側）は limit+1 先読みの hasExtra が無ければ null（それ以上先が無い）。
    const cursors: { next: string | null; prev: string | null } =
      data.length === 0
        ? { next: null, prev: null }
        : mode === 'first'
          ? { next: hasExtra ? encodeCursor(data[data.length - 1]) : null, prev: null }
          : mode === 'last'
            ? { next: null, prev: hasExtra ? encodeCursor(data[0]) : null }
            : mode === 'next'
              ? {
                  next: hasExtra ? encodeCursor(data[data.length - 1]) : null,
                  prev: encodeCursor(data[0]),
                }
              : {
                  next: encodeCursor(data[data.length - 1]),
                  prev: hasExtra ? encodeCursor(data[0]) : null,
                };

    return { data, total, cursors };
  }

  /**
   * CSV 出力用にフィルタ該当行を取得する（ページングなし・createdAt 降順）。
   * OOM 防止のため cap 行で打ち切る（期間上限 92 日で実質バウンド済 / cap 到達は service が件数で検知）。
   */
  findForExport(filter: AuditLogFilter, cap: number): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: buildAuditLogWhere(filter),
      orderBy: { createdAt: 'desc' },
      take: cap,
    });
  }
}
