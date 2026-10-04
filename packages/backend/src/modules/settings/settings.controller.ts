import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@rete/shared';
import { SettingsService } from './settings.service';
import { ReorderSystemsDto, ToggleSystemDto, UpdateTenantInfoDto } from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * テナント運営設定（ST-1）。
 * - 読み取り（GET）は全認証ユーザー許可。
 * - 書込（PATCH / DELETE）は ADMIN のみ（HIGH-3: ST-3 RBAC 確立で付与）。
 * 並び替えはコレクション PATCH（body: orderedIds）、有効化は `:id/toggle`（動詞サフィックスで :id 衝突回避）。
 */
@ApiTags('settings')
@Controller('settings')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('tenant')
  @ApiOperation({ summary: 'テナント情報取得' })
  async getTenant() {
    return this.settingsService.getTenant();
  }

  @Patch('tenant')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'テナント情報更新（名前 / バッジ配色）' })
  async updateTenant(@Body() dto: UpdateTenantInfoDto) {
    return this.settingsService.updateTenant(dto);
  }

  @Get('tenant/systems')
  @ApiOperation({ summary: 'テナント契約システム一覧取得' })
  async getSystems() {
    return this.settingsService.getSystems();
  }

  @Patch('tenant/systems')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'テナント契約システム並び替え' })
  async reorderSystems(@Body() dto: ReorderSystemsDto) {
    return this.settingsService.reorderSystems(dto);
  }

  @Patch('tenant/systems/:id/toggle')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'テナント契約システム有効/無効切り替え' })
  async toggleSystem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ToggleSystemDto) {
    return this.settingsService.toggleSystem(id, dto);
  }

  // 削除は破壊的操作（権限行の cascade cleanup + システム本体削除）のため別途 DELETE で切る。
  // `:id/toggle` のサフィックスと衝突しないよう DELETE /:id でマッチさせる（NestJS は method で分岐）。
  @Delete('tenant/systems/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'テナント契約システム削除（参照権限行も連鎖削除 / ST-3）' })
  async deleteSystem(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.deleteSystem(id);
  }
}
