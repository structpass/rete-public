import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { LoginSettingsController } from './login-settings.controller';
import { LoginSettingsService } from './login-settings.service';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const mockService = {
  getPasswordPolicy: jest.fn(),
  updatePasswordPolicy: jest.fn(),
  getIpWhitelist: jest.fn(),
  updateIpWhitelist: jest.fn(),
};

describe('LoginSettingsController', () => {
  let controller: LoginSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoginSettingsController],
      providers: [{ provide: LoginSettingsService, useValue: mockService }],
    })
      .overrideGuard(AuthenticatedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<LoginSettingsController>(LoginSettingsController);
  });

  it('getPasswordPolicy は service へ委譲する', async () => {
    const expected = { success: true, data: { minLength: 8 } };
    mockService.getPasswordPolicy.mockResolvedValue(expected);
    expect(await controller.getPasswordPolicy()).toBe(expected);
  });

  it('updatePasswordPolicy は dto を service へ委譲する', async () => {
    const dto = { minLength: 10 };
    const expected = { success: true, data: dto };
    mockService.updatePasswordPolicy.mockResolvedValue(expected);
    expect(await controller.updatePasswordPolicy(dto as never)).toBe(expected);
    expect(mockService.updatePasswordPolicy).toHaveBeenCalledWith(dto);
  });

  it('getIpWhitelist は req から検出した IP を service へ渡す', async () => {
    const expected = { success: true, data: { entries: [], currentIp: '203.0.113.9' } };
    mockService.getIpWhitelist.mockResolvedValue(expected);
    const req = { ip: '203.0.113.9' };
    expect(await controller.getIpWhitelist(req as never)).toBe(expected);
    expect(mockService.getIpWhitelist).toHaveBeenCalledWith('203.0.113.9');
  });

  it('updateIpWhitelist は dto と検出 IP を service へ渡す', async () => {
    const dto = { entries: [{ cidr: '203.0.113.0/24', note: '' }] };
    const expected = { success: true, data: { entries: [], currentIp: '203.0.113.9' } };
    mockService.updateIpWhitelist.mockResolvedValue(expected);
    const req = { ip: '203.0.113.9' };
    expect(await controller.updateIpWhitelist(dto as never, req as never)).toBe(expected);
    expect(mockService.updateIpWhitelist).toHaveBeenCalledWith(dto, '203.0.113.9');
  });
});
