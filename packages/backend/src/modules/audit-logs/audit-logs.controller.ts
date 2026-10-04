import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Role } from '@rete/shared';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * 操作ログ / 監査（Settings ST-6・閲覧 / 検索 / 出力レイヤ）。テナント全体の監査ログは email（PII）+
 * 全ユーザーの操作履歴を含むため、全エンドポイントを ADMIN 限定にする（メンバー一覧 ST-4 と同じ境界）。
 * 記録（書き込み）infra は hardening H5 の責務で本コントローラには write を置かない。
 */
@ApiTags('audit-logs')
@Controller('audit-logs')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  // ':id' 等の動的セグメントは持たないが、'export' は固定パスのため一覧 GET と衝突しない。
  // CSV は 1 回で最大 AUDIT_EXPORT_ROW_CAP(10万) 行を直列化しうる最重量パスのため、一覧検索より厳しい
  // 専用スロットルを掛ける（グローバル 30req/60s に上乗せ。一覧 GET には付けず members ST-4 と境界を揃える）。
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Get('export')
  @ApiOperation({
    summary: '操作ログ CSV エクスポート（期間必須・最大 92 日・UTF-8 BOM・ADMIN 限定）',
  })
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Query() query: QueryAuditLogsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    return this.service.exportCsv(query);
  }

  @Get()
  @ApiOperation({ summary: '操作ログ検索（フィルタ + ページング・createdAt 降順・ADMIN 限定）' })
  search(@Query() query: QueryAuditLogsDto) {
    return this.service.search(query);
  }
}
