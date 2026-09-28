/**
 * B端用户管理模块 - 类型定义
 *
 * 商家私域用户池：
 * - 总库：跨活动去重聚合的用户画像
 * - 分库：按活动查看的参与用户
 * - 自定义标签系统
 * - 定向推送能力
 */

// ========================================
// 核心类型
// ========================================

/** 活跃度等级 */
export type ActivityLevel = "high" | "medium" | "low";

/** 性别 */
export type Gender = "male" | "female" | "other";

/**
 * 商家用户画像（跨活动聚合）
 *
 * 从所有参与过商家活动的报名数据中聚合而来，
 * 按 userId 去重合并，形成完整用户画像
 */
export interface MerchantUser {
  /** 用户唯一 ID（对应 enrollment 中的 userId） */
  id: string;
  /** 姓名 */
  name: string;
  /** 性别 */
  gender?: Gender;
  /** 年龄 */
  age?: number;
  /** 手机号 */
  phone?: string;
  /** 邮箱 */
  email?: string;
  /** 头像 */
  avatar?: string;
  /** 所在城市 */
  city?: string;
  /** 职业 */
  occupation?: string;
  /** 行业 */
  industry?: string;
  /** 公司 */
  company?: string;
  /** 个人简介 */
  bio?: string;
  /** 兴趣标签 */
  interests?: string[];

  // ---- 聚合数据 ----

  /** 参与过的活动 ID 列表 */
  participatedActivityIds: string[];
  /** 参与过的活动名称列表 */
  participatedActivityNames: string[];
  /** 参与活动总次数 */
  participationCount: number;
  /** 首次参与时间 */
  firstParticipatedAt: string;
  /** 最近参与时间 */
  lastParticipatedAt: string;
  /** 首次加入当前商家用户库的时间 */
  memberSince?: string;

  // ---- 标签系统 ----

  /** 自动标签（从报名信息提取：行业、兴趣等） */
  autoTags: string[];
  /** 商家自定义标签 */
  customTags: string[];

  // ---- 活跃度 ----

  /** 活跃度等级（根据参与频次和最近活跃时间计算） */
  activityLevel: ActivityLevel;
}

/**
 * 自定义标签
 */
export interface CustomTag {
  /** 标签 ID */
  id: string;
  /** 标签名称 */
  name: string;
  /** 标签颜色 (tailwind 色板 key, 如 "primary", "secondary") */
  color: string;
  /** 创建时间 */
  createdAt: string;
  /** 使用该标签的用户数 */
  userCount: number;
}

// ========================================
// 筛选相关类型
// ========================================

/**
 * 用户管理筛选条件
 */
export interface UserPoolFilterCriteria {
  /** 关键词搜索（姓名、职业、公司） */
  keyword: string;
  /** 性别（多选） */
  gender: string[];
  /** 城市（多选） */
  city: string[];
  /** 行业（多选） */
  industry: string[];
  /** 年龄段（多选） */
  ageGroup: string[];
  /** 职业（多选） */
  occupation: string[];
  /** 活跃度（多选） */
  activityLevel: ActivityLevel[];
  /** 参与次数范围 */
  participationCountMin: number;
  participationCountMax: number;
  /** 自动标签（多选） */
  autoTags: string[];
  /** 自定义标签（多选） */
  customTags: string[];
}

/** 默认筛选条件 */
export const DEFAULT_USER_POOL_FILTER: UserPoolFilterCriteria = {
  keyword: "",
  gender: [],
  city: [],
  industry: [],
  ageGroup: [],
  occupation: [],
  activityLevel: [],
  participationCountMin: 0,
  participationCountMax: 0,
  autoTags: [],
  customTags: [],
};

/**
 * 筛选选项（从数据中提取）
 */
export interface UserPoolFilterOptions {
  gender: Array<{ value: string; label: string; count: number }>;
  city: Array<{ value: string; label: string; count: number }>;
  industry: Array<{ value: string; label: string; count: number }>;
  ageGroup: Array<{ value: string; label: string; count: number }>;
  occupation: Array<{ value: string; label: string; count: number }>;
  activityLevel: Array<{
    value: ActivityLevel;
    label: string;
    count: number;
  }>;
  autoTags: Array<{ value: string; label: string; count: number }>;
  customTags: Array<{ value: string; label: string; count: number }>;
}

// ========================================
// 推送相关类型
// ========================================

/** 推送渠道 */
export type PushChannel = "in_app" | "sms" | "wechat";

/**
 * 推送活动请求
 */
export interface PushActivityRequest {
  /** 目标用户 ID 列表 */
  userIds: string[];
  /** 推送的活动 ID */
  activityId: string;
  /** 推送消息（自定义文案） */
  message?: string;
  /** 推送渠道 */
  channels: PushChannel[];
}

/**
 * 推送活动响应
 */
export interface PushActivityResponse {
  success: boolean;
  /** 成功发送数 */
  sentCount: number;
  /** 失败数 */
  failedCount: number;
}

// ========================================
// 统计类型
// ========================================

/**
 * 用户池统计概览
 */
