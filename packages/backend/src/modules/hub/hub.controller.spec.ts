import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { HubController } from './hub.controller';
import { HubService } from './hub.service';

const mockHubService = {
  getMenu: jest.fn(),
};

describe('HubController', () => {
  let controller: HubController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HubController],
      providers: [{ provide: HubService, useValue: mockHubService }],
    }).compile();

    controller = module.get<HubController>(HubController);
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('getMenu', () => {
    it('Service の menu を ok() エンベロープ（success:true / data）で包んで返すこと', () => {
      const menu = { items: [{ key: 'tasks' }] };
      mockHubService.getMenu.mockReturnValue(menu);

      const result = controller.getMenu();

      expect(result).toEqual({ success: true, data: menu });
      expect(mockHubService.getMenu).toHaveBeenCalledTimes(1);
    });
  });
});
