/**
 * Activity API - 活动接口
 * 底层 API 调用，与后端接口 1:1 对应
 *
 * 后端字段使用 snake_case，前端在此层直接使用 snake_case
 */

import { api } from "@/services/api";

// ============================================
// 类型定义 (与后端 snake_case 保持一致)
// ============================================

export type ActivityStatus =
  | "draft"
  | "published"
  | "active"
  | "full"
  | "ended"
  | "cancelled";

export interface Activity {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  expectation?: string;
  cover_image?: string;
  registration_deadline?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  max_participants?: number;
  fee?: number;
  tags?: string[];
  checkin_password?: string;
  status: ActivityStatus;
  created_at?: string;
  updated_at?: string;
  /** 商家列表聚合字段，避免前端按活动发起 N+1 请求。 */
  enrolledCount?: number;
  currentParticipants?: number;
  occupiedParticipants?: number;
  remainingParticipants?: number | null;
  totalApplications?: number;
  capacitySummary?: {
    maxParticipants: number;
    totalApplications: number;
    occupiedParticipants: number;
    pendingParticipants: number;
    approvedParticipants: number;
    rejectedParticipants: number;
    waitlistParticipants: number;
    cancelledParticipants: number;
    remainingParticipants: number | null;
    isUnlimited: boolean;
    isFull: boolean;
    overLimit: boolean;
  } | null;
  pendingCount?: number;
  approvedCount?: number;
  hasMatchResult?: boolean;
  registrationStart?: string;
  registrationEnd?: string;
  activityStart?: string;
  activityEnd?: string;
  coverImage?: string | null;
  capacity?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityListResponse {
  success: boolean;
  data?: {
    activities: Activity[];
    total: number;
  };
  message?: string;
}

export interface ActivityDetailResponse {
  success: boolean;
  event?: Activity;
  registration_stats?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
  message?: string;
}

export interface CreateActivityRequest {
  title: string;
  description: string;
  expectation?: string;
  cover_image?: string;
  registration_deadline: string;
  start_time: string;
  end_time: string;
  location: string;
  max_participants?: number;
  fee?: number;
  tags?: string[];
  checkin_password?: string;
}

export interface ActivityQueryParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  status?: ActivityStatus;
}

// ============================================
// 公共接口
// ============================================

/**
 * 获取活动列表
 * GET /api/events/organizer/my
 */
export async function getActivities(
  params?: ActivityQueryParams
): Promise<ActivityListResponse> {
  return api.get("/api/events/organizer/my", { params });
}

/**
 * 获取公开活动列表 (getActivities 的别名，兼容旧代码)
 */
export const getPublicActivities = getActivities;

/**
 * 获取活动详情
 * GET /api/events/organizer/{id}
 */
export async function getActivityDetail(
  id: string
): Promise<ActivityDetailResponse> {
  return api.get(`/api/events/organizer/${id}`);
}

// ============================================
// 商家接口 (B端专属)
// ============================================

/**
 * 获取我的活动列表 (商家)
 * GET /api/events/organizer/my
 */
export async function getMyActivities(
  params?: ActivityQueryParams
): Promise<ActivityListResponse> {
  return api.get("/api/events/organizer/my", { params });
}

/**
 * 创建活动
 * POST /api/events/organizer/create
 */
export async function createActivity(
  data: CreateActivityRequest
): Promise<{ success: boolean; event?: Activity; message?: string }> {
  return api.post("/api/events/organizer/create", data);
}

/**
 * 更新活动
 * PUT /api/events/organizer/{id}
 */
export async function updateActivity(
  id: string,
  data: Partial<CreateActivityRequest>
): Promise<{ success: boolean; event?: Activity; message?: string }> {
  return api.put(`/api/events/organizer/${id}`, data);
}

/**
 * 删除活动 (软删除)
 * DELETE /api/events/organizer/{id}
 */
export async function deleteActivity(
  id: string
): Promise<{ success: boolean; message?: string }> {
  return api.delete(`/api/events/organizer/${id}`);
}

/**
 * 发布活动
 * POST /api/events/organizer/{id}/publish
 *
 * 注意：后端暂未实现此接口
 */
export async function publishActivity(
  id: string
): Promise<{ success: boolean; message?: string }> {
  return api.post(`/api/events/organizer/${id}/publish`);
}

/**
 * 取消活动
 * POST /api/events/organizer/{id}/cancel
 *
 * 注意：后端暂未实现此接口，可通过 DELETE 实现软删除
 */
export async function cancelActivity(
  id: string
): Promise<{ success: boolean; message?: string }> {
  return api.post(`/api/events/organizer/${id}/cancel`);
}

/**
 * 结束活动（手动）
 * POST /api/events/{id}/finish
 */
export async function finishActivity(
  id: string
): Promise<{ success: boolean; message?: string }> {
  return api.post(`/api/events/${id}/finish`);
}
