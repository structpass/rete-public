import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppService, HealthStatus } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // readiness probe の cadence をグローバル rate limit（30/60s）に縛られないよう throttle を外す。
  @SkipThrottle()
  @Get('health')
  @ApiOperation({ summary: 'ヘルスチェック（DB readiness 同居）' })
  @ApiResponse({ status: 200, description: 'DB 到達可能（status=ok / db=up）' })
  @ApiResponse({ status: 503, description: 'DB 到達不可（status=error / db=down）' })
  async getHealth(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const health = await this.appService.getHealth();
    // DB 不通は readiness シグナルとして 503 を返す（LB / オーケストレータが unready を検知できる）。
    // passthrough:true なので status だけ差し替え、返り値は通常どおり Nest が JSON 化する。
    res.status(health.db === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return health;
  }
}
