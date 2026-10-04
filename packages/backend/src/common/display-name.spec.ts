import { composeDisplayName, splitDisplayName } from './display-name';

describe('splitDisplayName / composeDisplayName', () => {
  it('スペース区切りで先頭を姓・残りを名にする', () => {
    expect(splitDisplayName('田中 太郎')).toEqual({ familyName: '田中', givenName: '太郎' });
    expect(splitDisplayName('倉庫 一郎')).toEqual({ familyName: '倉庫', givenName: '一郎' });
  });

  it('空白無しは全体を姓・名は空', () => {
    expect(splitDisplayName('Yamada')).toEqual({ familyName: 'Yamada', givenName: '' });
  });

  it('全角スペースでも分割する', () => {
    expect(splitDisplayName('山田　太郎')).toEqual({ familyName: '山田', givenName: '太郎' });
  });

  it('名にスペースが残っても先頭分割のみ', () => {
    expect(splitDisplayName('Smith John A')).toEqual({ familyName: 'Smith', givenName: 'John A' });
  });

  it('compose は givenName が空なら familyName のみ', () => {
    expect(composeDisplayName('Yamada', '')).toBe('Yamada');
    expect(composeDisplayName('田中', '太郎')).toBe('田中 太郎');
  });

  it('split→compose は表示名を復元する（半角スペース正規化）', () => {
    const s = splitDisplayName('田中 太郎');
    expect(composeDisplayName(s.familyName, s.givenName)).toBe('田中 太郎');
  });
});
