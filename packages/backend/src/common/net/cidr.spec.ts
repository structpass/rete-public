import { isValidCidr, ipInCidr, isIpAllowed } from './cidr';

describe('isValidCidr', () => {
  it('IPv4 CIDR を許可する', () => {
    expect(isValidCidr('203.0.113.0/24')).toBe(true);
    expect(isValidCidr('198.51.100.42/32')).toBe(true);
    expect(isValidCidr('192.0.2.0/27')).toBe(true);
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
  });

  it('IPv6 CIDR を許可する', () => {
    expect(isValidCidr('2001:db8:abcd::/48')).toBe(true);
    expect(isValidCidr('::1/128')).toBe(true);
    expect(isValidCidr('fe80::/10')).toBe(true);
  });

  it('プレフィックスが範囲外なら拒否する（IPv4>32 / IPv6>128）', () => {
    expect(isValidCidr('203.0.113.0/33')).toBe(false);
    expect(isValidCidr('2001:db8::/129')).toBe(false);
  });

  it('プレフィックスや形式が欠けていれば拒否する', () => {
    expect(isValidCidr('203.0.113.0')).toBe(false);
    expect(isValidCidr('203.0.113.0/')).toBe(false);
    expect(isValidCidr('203.0.113.0/2a')).toBe(false);
    expect(isValidCidr('')).toBe(false);
  });

  it('住所部が不正なら拒否する', () => {
    expect(isValidCidr('not-an-ip/24')).toBe(false);
    expect(isValidCidr('999.0.0.1/24')).toBe(false);
    expect(isValidCidr('203.0.113/24')).toBe(false);
  });
});

describe('ipInCidr', () => {
  it('IPv4 レンジ内/外を判定する', () => {
    expect(ipInCidr('203.0.113.42', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.113.0', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.113.255', '203.0.113.0/24')).toBe(true);
    expect(ipInCidr('203.0.114.1', '203.0.113.0/24')).toBe(false);
    expect(ipInCidr('198.51.100.1', '203.0.113.0/24')).toBe(false);
  });

  it('端数 prefix（/27 等）を byte 内マスクで照合する', () => {
    expect(ipInCidr('192.0.2.30', '192.0.2.0/27')).toBe(true); // .0-.31
    expect(ipInCidr('192.0.2.31', '192.0.2.0/27')).toBe(true);
    expect(ipInCidr('192.0.2.32', '192.0.2.0/27')).toBe(false);
  });

  it('/32 はホスト一致のみ・/0 は全 IPv4 一致', () => {
    expect(ipInCidr('198.51.100.42', '198.51.100.42/32')).toBe(true);
    expect(ipInCidr('198.51.100.43', '198.51.100.42/32')).toBe(false);
    expect(ipInCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('IPv6 レンジ内/外を判定する（:: 圧縮含む）', () => {
    expect(ipInCidr('2001:db8:abcd::1', '2001:db8:abcd::/48')).toBe(true);
    expect(ipInCidr('2001:db8:abce::1', '2001:db8:abcd::/48')).toBe(false);
    expect(ipInCidr('::1', '::1/128')).toBe(true);
    expect(ipInCidr('fe80::1234', 'fe80::/10')).toBe(true);
  });

  it('family 不一致（IPv4 IP vs IPv6 CIDR）は false', () => {
    expect(ipInCidr('203.0.113.42', '2001:db8::/32')).toBe(false);
    expect(ipInCidr('2001:db8::1', '203.0.113.0/24')).toBe(false);
  });

  it('不正入力（パース不能・prefix 欠落/範囲外）はすべて false（fail-secure）', () => {
    expect(ipInCidr('not-an-ip', '203.0.113.0/24')).toBe(false);
    expect(ipInCidr('203.0.113.42', '203.0.113.0')).toBe(false);
    expect(ipInCidr('203.0.113.42', '203.0.113.0/33')).toBe(false);
    expect(ipInCidr('203.0.113.42', 'garbage/24')).toBe(false);
  });
});

describe('isIpAllowed', () => {
  it('いずれかの CIDR にマッチすれば true', () => {
    const list = ['203.0.113.0/24', '2001:db8::/32'];
    expect(isIpAllowed('203.0.113.9', list)).toBe(true);
    expect(isIpAllowed('2001:db8::5', list)).toBe(true);
  });

  it('どれにもマッチしなければ false', () => {
    expect(isIpAllowed('8.8.8.8', ['203.0.113.0/24'])).toBe(false);
  });

  it('空配列は false（"空＝全許可" は guard 側で別扱い）', () => {
    expect(isIpAllowed('8.8.8.8', [])).toBe(false);
  });
});
