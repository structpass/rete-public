import { Injectable } from '@nestjs/common';
import { PrismaService } from './database';

/** ヘルスチェックのレスポンス（観測性 H9 / DB readiness 同居）。 */
export interface HealthStatus {
  status: 'ok' | 'error';
  db: 'up' | 'down';
  timestamp: string;
}

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * ヘルスチェック。liveness（プロセス応答）に加え DB readiness を同居させる
   * （operational-policy §5 / 観測性 H9）。DB 不通時は status=error / db=down を返し、
   * controller が 503 を立てて readiness シグナルにする。
   */
  async getHealth(): Promise<HealthStatus> {
    const dbUp = await this.prisma.isHealthy();
    return {
      status: dbUp ? 'ok' : 'error',
      db: dbUp ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
