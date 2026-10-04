import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@rete/shared';
import { ReferenceObjectTypesService } from './reference-integration.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * reference 種別一覧の proxy API（hom-0067）。
 *
 * - rete のユーザーセッション認証（AuthenticatedGuard）+ ADMIN ロール（RolesGuard・criteria【7】）で守る。
 *   reference 側方針（SYS_ADMIN 限定・ref-0079）に揃えるため、表示のみでなく endpoint 自体を ADMIN 限定にし、
 *   クライアント側ゲート（role==='ADMIN'）だけに依存しない（表示・強制の二層）。
 * - reference への通信は Repository 層が共有 credential（`INTEGRATION_SERVICE_TOKEN`）で行う（サービス認証）。
 * - クライアント（rete frontend）が reference API を直接叩かない経路を提供する（criteria【1】）。
 * - 失敗時は空配列へ縮退し、お気に入り機能全体を止めない（criteria【5】）。
 */
@ApiTags('reference-integration')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Controller('integration/object-types')
export class ReferenceObjectTypesController {
  constructor(private readonly service: ReferenceObjectTypesService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'reference の ObjectType 種別一覧（動的取得・proxy・ADMIN 限定）' })
  findAll() {
    return this.service.findAll();
  }
}
