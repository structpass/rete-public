import apiClient from '@/lib/api-client';
import type {
  ApiResponse,
  MembershipDto,
  AddMembershipInput,
  MembershipScopeType,
  PermissionMatrixDto,
  UpdateMembershipRoleInput,
} from '@rete/shared';

/**
 * メンバーシップ管理 API（set-0028 frontend 用）。
 * GET /memberships?scopeType=&scopeId=  — スコープのメンバー一覧
 * POST /memberships                     — メンバー追加
 * PATCH /memberships/:id               — ロール変更（set-0027 新設）
 * DELETE /memberships/:id              — メンバー解除
 * GET /memberships/admin/matrix         — 管理グループ単位の所属マトリクス一括取得
 */

/** 管理グループ単位の所属マトリクス一括取得（システム ADMIN 専用）。 */
export async function fetchPermissionMatrix(): Promise<PermissionMatrixDto> {
  const res = await apiClient.get<ApiResponse<PermissionMatrixDto>>('/memberships/admin/matrix');
  return res.data.data;
}

/** スコープのメンバー一覧（GET /memberships?scopeType=&scopeId=）。 */
export async function fetchMemberships(
  scopeType: MembershipScopeType,
  scopeId: string,
): Promise<MembershipDto[]> {
  const res = await apiClient.get<ApiResponse<MembershipDto[]>>('/memberships', {
    params: { scopeType, scopeId },
  });
  return res.data.data;
}

/** メンバー追加（POST /memberships・冪等 upsert・スコープ ADMIN のみ）。 */
export async function addMembership(input: AddMembershipInput): Promise<MembershipDto> {
  const res = await apiClient.post<ApiResponse<MembershipDto>>('/memberships', input);
  return res.data.data;
}

/** ロール変更（PATCH /memberships/:id・set-0027 新設・ADMIN/MEMBER 切替）。 */
export async function updateMembershipRole(
  id: string,
  role: UpdateMembershipRoleInput['role'],
): Promise<MembershipDto> {
  const input: UpdateMembershipRoleInput = { role };
  const res = await apiClient.patch<ApiResponse<MembershipDto>>(`/memberships/${id}`, input);
  return res.data.data;
}

/** メンバーシップ解除（DELETE /memberships/:id・スコープ ADMIN のみ）。 */
export async function removeMembership(id: string): Promise<void> {
  await apiClient.delete(`/memberships/${id}`);
}
