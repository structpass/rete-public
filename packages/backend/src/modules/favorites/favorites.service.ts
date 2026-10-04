import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ok, okMessage } from '../../common/dto';
import { FavoritesRepository } from './repositories/favorites.repository';
import { toFavoriteDto } from './favorites.mapper';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { ReorderFavoritesDto } from './dto/reorder-favorites.dto';

/**
 * 横断お気に入り（HM-1）のアプリケーションサービス。検証 + オーケストレーションのみを担い、
 * DB アクセスは Repository 経由（§2）、Entity→DTO 変換は mapper（§1）。
 *
 * 認可境界は controller の AuthenticatedGuard（ログイン必須）のみ。お気に入りは個人データのため
 * role は問わず、全操作を「セッションの accountId」にスコープする（他人のお気に入りには触れない）。
 */
@Injectable()
export class FavoritesService {
  constructor(private readonly repo: FavoritesRepository) {}

  /** 自分のお気に入り一覧（sortOrder 昇順）。 */
  async findAll(accountId: string) {
    const items = await this.repo.findByAccount(accountId);
    return ok(items.map(toFavoriteDto));
  }

  /**
   * 追加。targetRef 省略時（manual 追加）は合成 id を採番し、同一リソースの重複は 409 で弾く。
   * sortOrder は採番と create を同一 Serializable tx 内で行う createWithAutoSortOrder に任せる
   * （cmn-0151 分割B④・並行追加による番号重複を封じる。現行の「0 件時 0・以降 max+1」挙動を維持）。
   * 事前検査と DB の unique 制約の二重防御で冪等性を担保する（並行追加の TOCTOU は最終的に
   * unique 制約が防ぐ。事前検査は通常時の親切な 409 メッセージ用）。
   *
   * kind='system' は reference の ObjectType.key を targetRef に持つ（hom-0067）。randomUUID の仮 ID を
   * 採番するとクリックしても実在しない画面へ飛ぶため、targetRef 省略時は 400 で弾く（criteria【3】）。
   */
  async add(accountId: string, dto: CreateFavoriteDto) {
    // 前後空白の正規化はこのプロジェクトの慣例で service 層が担う（DTO は長さ検証のみ）。
    // 空白のみのラベルは trim 後に空になるため弾く（DTO の @MinLength は未 trim を許してしまう）。
    const label = dto.label.trim();
    if (label.length === 0) {
      throw new BadRequestException('ラベルを入力してください。');
    }
    if (dto.kind === 'system' && !dto.targetRef) {
      throw new BadRequestException('システム種別は targetRef を指定してください。');
    }
    const targetRef = dto.targetRef && dto.targetRef.length > 0 ? dto.targetRef : randomUUID();

    const existing = await this.repo.findByTarget(accountId, dto.kind, targetRef);
    if (existing) {
      throw new ConflictException('このお気に入りは既に登録されています。');
    }

    const created = await this.repo.createWithAutoSortOrder(accountId, {
      kind: dto.kind,
      targetRef,
      label,
    });
    return ok(toFavoriteDto(created));
  }

  /** 削除。自分の所有でない / 不在なら NOT_FOUND（accountId スコープ削除の 0 件で判定）。 */
  async remove(accountId: string, id: string) {
    const count = await this.repo.deleteOwned(accountId, id);
    if (count === 0) {
      throw new NotFoundException('指定されたお気に入りが見つかりません。');
    }
    return okMessage('お気に入りを削除しました');
  }

  /**
   * 並び替え。orderedIds が「自分の現存お気に入り全件の id」と過不足・重複なく一致することを
   * トランザクション内で検証してから永続化する（並走 add/delete による検証すり抜けを封じる）。
   * 部分集合だと未指定行の sortOrder が据え置かれ並び順が不整合になるため弾く（set-mismatch → 400）。
   */
  async reorder(accountId: string, dto: ReorderFavoritesDto) {
    const result = await this.repo.reorder(accountId, dto.orderedIds);
    if (!result.ok) {
      throw new BadRequestException(
        // cmn-0345: 文言に「重複」を含意させる（旧文言は過不足のみで、重複入力でもこのエラーが
        // 出ることを読者が含意できない）。
        'orderedIds は現在のお気に入り全件の id を過不足・重複なく指定してください',
      );
    }
    return ok(result.items.map(toFavoriteDto));
  }
}
