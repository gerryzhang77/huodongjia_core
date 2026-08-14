/**
 * User API - 用户接口
 * 底层 API 调用，与后端接口 1:1 对应
 * C端用户个人中心相关接口
 */

import { api } from "@/services/api";
import type { RegistrationFormField } from "@/features/activities/types";

// ============================================
// 类型定义
// ============================================

export interface UserProfile {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  wechat?: string;
  avatar?: string;
  gender?: "male" | "female" | "other";
  age?: number;
  city?: string;
  occupation?: string;
  company?: string;
  industry?: string;
  bio?: string;
  role?: string;
  tags?: string[];
  interestTags?: InterestTag[];
  photos?: string[];
  stats?: UserProfileStats;
  contact?: {
    phone?: string;
    email?: string;
    wechat?: string;
  };
  publicFields?: PublicProfileField[];
  nfcDisplay?: {
    participantId?: string | null;
    eventId?: string | null;
    eventTitle?: string | null;
    registrationTypeName?: string | null;
  } | null;
  privacy_settings?: ProfilePrivacySettings;
  /** 是否对外公开在"发现用户"列表（用户级开关，opt-in） */
  discoverable?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfilePrivacySettings {
  phone?: boolean;
  email?: boolean;
  wechat?: boolean;
  company?: boolean;
  city?: boolean;
  industry?: boolean;
  occupation?: boolean;
  bio?: boolean;
}

export interface PublicProfileField {
  field_key: string;
  field_label?: string | null;
  field_value: string;
  field_type?: string;
}

export interface InterestTag {
  id: string;
  name: string;
  colorType: "primary" | "secondary" | "accent" | "warning" | "default";
}

export interface UserProfileStats {
  activitiesJoined: number;
  matchedFriends: number;
  favoritedActivities: number;
}

export interface UpdateProfileRequest {
  name?: string;
  avatar?: string;
  gender?: "male" | "female" | "other";
  age?: number;
  city?: string;
  occupation?: string;
  company?: string;
  industry?: string;
  bio?: string;
  role?: string;
  tags?: string[];
  interestTags?: InterestTag[];
  photos?: string[];
  email?: string;
  phone?: string;
  wechat?: string;
  privacy_settings?: ProfilePrivacySettings;
}

export interface Notification {
  id: string;
  title: string;
  content: string;
  type:
    | "system"
    | "activity"
    | "enrollment"
    | "matching"
    | "approval"
    | "greeting"
    | "activity_change"
    | "waitlist"
    | "match"
    | "reminder"
    | "message"
    | "follow"
    | "contact_request"
    | "enrollment_update";
  isRead: boolean;
  createdAt: string;
  activityId?: string;
  activityName?: string;
  /** 发送者 id（如私信、关注等社交通知） */
  senderId?: string;
  /** 发送者基本信息 */
  sender?: {
    id: string;
    name?: string | null;
    avatar?: string | null;
  } | null;
  data?: Record<string, unknown>;
}

export interface NotificationListResponse {
  success: boolean;
  data?: {
    notifications: Notification[];
    total?: number;
    unreadCount?: number;
  };
}

export interface UserStats {
  totalEnrollments: number;
  completedActivities: number;
  favoriteCount: number;
  matchingCount: number;
}

// C端活动相关类型
export type UserActivityStatus =
  | "recruiting"
  | "pending"
  | "approved"
  | "rejected" // 用户端展示为“审核结束”
  | "waitlist"
  | "cancelled"
  | "completed";

export interface ActivityCapacitySummary {
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
}

export interface UserActivity {
  id: string;
  title: string;
  description?: string;
  coverImage: string;
  images?: string[]; // 活动图片数组（支持多图轮播）
  eventStartTime: string;
  eventEndTime: string;
  activityStart?: string;
  activityEnd?: string;
  registrationStart?: string;
  registrationEnd?: string;
  location: string;
  maxParticipants: number;
  currentParticipants: number;
  capacitySummary?: ActivityCapacitySummary | null;
  tags: string[];
  category?: string;
  requirements?: string;
  contactInfo?: string;
  userStatus: UserActivityStatus;
  activityStatus: "recruiting" | "ongoing" | "completed";
  isFavorite?: boolean;
  organizer: {
    id: string;
    name: string;
    avatar: string;
  };
  registrationFormSchema?: RegistrationFormField[] | null;
  registrationType?: {
    id?: string;
    name: string;
    matchEnabled: boolean;
    isDefault: boolean;
    eligibilityMode?: "public" | "allowlist";
    accessAllowed?: boolean;
    accessDeniedReason?: string;
  } | null;
  enrollment?: {
    id: string;
    status: UserActivityStatus;
    updateRequired: boolean;
    updateFieldKeys: string[];
    updateFieldLabels: string[];
    updateNote?: string | null;
    hasUnreviewedChanges: boolean;
    lastParticipantUpdateAt?: string | null;
  } | null;
}

export interface UserActivityListResponse {
  success: boolean;
  data?: {
    activities: UserActivity[];
    total: number;
    page?: number;
    pageSize?: number;
  };
}

export interface ActivityCategory {
  id: string;
  name: string;
  count: number;
}

// ============================================
// API 函数 - 用户资料
// ============================================

/**
 * 获取用户资料
 * GET /api/user/profile
 */
export async function getUserProfile(): Promise<{
  success: boolean;
  profile?: UserProfile;
}> {
  return api.get("/api/user/profile");
}

/**
 * 获取他人公开资料
 * GET /api/user/profile/:userId
 */
export async function getPublicProfile(userId: string): Promise<{
  success: boolean;
  profile?: UserProfile;
}> {
  return api.get(`/api/user/profile/${userId}`);
}

/**
 * 更新用户资料
 * PUT /api/user/profile
 */
export async function updateUserProfile(data: UpdateProfileRequest): Promise<{
  success: boolean;
  profile?: UserProfile;
}> {
  return api.put("/api/user/profile", data);
}

/**
 * 上传头像
 * POST /api/user/profile/avatar
 */
export async function uploadAvatar(file: File): Promise<{
  success: boolean;
  avatarUrl?: string;
  url?: string;
  data?: {
    url?: string;
    avatarUrl?: string;
  };
  message?: string;
}> {
  const formData = new FormData();
  formData.append("avatar", file);

  return api.post("/api/user/profile/avatar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
  });
}

