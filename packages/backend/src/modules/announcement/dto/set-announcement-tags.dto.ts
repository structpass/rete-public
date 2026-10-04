import { TagIdSetDto } from '../../../common/dto';

/**
 * PUT /announcements/:id/tags body（全置換・空配列で全解除 / rete-home-0043）。
 * cmn-0036(A): 同型の独立宣言を廃し共通基底 TagIdSetDto を共有する
 * （cmn-0044: 基底は common/dto へ移設済・旧 files/dto への reach-in を解消）
 * （tagIds=実在タグ UUID 集合・上限 TAG_ASSIGN_MAX・@IsUUID('all')）。
 * これにより上限値 / UUID バージョン指定の二重管理が解消される。
 * 重複は service 層が畳む（skipDuplicates）— files と同じ既存設計を踏襲し @ArrayUnique は基底に持たせない。
 */
export class SetAnnouncementTagsDto extends TagIdSetDto {}
