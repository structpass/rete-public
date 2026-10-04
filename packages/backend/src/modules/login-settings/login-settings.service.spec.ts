import { BadRequestException } from '@nestjs/common';
import { LoginSettingsService } from './login-settings.service';

const mockRepo = {
  findPasswordPolicy: jest.fn(),
  upsertPasswordPolicy: jest.fn(),
  findIpWhitelist: jest.fn(),
  replaceIpWhitelist: jest.fn(),
};

const policyRow = {
  id: 'p',
  requireLowercase: true,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: true,
  minLength: 10,
  updatedAt: new Date(),
};

describe('LoginSettingsService', () => {
  let service: LoginSettingsService;

  beforeEach(() => {
    service = new LoginSettingsService(mockRepo as never);
  });

  describe('getPasswordPolicy', () => {
    it('行が無ければ既定ポリシーを ok で包んで返す', async () => {
      mockRepo.findPasswordPolicy.mockResolvedValue(null);
      const res = await service.getPasswordPolicy();
      expect(res.success).toBe(true);
      expect(res.data.minLength).toBe(8);
      expect(res.data.requireSymbol).toBe(false);
    });
  });

  describe('updatePasswordPolicy', () => {
    it('全フィールドを upsert へ渡し、写像済み DTO を返す', async () => {
      mockRepo.upsertPasswordPolicy.mockResolvedValue(policyRow);
      const dto = {
        requireLowercase: true,
        requireUppercase: true,
        requireNumber: true,
        requireSymbol: true,
        minLength: 10,
      };
      const res = await service.updatePasswordPolicy(dto as never);
      expect(mockRepo.upsertPasswordPolicy).toHaveBeenCalledWith(dto);
      expect(res.data.minLength).toBe(10);
      expect(res.data.requireSymbol).toBe(true);
    });
  });

  describe('getIpWhitelist', () => {
    it('エントリを写像し、検出 currentIp を同梱して返す', async () => {
      mockRepo.findIpWhitelist.mockResolvedValue([
        { id: 'e1', cidr: '203.0.113.0/24', note: '本社', sortOrder: 0, createdAt: new Date() },
      ]);
      const res = await service.getIpWhitelist('198.51.100.7');
      expect(res.data.currentIp).toBe('198.51.100.7');
      expect(res.data.entries).toEqual([{ id: 'e1', cidr: '203.0.113.0/24', note: '本社' }]);
    });
  });

  describe('updateIpWhitelist', () => {
    it('不正な CIDR が含まれれば BadRequest で弾く（DB へ書かない）', async () => {
      await expect(
        service.updateIpWhitelist(
          { entries: [{ cidr: 'bad/99', note: '' }] } as never,
          '198.51.100.7',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.replaceIpWhitelist).not.toHaveBeenCalled();
    });

    it('全て正当なら全置換し、検出 currentIp を同梱して返す', async () => {
      mockRepo.replaceIpWhitelist.mockResolvedValue([
        { id: 'e1', cidr: '203.0.113.0/24', note: '本社', sortOrder: 0, createdAt: new Date() },
        { id: 'e2', cidr: '2001:db8::/48', note: '', sortOrder: 1, createdAt: new Date() },
      ]);
      const res = await service.updateIpWhitelist(
        {
          entries: [
            { cidr: '203.0.113.0/24', note: '本社' },
            { cidr: '2001:db8::/48', note: '' },
          ],
        } as never,
        '198.51.100.7',
      );
      expect(mockRepo.replaceIpWhitelist).toHaveBeenCalledWith([
        { cidr: '203.0.113.0/24', note: '本社' },
        { cidr: '2001:db8::/48', note: '' },
      ]);
      expect(res.data.entries).toHaveLength(2);
      expect(res.data.currentIp).toBe('198.51.100.7');
    });

    // cmn-0233 MEDIUM4/5: 同じ CIDR を 2 行以上含む保存要求は、部分保存せず保存前に弾く。
    // 検査順は「書式不正 → 重複」の順で固定し、書式不正と同時入力時は書式不正を優先する（criteria 4）。
    it('同じ CIDR を 2 行以上含むと BadRequest で弾く（部分保存しない・DB へ書かない）', async () => {
      await expect(
        service.updateIpWhitelist(
          {
            entries: [
              { cidr: '203.0.113.0/24', note: 'a' },
              { cidr: '203.0.113.0/24', note: 'b' },
            ],
          } as never,
          '198.51.100.7',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      // DB への書き換え（replaceIpWhitelist）が走っていない＝部分保存しないことを直接観測する。
      expect(mockRepo.replaceIpWhitelist).not.toHaveBeenCalled();
    });

    it('エラーメッセージに重複した CIDR の値そのものが含まれる', async () => {
      // 重複した値をそのまま返却できないと、利用者がどちらを直すべきか判断できない。
      await expect(
        service.updateIpWhitelist(
          {
            entries: [
              { cidr: '203.0.113.0/24', note: '' },
              { cidr: '203.0.113.0/24', note: '' },
            ],
          } as never,
          '198.51.100.7',
        ),
      ).rejects.toThrow(/203\.0\.113\.0\/24/);
    });

    it('IPv6 の英字大小だけが違う CIDR（2001:DB8::/32 と 2001:db8::/32）も重複として弾く', async () => {
      await expect(
        service.updateIpWhitelist(
          {
            entries: [
              { cidr: '2001:DB8::/32', note: '' },
              { cidr: '2001:db8::/32', note: '' },
            ],
          } as never,
          '198.51.100.7',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.replaceIpWhitelist).not.toHaveBeenCalled();
    });

    it('重複が無い通常の保存は従来どおり成功する', async () => {
      mockRepo.replaceIpWhitelist.mockResolvedValue([
        { id: 'e1', cidr: '203.0.113.0/24', note: '', sortOrder: 0, createdAt: new Date() },
      ]);
      const res = await service.updateIpWhitelist(
        { entries: [{ cidr: '203.0.113.0/24', note: '' }] } as never,
        '198.51.100.7',
      );
      expect(res.success).toBe(true);
      expect(mockRepo.replaceIpWhitelist).toHaveBeenCalledTimes(1);
    });

    it('書式不正と重複が同時入力なら書式不正のエラーが優先する（検査順の固定）', async () => {
      // 1 行目: 書式不正 / 2 行目: 1 行目と同じ CIDR（重複）→ どちらが先でも BadRequest。
      // 「書式不正を優先」の意図は、書式不正のメッセージが返る（=重複メッセージより先に弾かれる）こと。
      // 1 行目で書式不正が先に throw されれば 2 行目の重複は検査されない（部分保存しない）と読み替える。
      await expect(
        service.updateIpWhitelist(
          {
            entries: [
              { cidr: 'bad/99', note: '' },
              { cidr: 'bad/99', note: '' },
            ],
          } as never,
          '198.51.100.7',
        ),
      ).rejects.toThrow(/不正な CIDR/);
      expect(mockRepo.replaceIpWhitelist).not.toHaveBeenCalled();
    });
  });
});