/**
 * 上传照片墙图片
 * POST /api/file/upload
 */
export async function uploadPhoto(file: File): Promise<{
  success: boolean;
  url?: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("destination", "user-photos");
  const res = await api.post<{ success: boolean; url?: string }>(
    "/api/file/upload",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60_000,
    }
  );
  return { success: res.success, url: res.url };
}

/**
 * 获取用户统计数据
 * GET /api/user/stats
 */
export async function getUserStats(): Promise<{
  success: boolean;
  stats?: UserStats;
}> {
  return api.get("/api/user/stats");
}

// ============================================
// API 函数 - 用户活动
// ============================================

/**
 * 获取用户活动列表（我的活动）
 * GET /api/user/activities
 */
export async function getUserActivities(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<UserActivityListResponse> {
  return api.get("/api/user/activities", { params });
}

/**
 * 获取推荐活动
 * GET /api/user/activities/recommended
 */
export async function getRecommendedActivities(): Promise<UserActivityListResponse> {
  return api.get("/api/user/activities/recommended");
}

/**
 * 获取游客首页公开活动摘要
 * GET /api/public/activities
 */
export async function getPublicActivityList(params?: {
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<UserActivityListResponse> {
  return api.get("/api/public/activities", { params });
}

/**
 * 搜索活动
 * GET /api/user/activities/search
 */
export async function searchActivities(params?: {
  keyword?: string;
  category?: string;
  city?: string;
  page?: number;
  pageSize?: number;
}): Promise<UserActivityListResponse> {
  return api.get("/api/user/activities/search", { params });
}

/**
 * 获取活动分类
 * GET /api/user/activities/categories
 */
export async function getActivityCategories(): Promise<{
  success: boolean;
  data?: {
    categories: ActivityCategory[];
  };
}> {
  return api.get("/api/user/activities/categories");
}

/**
 * 获取活动详情
 * GET /api/user/activities/:id
 */
export async function getUserActivityDetail(id: string, registrationTypeId?: string): Promise<{
  success: boolean;
  data?: UserActivity;
}> {
  return api.get(`/api/user/activities/${id}`, {
    params: registrationTypeId ? { registrationTypeId } : undefined,
  });
}

/**
 * 获取公开活动详情
 * GET /api/public/activities/:id
 */
export async function getPublicActivityDetail(id: string, registrationTypeId?: string): Promise<{
  success: boolean;
  data?: UserActivity;
}> {
  return api.get(`/api/public/activities/${id}`, {
    params: registrationTypeId ? { registrationTypeId } : undefined,
  });
}

// ============================================
// API 函数 - 收藏
// ============================================

/**
 * 获取收藏列表
 * GET /api/user/favorites
 */
export async function getFavorites(): Promise<UserActivityListResponse> {
  return api.get("/api/user/favorites");
}

/**
 * 添加收藏
 * POST /api/user/favorites/:id
 */
export async function addFavorite(activityId: string): Promise<{
  success: boolean;
  isFavorite?: boolean;
}> {
  return api.post(`/api/user/favorites/${activityId}`);
}

/**
 * 取消收藏
 * DELETE /api/user/favorites/:id
 */
export async function removeFavorite(activityId: string): Promise<{
  success: boolean;
  isFavorite?: boolean;
}> {
  return api.delete(`/api/user/favorites/${activityId}`);
}

/**
 * 切换收藏状态
 * POST /api/user/favorites/:id/toggle
 */
export async function toggleFavorite(activityId: string): Promise<{
  success: boolean;
  data?: { favorited: boolean };
}> {
  return api.post(`/api/user/favorites/${activityId}/toggle`);
}

// ============================================
// API 函数 - 通知
// ============================================

/**
 * 获取通知列表
 * GET /api/user/notifications
 */
export async function getNotifications(params?: {
  page?: number;
  pageSize?: number;
  type?: string;
  isRead?: boolean;
}): Promise<NotificationListResponse> {
  return api.get("/api/user/notifications", { params });
}

/**
 * 标记通知为已读
 * POST /api/user/notifications/{id}/read
 */
export async function markNotificationRead(
  id: string,
): Promise<{ success: boolean }> {
  return api.post(`/api/user/notifications/${id}/read`);
}

/**
 * 标记所有通知为已读
 * POST /api/user/notifications/read-all
 */
export async function markAllNotificationsRead(): Promise<{
  success: boolean;
}> {
  return api.post("/api/user/notifications/read-all");
}

// ============================================
// API 函数 - 账号
// ============================================

/**
 * 删除账号
 * DELETE /api/user/account
 */
export async function deleteAccount(): Promise<{ success: boolean }> {
  return api.delete("/api/user/account");
}

/**
 * 修改密码
 * PUT /api/auth/password
 */
export async function changePassword(data: {
  oldPassword: string;
  newPassword: string;
}): Promise<{ success: boolean }> {
  return api.put("/api/auth/password", data);
}
