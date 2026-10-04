import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertAtLeastOneField,
  assertNoDuplicateName,
  computeArchivedAt,
} from './tag-master.helpers';

// hom-0103: 「アーカイブ済みタグ名は再利用不可」仕様（案B）。既存衝突がアーカイブ済みかどうかで
// エラーメッセージを分岐する共通ヘルパの分岐網羅（AnnouncementTag / File Tag 両方から呼ばれる）。
describe('assertNoDuplicateName（hom-0103・アーカイブ済み判定）', () => {
  it('衝突なし（existing=null）は何もしない', () => {
    expect(() => assertNoDuplicateName('新規タグ', null)).not.toThrow();
  });

  it('アクティブなタグと衝突すれば汎用文言で Conflict', () => {
    expect(() => assertNoDuplicateName('重要', { id: 'a1', archivedAt: null })).toThrow(
      ConflictException,
    );
    try {
      assertNoDuplicateName('重要', { id: 'a1', archivedAt: null });
    } catch (e) {
      expect((e as ConflictException).message).toBe('タグ名「重要」は既に使用されています');
    }
  });

  it('アーカイブ済みタグと衝突すればアーカイブ済み専用文言で Conflict', () => {
    try {
      assertNoDuplicateName('重要', { id: 'a1', archivedAt: new Date('2026-01-01') });
      throw new Error('unreachable');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).message).toBe(
        'タグ名「重要」はアーカイブ済みのタグと同名です（復元するか別名にしてください）',
      );
    }
  });

  it('File タグ（archivedAt フィールド自体が無い）は既存挙動どおり汎用文言のまま退行しない', () => {
    try {
      assertNoDuplicateName('重要', { id: 'a1' });
      throw new Error('unreachable');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).message).toBe('タグ名「重要」は既に使用されています');
    }
  });
});

// hom-0086 項目1: 全項目未指定エラーの文言を呼び出し側タグ種別に合わせる。
// お知らせタグ（archived 対応）は includeArchived:true で archived を含む文言、
// File タグ（archived 非対応）は従来文言のまま。
describe('assertAtLeastOneField（hom-0086・文言の archived 出し分け）', () => {
  it('お知らせタグ経由（includeArchived:true）: 全項目未指定の文言に archived が含まれる', () => {
    try {
      assertAtLeastOneField({}, { includeArchived: true });
      throw new Error('unreachable');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe(
        '更新する項目（name / icon / color / archived）がありません',
      );
    }
  });

  it('File タグ経由（オプション無し）: 従来文言のまま archived を含まない', () => {
    try {
      assertAtLeastOneField({});
      throw new Error('unreachable');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).message).toBe(
        '更新する項目（name / icon / color）がありません',
      );
    }
  });

  it('いずれか 1 項目でも指定があれば投げない（archived のみ指定を含む）', () => {
    expect(() => assertAtLeastOneField({ name: 'A' }, { includeArchived: true })).not.toThrow();
    expect(() =>
      assertAtLeastOneField({ archived: true }, { includeArchived: true }),
    ).not.toThrow();
    expect(() => assertAtLeastOneField({ icon: 'Star' })).not.toThrow();
  });
});

// fil-0094: archived → archivedAt の畳み込み（AnnouncementTagsService の既存ロジックを
// File タグと共用するため抽出）。両 service の update から呼ばれる分岐網羅。
describe('computeArchivedAt（fil-0094・archived → archivedAt の畳み込み）', () => {
  it('archived 未指定（undefined）は undefined を返し更新スキップ（変更なし）', () => {
    expect(computeArchivedAt(null, undefined)).toBeUndefined();
    expect(computeArchivedAt(new Date(), undefined)).toBeUndefined();
  });

  it('未アーカイブ + archived:true は現在時刻（Date）を返す', () => {
    const result = computeArchivedAt(null, true);
    expect(result).toBeInstanceOf(Date);
  });

  it('アーカイブ済 + archived:false は null（解除）を返す', () => {
    expect(computeArchivedAt(new Date('2026-06-01T00:00:00Z'), false)).toBeNull();
  });

  it('既にアーカイブ済へ archived:true 再送は undefined（初回アーカイブ日時を保持）', () => {
    expect(computeArchivedAt(new Date('2026-06-01T00:00:00Z'), true)).toBeUndefined();
  });

  it('未アーカイブへ archived:false は undefined（無変化・null で上書きしない）', () => {
    expect(computeArchivedAt(null, false)).toBeUndefined();
  });
});
