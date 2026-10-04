import apiClient from '@/lib/api-client';
import type {
  ApiResponse,
  OrganizationDto,
  ProjectDto,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  CreateProjectInput,
  UpdateProjectInput,
} from '@rete/shared';

/**
 * 器（組織/プロジェクト）管理 API（set-0028 frontend 用）。
 * 組織: GET /organizations/admin, POST /organizations, PATCH /organizations/admin/:id
 * PJ:   GET /projects/admin, POST /projects, PATCH /projects/admin/:id
 * 全 admin 系エンドポイントは system Role=ADMIN 限定（backend RolesGuard）。
 */

// ── 組織 ────────────────────────────────────────────────────────────────────

/** 全組織一覧（GET /organizations/admin・system ADMIN 専用・includeArchived 対応）。 */
export async function fetchOrganizationsAdmin(includeArchived = false): Promise<OrganizationDto[]> {
  const res = await apiClient.get<ApiResponse<OrganizationDto[]>>('/organizations/admin', {
    params: includeArchived ? { includeArchived: true } : {},
  });
  return res.data.data;
}

/** 組織作成（POST /organizations・作成者が自動的に ADMIN になる）。 */
export async function createOrganization(input: CreateOrganizationInput): Promise<OrganizationDto> {
  const res = await apiClient.post<ApiResponse<OrganizationDto>>('/organizations', input);
  return res.data.data;
}

/** 組織の物理削除（DELETE /organizations/admin/:id・system ADMIN 専用・set-0162）。 */
export async function deleteOrganization(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<unknown>>(`/organizations/admin/${id}`);
}

/** 組織管理更新（PATCH /organizations/admin/:id・system ADMIN 専用・改名 / archive 連鎖）。 */
export async function adminUpdateOrganization(
  id: string,
  input: UpdateOrganizationInput,
): Promise<OrganizationDto> {
  const res = await apiClient.patch<ApiResponse<OrganizationDto>>(
    `/organizations/admin/${id}`,
    input,
  );
  return res.data.data;
}

// ── プロジェクト ─────────────────────────────────────────────────────────────

/** 全プロジェクト一覧（GET /projects/admin・system ADMIN 専用・組織フィルタ / includeArchived 対応）。 */
export async function fetchProjectsAdmin(
  organizationId?: string,
  includeArchived = false,
): Promise<ProjectDto[]> {
  const params: Record<string, unknown> = {};
  if (organizationId) params.organizationId = organizationId;
  if (includeArchived) params.includeArchived = true;
  const res = await apiClient.get<ApiResponse<ProjectDto[]>>('/projects/admin', { params });
  return res.data.data;
}

/** プロジェクト作成（POST /projects/admin・system ADMIN 専用・membership 非依存・set-0162）。 */
export async function createProjectAdmin(input: CreateProjectInput): Promise<ProjectDto> {
  const res = await apiClient.post<ApiResponse<ProjectDto>>('/projects/admin', input);
  return res.data.data;
}

/** プロジェクトの物理削除（DELETE /projects/admin/:id・system ADMIN 専用・set-0162）。 */
export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<unknown>>(`/projects/admin/${id}`);
}

/** プロジェクト管理更新（PATCH /projects/admin/:id・system ADMIN 専用・改名 / archive 連鎖）。 */
export async function adminUpdateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<ProjectDto> {
  const res = await apiClient.patch<ApiResponse<ProjectDto>>(`/projects/admin/${id}`, input);
  return res.data.data;
}
