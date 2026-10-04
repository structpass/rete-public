import { Injectable } from '@nestjs/common';
import { Tag } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/**
 * タグマスタのデータアクセス層（§2 Repository 分離）。Service は本クラス経由でのみ DB に触る。
 * Prisma Entity だけを返し、DTO 変換は mapper（tags.mapper）に委ねる。
 */
@Injectable()
export class TagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 全タグを name 昇順で返す（マスタ一覧 / 付与ピッカー共通）。件数はマスタ運用のため上限を設けない。
   * 既定はアーカイブ済を除外、includeArchived=true で全件（タグ管理画面用・fil-0094・hom-0083 と同方針）。
   */
  findAll(includeArchived = false): Promise<Tag[]> {
    return this.prisma.tag.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<Tag | null> {
    return this.prisma.tag.findUnique({ where: { id } });
  }

  /**
   * 同名タグを引く（作成 / 改名時の重複チェック。name は @unique）。全列（archivedAt 含む）を返すため、
   * アーカイブ済み同名タグの再利用不可ポリシー（hom-0103・fil-0094 横展開）の判定に使える。
   */
  findByName(name: string): Promise<Tag | null> {
    return this.prisma.tag.findUnique({ where: { name } });
  }

  create(data: { name: string; icon: string; color: string }): Promise<Tag> {
    return this.prisma.tag.create({ data });
  }

  /**
   * タグを部分更新する。undefined フィールドは Prisma が更新スキップし既存値を保持するため、
   * read-modify-write 不要（同時更新でも未指定フィールドのロストアップデートが起きない）。
   */
  update(
    id: string,
    data: { name?: string; icon?: string; color?: string; archivedAt?: Date | null },
  ): Promise<Tag> {
    return this.prisma.tag.update({ where: { id }, data });
  }

  /** タグを削除する。付与（FileTag）は schema の onDelete:Cascade で連鎖削除される。 */
  delete(id: string): Promise<Tag> {
    return this.prisma.tag.delete({ where: { id } });
  }
}
