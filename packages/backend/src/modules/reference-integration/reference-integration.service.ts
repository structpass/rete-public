import { Injectable } from '@nestjs/common';
import { ok } from '../../common/dto/response.dto';
import type { ReferenceObjectTypeSummary } from '@rete/shared';
import { ReferenceObjectTypesRepository } from './repositories/reference-object-types.repository';

/**
 * reference（struct-pass-reference）の ObjectType 一覧を rete backend の proxy API として提供する
 * アプリケーションサービス（hom-0067）。reference から取得した種別をそのまま返す。
 *
 * - 通信の詳細（共有 credential・タイムアウト・縮退）は Repository 層に閉じる。
 * - reference 未起動・API 障害時は Repository が空配列で縮退し、本サービスは `ok([])` を返す
 *   （お気に入り機能全体を止めない側・criteria【5】）。
 */
@Injectable()
export class ReferenceObjectTypesService {
  constructor(private readonly repo: ReferenceObjectTypesRepository) {}

  async findAll(): Promise<{ success: true; data: ReferenceObjectTypeSummary[] }> {
    const items = await this.repo.findAll();
    return ok(items);
  }
}
