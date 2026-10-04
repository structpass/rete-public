import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ok, okMessage } from '../../common/dto';
import { SettingsRepository } from './repositories/settings.repository';
import { toTenantResponse, toTenantSystemResponse } from './settings.mapper';
import { ReorderSystemsDto, ToggleSystemDto, UpdateTenantInfoDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  /** テナント情報を返す。未設定なら app 既定（空名 / 配色なし）。 */
  async getTenant() {
    return ok(toTenantResponse(await this.repo.findTenant()));
  }

  /** テナント情報を部分更新する。未指定フィールドは既存値を保持（部分 upsert）。 */
  async updateTenant(dto: UpdateTenantInfoDto) {
    const updated = await this.repo.upsertTenant({
      name: dto.name,
      badgeColor: dto.badgeColor,
    });
    return ok(toTenantResponse(updated));
  }

  /** 契約システム一覧を sortOrder 昇順で返す。 */
  async getSystems() {
    const systems = await this.repo.findSystems();
    return ok(systems.map(toTenantSystemResponse));
  }

  /**
   * 契約システムの並び替えを永続化し、反映後の一覧を返す。集合検証は repository の tx 内で行われ
   * （favorites.reorder と同型・cmn-0345）、不一致（過不足・重複）なら set-mismatch が返るため
   * ここで 400 へ翻訳する。DTO の @ArrayUnique と合わせて二重防御。
   */
  async reorderSystems(dto: ReorderSystemsDto) {
    const result = await this.repo.reorderSystems(dto.orderedIds);
    if (!result.ok) {
      throw new BadRequestException(
        'orderedIds は現存する全システムの id を過不足・重複なく指定してください',
      );
    }
    return ok(result.items.map(toTenantSystemResponse));
  }

  /** 契約システムの有効/無効を切り替え、更新後の 1 行を返す。 */
  async toggleSystem(id: string, dto: ToggleSystemDto) {
    const updated = await this.repo.toggleSystem(id, dto.enabled);
    return ok(toTenantSystemResponse(updated));
  }

  /**
   * 契約システムを削除する（ST-3 cascade cleanup）。
   * 1) 存在確認（不在は NOT_FOUND）
   * 2) TenantSystem 削除（権限行は set-0180 で撤去済み）。
   * 削除したシステムを指す権限行は孤立するため、tx 内で先に除去する。
   */
  async deleteSystem(id: string) {
    const system = await this.repo.findSystemById(id);
    if (!system) {
      throw new NotFoundException('削除対象の契約システムが見つかりません');
    }
    await this.repo.deleteSystem(id);
    return okMessage('Tenant system deleted successfully');
  }
}
