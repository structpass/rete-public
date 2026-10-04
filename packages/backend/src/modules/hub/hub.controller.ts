import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/dto/response.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { HubService } from './hub.service';

@ApiTags('hub')
@UseGuards(AuthenticatedGuard)
@Controller('hub')
export class HubController {
  constructor(private readonly hubService: HubService) {}

  @ApiOperation({ summary: 'Hub メニュー（利用可能なシステム一覧）を取得' })
  @Get('menu')
  getMenu() {
    return ok(this.hubService.getMenu());
  }
}
