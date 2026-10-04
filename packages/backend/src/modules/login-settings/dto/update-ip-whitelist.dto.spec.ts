import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateIpWhitelistDto } from './update-ip-whitelist.dto';
import { IP_CIDR_MAX_LENGTH, IP_NOTE_MAX_LENGTH } from '../login-settings.constants';

/**
 * UpdateIpWhitelistDto の検証境界テスト（ネストした各エントリの CIDR / note 制約）。
 * - cidr: IsCidrConstraint（IPv4/IPv6）+ MaxLength。不正 CIDR・超過長は拒否。
 * - note: 任意（省略可）だが指定時は MaxLength。
 * - entries: ArrayMaxSize で件数上限。
 */
async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateIpWhitelistDto, payload);
  return validate(dto, { whitelist: true });
}

describe('UpdateIpWhitelistDto', () => {
  it('正常な IPv4 / IPv6 CIDR + 備考を受理すること', async () => {
    const errors = await errorsFor({
      entries: [
        { cidr: '203.0.113.0/24', note: '本社' },
        { cidr: '2001:db8::/48', note: 'IPv6' },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('空配列（制限解除）を受理すること', async () => {
    const errors = await errorsFor({ entries: [] });
    expect(errors).toHaveLength(0);
  });

  it('備考を省略しても受理すること（note は任意）', async () => {
    const errors = await errorsFor({ entries: [{ cidr: '203.0.113.0/24' }] });
    expect(errors).toHaveLength(0);
  });

  it('不正な CIDR を拒否すること', async () => {
    const errors = await errorsFor({ entries: [{ cidr: 'not-a-cidr', note: '' }] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('CIDR が最大長を超えたら拒否すること', async () => {
    const longCidr = `${'9'.repeat(IP_CIDR_MAX_LENGTH + 5)}/32`;
    const errors = await errorsFor({ entries: [{ cidr: longCidr, note: '' }] });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('備考が最大長を超えたら拒否すること', async () => {
    const errors = await errorsFor({
      entries: [{ cidr: '203.0.113.0/24', note: 'あ'.repeat(IP_NOTE_MAX_LENGTH + 1) }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