export interface UserPoolStats {
  /** 用户总数（去重后） */
  totalUsers: number;
  /** 活跃用户数（近30天参与过活动） */
  activeUsers: number;
  /** 本月新增用户数 */
  newUsersThisMonth: number;
  /** 平均参与活动次数 */
  avgParticipation: number;
}

// ========================================
// Tab 视图类型
// ========================================

/** 用户管理页面 Tab */
export type UserPoolTab = "my-users" | "discover";

// ========================================
// 用户发现模块类型
// ========================================

/** 平台用户信息可见等级 */
export type UnlockLevel = "basic" | "advanced" | "full";

/**
 * 平台用户画像（脱敏/可解锁）
 *
 * 平台公域用户数据库中的用户信息，
 * 未解锁时仅展示脱敏信息，解锁后展示完整信息
 */
export interface PlatformUser {
  /** 用户唯一 ID */
  id: string;
  /** 昵称（始终可见） */
  nickname: string;
  /** 头像（始终可见） */
  avatar?: string;
  /** 所在城市（始终可见） */
  city?: string;
  /** 行业（始终可见） */
  industry?: string;
  /** 职业（始终可见） */
  occupation?: string;
  /** 年龄段（如 "25-30"，非具体年龄，始终可见） */
  ageGroup?: string;
  /** 性别（始终可见） */
  gender?: Gender;
  /** 兴趣标签（始终可见） */
  interests: string[];
  /** 活动偏好类型（如 "社交", "行业交流"，始终可见） */
  activityPreferences: string[];
  /** 参与活动总数（始终可见） */
  participationCount: number;
  /** 最近活跃时间（始终可见） */
  lastActiveAt: string;
  /** 与当前商家活动类型的匹配度 (0-100)（始终可见） */
  matchScore: number;

  // ---- 解锁状态 ----

  /** 是否已被当前商家解锁 */
  isUnlocked: boolean;
  /** 是否已被当前商家收藏 */
  isFavorited: boolean;

  // ---- 解锁后可见字段 ----

  /** 真实姓名（解锁后） */
  name?: string;
  /** 手机号（解锁后） */
  phone?: string;
  /** 邮箱（解锁后） */
  email?: string;
  /** 公司（解锁后） */
  company?: string;
  /** 个人简介（解锁后） */
  bio?: string;
  /** 年龄（解锁后） */
  age?: number;
  /** 技能标签（解锁后） */
  skills?: string[];
}

/**
 * 商家发现配额
 */
export interface DiscoveryQuota {
  /** 当月已使用的解锁次数 */
  usedUnlocks: number;
  /** 每月免费解锁额度 */
  freeUnlockLimit: number;
  /** 已使用的查看详情次数 */
  usedViews: number;
  /** 每月免费查看额度 */
  freeViewLimit: number;
  /** 当前套餐名称 */
  planName: string;
  /** 套餐到期时间 */
  planExpiresAt?: string;
}

/**
 * 发现用户筛选条件
 */
export interface DiscoveryFilterCriteria {
  /** 关键词搜索（昵称、行业、兴趣） */
  keyword: string;
  /** 城市（多选） */
  city: string[];
  /** 行业（多选） */
  industry: string[];
  /** 年龄段（多选） */
  ageGroup: string[];
  /** 兴趣标签（多选） */
  interests: string[];
  /** 活动偏好（多选） */
  activityPreferences: string[];
  /** 最低匹配度 */
  minMatchScore: number;
  /** 仅看已收藏 */
  favoritedOnly: boolean;
  /** 排序方式 */
  sortBy: DiscoverySortBy;
}

/** 排序方式 */
export type DiscoverySortBy =
  | "matchScore"
  | "lastActive"
  | "participationCount";

/** 排序方式标签 */
export const DISCOVERY_SORT_LABELS: Record<DiscoverySortBy, string> = {
  matchScore: "匹配度优先",
  lastActive: "最近活跃",
  participationCount: "参与最多",
};

/** 默认发现筛选条件 */
export const DEFAULT_DISCOVERY_FILTER: DiscoveryFilterCriteria = {
  keyword: "",
  city: [],
  industry: [],
  ageGroup: [],
  interests: [],
  activityPreferences: [],
  minMatchScore: 0,
  favoritedOnly: false,
  sortBy: "matchScore",
};

/**
 * 发现用户筛选选项（从数据中提取）
 */
export interface DiscoveryFilterOptions {
  city: Array<{ value: string; label: string; count: number }>;
  industry: Array<{ value: string; label: string; count: number }>;
  ageGroup: Array<{ value: string; label: string; count: number }>;
  interests: Array<{ value: string; label: string; count: number }>;
  activityPreferences: Array<{ value: string; label: string; count: number }>;
}

// ========================================
// 常量
// ========================================

/** 活跃度等级标签 */
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  high: "高活跃",
  medium: "中活跃",
  low: "低活跃",
};

/** 活跃度等级颜色 */
export const ACTIVITY_LEVEL_COLORS: Record<ActivityLevel, string> = {
  high: "text-success-600",
  medium: "text-primary-600",
  low: "text-gray-500",
};

/** 性别标签 */
export const GENDER_LABELS: Record<Gender, string> = {
  male: "男",
  female: "女",
  other: "其他",
};

/** 预设标签颜色 */
export const TAG_COLORS = [
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "error",
] as const;
