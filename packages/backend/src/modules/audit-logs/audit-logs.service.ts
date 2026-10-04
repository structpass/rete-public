import { BadRequestException, Injectable } from '@nestjs/common';
import { AUDIT_EXPORT_MAX_DAYS, AuditLogPageResponse } from '@rete/shared';
import { buildPaginatedMeta } from '../../common/dto';
import { AuditLogFilter, AuditLogsRepository } from './repositories/audit-logs.repository';
import { toAuditLogDto } from './audit-logs.mapper';
import { buildAuditLogsCsv } from './audit-logs.csv';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AUDIT_EXPORT_ROW_CAP } from './audit-logs.constants';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/**
 * 操作ログ / 監査（Settings ST-6）のアプリケーションサービス。検証 + オーケストレーションのみを担い、
 * DB アクセスは Repository 経由（§2）、Entity→DTO 変換は mapper（§1）。読み取り専用（記録は H5）。
 *
 * 期間（from/to）は ISO 日付文字列で受け、日初 / 日末（含む）の Date 境界へ正規化してから repo へ渡す。
 * 一覧は期間任意。CSV は from/to 必須 + 期間 92 日上限（AUDIT_EXPORT_MAX_DAYS）を検証する（ログ量が膨大なため）。
 */
@Injectable()
export class AuditLogsService {
  constructor(private readonly repo: AuditLogsRepository) {}

  /**
   * 操作ログ検索（フィルタ + keyset カーソル・createdAt 降順）。
   * page/totalPages はフロント側のページ番号表示用に count ベースで算出するが、実クエリは
   * OFFSET を使わず cursor/direction で移動する（audit_logs スケール対応・set-0013）。
   */
  async search(query: QueryAuditLogsDto): Promise<AuditLogPageResponse> {
    const filter = this.buildFilter(query);
    const { data, total, cursors } = await this.repo.search(filter, {
      limit: query.limit,
      direction: query.direction,
      cursor: query.cursor,
    });
    return {
      success: true,
      data: data.map(toAuditLogDto),
      meta: buildPaginatedMeta(total, query.page, query.limit),
      cursors,
    };
  }

  /**
   * 操作ログを CSV（UTF-8 BOM 付き）でエクスポートする。期間（from/to）必須 + 92 日上限を検証してから、
   * 現在のフィルタ該当行を cap 上限で取得・整形する。enforcement とは無関係の表示用スナップショット。
   */
  async exportCsv(query: QueryAuditLogsDto): Promise<string> {
    if (!query.from || !query.to) {
      throw new BadRequestException('CSV 出力には期間（from / to）の指定が必要です');
    }
    const filter = this.buildFilter(query);
    // buildFilter で from/to は必ず Date 化される（上で存在を保証済み・parse で NaN は弾き済み）。
    const spanMs = (filter.to as Date).getTime() - (filter.from as Date).getTime();
    if (spanMs < 0) {
      throw new BadRequestException('期間の開始日が終了日より後になっています');
    }
    // from は日初・to は日末（含む）へ正規化済みなので、含む暦日数 = floor(差分日数) + 1。
    // ミリ秒の端数（.999）に依存せず「最大 92 暦日」を厳密判定する。
    const calendarDays = Math.floor(spanMs / MS_PER_DAY) + 1;
    if (calendarDays > AUDIT_EXPORT_MAX_DAYS) {
      throw new BadRequestException(`CSV 出力の期間は最大 ${AUDIT_EXPORT_MAX_DAYS} 日です`);
    }
    const rows = await this.repo.findForExport(filter, AUDIT_EXPORT_ROW_CAP);
    return buildAuditLogsCsv(rows.map(toAuditLogDto));
  }

  /** DTO → 正規化済みフィルタ（期間文字列を Date 境界へ解決）。 */
  private buildFilter(query: QueryAuditLogsDto): AuditLogFilter {
    return {
      search: query.search?.trim() || undefined,
      actionType: query.actionType,
      systemId: query.systemId,
      from: query.from ? this.parseDayStart(query.from) : undefined,
      to: query.to ? this.parseDayEnd(query.to) : undefined,
    };
  }

  /** 'YYYY-MM-DD' は日初（00:00:00.000Z）として解釈。完全 ISO はそのまま。 */
  private parseDayStart(s: string): Date {
    return this.assertValid(new Date(DATE_ONLY.test(s) ? `${s}T00:00:00.000Z` : s));
  }

  /** 'YYYY-MM-DD' は日末（23:59:59.999Z・含む）として解釈。完全 ISO はそのまま。 */
  private parseDayEnd(s: string): Date {
    return this.assertValid(new Date(DATE_ONLY.test(s) ? `${s}T23:59:59.999Z` : s));
  }

  /**
   * @IsDateString を通っても `2026-13-40` 等は Invalid Date（NaN）になりうる。NaN を素通りさせると
   * spanMs/calendarDays が NaN → 上限比較が常に false で 92 日上限をすり抜けるため、parse 段で弾く（防御の深さ）。
   */
  private assertValid(d: Date): Date {
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('期間の日付形式が不正です');
    }
    return d;
  }
}
