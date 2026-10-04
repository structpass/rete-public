import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLogsRepository } from './repositories/audit-logs.repository';

/**
 * 操作ログの retention purge（operational-policy §6・retention=12ヶ月）。
 *
 * §2 データアクセス境界: 削除は AuditLogsRepository.deleteOlderThan 経由で行う
 * （read / record と同じ domain repository に集約。prisma 直叩きはしない）。
 *
 * §4 best-effort: バックグラウンドジョブは HTTP exception filter 対象外のため ここで try/catch する。
 * 失敗してもアプリを止めず logger.error で痕跡を残す（operational-policy §3 止めない側）。
 */
@Injectable()
export class AuditLogsPurgeService {
  private readonly logger = new Logger(AuditLogsPurgeService.name);

  /**
   * retention: 12ヶ月（月境界を正しく処理するため月数で計算。365日固定より正確）。
   * 定数として持つことで将来の変更が 1 箇所のみ（operational-policy §6 SSOT）。
   */
  private static readonly RETENTION_MONTHS = 12;

  constructor(private readonly repo: AuditLogsRepository) {}

  /**
   * 日次で retention 超過の操作ログを物理削除する。
   * EVERY_DAY_AT_4AM = UTC 04:00（= JST 13:00）。OidcPurgeService と実行タイミングを揃える。
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleScheduledPurge(): Promise<void> {
    await this.purgeExpired();
  }

  /**
   * 12ヶ月超過の操作ログを物理削除し、削除件数を返す。
   *
   * - createdAt < 現在 − 12ヶ月 の行を対象（境界は含まない = lt）。
   * - 削除件数を log level で出力（センシティブ情報なし）。
   */
  async purgeExpired(): Promise<number> {
    try {
      // createdAt は Timestamptz（UTC 保存）のため UTC ベースで月減算する（TZ 設定に依存しない）。
      const cutoff = new Date();
      cutoff.setUTCMonth(cutoff.getUTCMonth() - AuditLogsPurgeService.RETENTION_MONTHS);

      const count = await this.repo.deleteOlderThan(cutoff);
      this.logger.log(`Purged ${count} expired audit log(s) (older than ${cutoff.toISOString()})`);
      return count;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to purge expired audit logs: ${detail}`);
      return 0;
    }
  }
}
