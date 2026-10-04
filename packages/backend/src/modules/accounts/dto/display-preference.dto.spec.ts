import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDisplayPreferenceDto } from './display-preference.dto';

/**
 * UpdateDisplayPreferenceDto の検証境界テスト（mdl-0022）。
 * stripeColor はログイン時に :root の CSS 変数（--sp-row-stripe）へそのまま流し込む値のため、
 * #RRGGBB 6 桁 hex 以外（rgb() / url() / expression 等の style injection の芽）を形式で拒否する。
 */
async function errorsFor(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateDisplayPreferenceDto, body);
  return validate(dto);
}

describe('UpdateDisplayPreferenceDto', () => {
  it.each(['#FAFCFF', '#fafcff', '#000000', '#A1b2C3'])(
    '6 桁 hex %s を受理すること（大文字小文字は不問）',
    async (stripeColor) => {
      expect(await errorsFor({ stripeEnabled: true, stripeColor })).toHaveLength(0);
    },
  );

  it.each([
    '',
    '#FFF',
    'FAFCFF',
    '#FAFCFFAA',
    'red',
    'rgb(255,0,0)',
    'url(javascript:alert(1))',
    '#FAFCFF; background:red',
  ])('不正な縞色 %p を拒否すること（CSS 変数への injection を形式で塞ぐ）', async (stripeColor) => {
    const errors = await errorsFor({ stripeEnabled: true, stripeColor });
    expect(errors.some((e) => e.property === 'stripeColor')).toBe(true);
  });

  it('stripeColor が文字列でなければ拒否すること', async () => {
    const errors = await errorsFor({ stripeEnabled: true, stripeColor: 123 });
    expect(errors.some((e) => e.property === 'stripeColor')).toBe(true);
  });

  it.each(['true', 1, null, undefined])(
    'stripeEnabled が boolean でない %p を拒否すること',
    async (stripeEnabled) => {
      const errors = await errorsFor({ stripeEnabled, stripeColor: '#FAFCFF' });
      expect(errors.some((e) => e.property === 'stripeEnabled')).toBe(true);
    },
  );
});
