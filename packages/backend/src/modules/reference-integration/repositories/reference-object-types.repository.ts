import { Injectable, Logger } from '@nestjs/common';
import type { ReferenceObjectTypeSummary } from '@rete/shared';

const DEFAULT_API_BASE = 'http://localhost:3001/api/v1';
const REQUEST_TIMEOUT_MS = 3000;

interface ReferenceObjectTypePayload {
  key: string;
  name: string;
  icon: string | null;
  isPreset: boolean;
}

/**
 * reference（struct-pass-reference）の ObjectType 一覧受口（ref-0095）への outbound fetch を担う
 * Repository 層（hom-0067）。DTO 境界を維持し、通信の詳細（共有 credential・タイムアウト・縮退）は
 * 本層に閉じる（architecture-invariants §Repository 分離）。
 *
 * - 共有 credential（`INTEGRATION_SERVICE_TOKEN`）を `x-service-token` ヘッダで送る（サービス認証）。
 * - タイムアウト短め（3s）・失敗時は空配列で縮退＝お気に入り機能を止めない側（criteria 5）。
 * - token はログ出力・エラー応答に出さない（criteria 6）。エラー応答の本文をそのまま返さない。
 */
@Injectable()
export class ReferenceObjectTypesRepository {
  private readonly logger = new Logger(ReferenceObjectTypesRepository.name);

  async findAll(): Promise<ReferenceObjectTypeSummary[]> {
    const token = process.env.INTEGRATION_SERVICE_TOKEN;
    const base = process.env.REFERENCE_INTEGRATION_API_URL ?? DEFAULT_API_BASE;
    // credential 未設定は縮退（うっかり開放しない・呼び出す側に渡す資格情報が無いため）。
    if (!token) {
      this.logger.warn('INTEGRATION_SERVICE_TOKEN 未設定のため reference 種別取得を縮退（空応答）');
      return [];
    }
    const url = `${base.replace(/\/$/, '')}/integration/object-types`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'x-service-token': token },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`reference 種別取得が HTTP ${res.status} のため縮退（空応答）`);
        return [];
      }
      const json = (await res.json()) as {
        success?: boolean;
        data?: ReferenceObjectTypePayload[];
      };
      const list = Array.isArray(json?.data) ? json.data : [];
      return list.map((t) => ({
        key: t.key,
        name: t.name,
        icon: t.icon ?? null,
        isPreset: t.isPreset,
      }));
    } catch {
      // 到達不能・タイムアウト・パース失敗は全て縮退（お気に入り機能全体を止めない）。
      this.logger.warn('reference 種別取得に失敗したため縮退（空応答）');
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
