import { Injectable } from '@nestjs/common';
import { AnnouncementTag } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

/**
 * お知らせ専用タグマスタのデータアクセス層（§2 Repository 分離 / rete-home-0043）。
 * Service は本クラス経由でのみ DB に触る。
 * Prisma delegate（prisma.announcementTag）を使い、DTO 変換は mapper に委ねる。
 * File の TagsRepository と同型の最小 CRUD（tags.repository と対称）。
 */
@Injectable()
export class AnnouncementTagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * kind でスコープしたタグを name 昇順で返す（マスタ一覧 / 付与ピッカー共通・hom-0072）。
   * 既定はアーカイブ済を除外、includeArchived=true で全件（タグ管理画面用・hom-0083・Category と同方針）。
   */
  findAll(kind: string, includeArchived = false): Promise<AnnouncementTag[]> {
    return this.prisma.announcementTag.findMany({
      where: { kind, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<AnnouncementTag | null> {
    return this.prisma.announcementTag.findUnique({ where: { id } });
  }

  /** 同一 kind 内の同名タグを引く（作成 / 改名時の重複チェック。一意制約は kind+name の複合・hom-0072）。 */
  findByName(kind: string, name: string): Promise<AnnouncementTag | null> {
    return this.prisma.announcementTag.findUnique({ where: { kind_name: { kind, name } } });
  }

  create(data: {
    kind: string;
    name: string;
    icon: string;
    color: string;
  }): Promise<AnnouncementTag> {
    return this.prisma.announcementTag.create({ data });
  }

  /**
   * タグを部分更新する。undefined フィールドは Prisma が更新スキップし既存値を保持するため、
   * read-modify-write 不要（TagsRepository と同方針）。kind は改名時の複合キー再解決のため呼び出し元
   * （service）が現在の kind を渡す前提（本メソッドは id 直叩きで kind 自体は変更しない）。
   */
  update(
    id: string,
    data: { name?: string; icon?: string; color?: string; archivedAt?: Date | null },
  ): Promise<AnnouncementTag> {
    return this.prisma.announcementTag.update({ where: { id }, data });
  }

  /** タグを削除する。付与（AnnouncementTagAssignment）は schema の onDelete:Cascade で連鎖削除される。 */
  delete(id: string): Promise<AnnouncementTag> {
    return this.prisma.announcementTag.delete({ where: { id } });
  }
}
