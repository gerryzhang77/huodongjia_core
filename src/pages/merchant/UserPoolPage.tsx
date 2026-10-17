/**
 * UserPoolPage - 商家用户池管理页面
 *
 * 核心功能：
 * 1. 我的用户：商家私域用户池（总库 + 分库）
 * 2. 发现用户：平台公开用户池（付费解锁 + 邀请 + 收藏）
 * 3. 多维度筛选（性别/年龄/行业/标签/活跃度）
 * 4. 搜索
 * 5. 批量打标签、批量推送活动
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Search,
  Filter,
  Tag as TagIcon,
  Send,
  Users,
  UserCheck,
  TrendingUp,
  Activity,
  X,
  Settings,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Toast } from "@/components/ui/Toast";
import { MerchantLayout } from "@/components/layout";
import {
  UserCard,
  UserPoolFilterDrawer,
  ActivitySelector,
  UserDetailDrawer,
  BatchTagModal,
  PushActivityModal,
  CustomTagManager,
  UserPoolTabs,
  QuotaIndicator,
  DiscoveryUserCard,
  DiscoveryFilterBar,
  UnlockConfirmModal,
  DiscoveryUserDetail,
  InviteActivityModal,
} from "@/features/merchant/user-pool/components";
import type { PushActivityOption } from "@/features/merchant/user-pool/components";
import type { InviteActivityOption } from "@/features/merchant/user-pool/components";
import type {
  MerchantUser,
  ActivityLevel,
  UserPoolFilterCriteria,
  CustomTag,
  UserPoolTab,
  PlatformUser,
  DiscoveryFilterCriteria,
  DiscoveryQuota,
} from "@/features/merchant/user-pool/types";
import {
  DEFAULT_USER_POOL_FILTER,
  DEFAULT_DISCOVERY_FILTER,
} from "@/features/merchant/user-pool/types";
import {
  calculateUserPoolFilterOptions,
  getActiveFilterCount,
} from "@/features/merchant/user-pool/utils";
import {
  getMerchantUserPool,
  getPlatformUsers,
  getDiscoveryQuota,
  listCustomTags,
  createCustomTag as createCustomTagApi,
  deleteCustomTag as deleteCustomTagApi,
  batchTagUsers,
  pushActivityToUsers,
  unlockDiscoveryUser,
  toggleDiscoveryFavorite as toggleDiscoveryFavoriteApi,
  inviteDiscoveryUser,
} from "@/features/merchant/user-pool/services/userPoolApi";
import { getMerchantActivities } from "@/features/merchant/activity-manage/services/activityManageApi";
import {
  getDiscoveryFilterOptions,
  applyDiscoveryFilters,
} from "@/mocks/data/platform-users";
import type { ActivityOption } from "@/features/merchant/user-pool/components/ActivitySelector";

// ========================================
// 统计卡片组件
// ========================================

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  iconColor,
  bgColor,
}) => (
  <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}
    >
      <Icon size={20} className={iconColor} />
    </div>
    <div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  </div>
);

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : String(item)))
    .filter(Boolean);
}

function normalizeGender(value: unknown): MerchantUser["gender"] | undefined {
  return value === "male" || value === "female" || value === "other"
    ? value
    : undefined;
}

function normalizeActivityLevel(value: unknown): ActivityLevel {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function normalizeActivityList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];

  const item = raw as Record<string, unknown>;
  const data = item.data;
  if (data && typeof data === "object") {
    const dataItem = data as Record<string, unknown>;
    if (Array.isArray(dataItem.activities)) return dataItem.activities;
  }
  if (Array.isArray(item.activities)) return item.activities;
  if (Array.isArray(item.events)) return item.events;
  return [];
}

function normalizeMerchantUser(raw: unknown): MerchantUser | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = asString(item.id);
  if (!id) return null;
  const lastParticipatedAt =
    asString(item.lastParticipatedAt) ||
    asString(item.updatedAt) ||
    asString(item.createdAt) ||
    new Date().toISOString();

  return {
    id,
    name: asString(item.name, "未知用户"),
    gender: normalizeGender(item.gender),
    age: item.age === undefined ? undefined : asNumber(item.age),
    phone: asString(item.phone) || undefined,
    email: asString(item.email) || undefined,
    avatar: asString(item.avatar) || undefined,
    city: asString(item.city) || undefined,
    occupation: asString(item.occupation) || undefined,
    industry: asString(item.industry) || undefined,
    company: asString(item.company) || undefined,
    bio: asString(item.bio) || undefined,
    interests: asStringArray(item.interests),
    participatedActivityIds: asStringArray(item.participatedActivityIds),
    participatedActivityNames: asStringArray(item.participatedActivityNames),
    participationCount: asNumber(item.participationCount),
    firstParticipatedAt:
      asString(item.firstParticipatedAt) || lastParticipatedAt,
    lastParticipatedAt,
    memberSince: asString(item.memberSince) || undefined,
    autoTags: asStringArray(item.autoTags),
    customTags: asStringArray(item.customTags),
    activityLevel: normalizeActivityLevel(item.activityLevel),
  };
}

function normalizePlatformUser(raw: unknown): PlatformUser | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = asString(item.id);
  if (!id) return null;
  const age = item.age === undefined ? undefined : asNumber(item.age);

  return {
    id,
    nickname: asString(item.nickname) || asString(item.name, "用户"),
    avatar: asString(item.avatar) || undefined,
    city: asString(item.city) || undefined,
    industry: asString(item.industry) || undefined,
    occupation: asString(item.occupation) || undefined,
    ageGroup:
      asString(item.ageGroup) ||
      (age ? `${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4}` : undefined),
    gender: normalizeGender(item.gender),
    interests: asStringArray(item.interests || item.tags),
    activityPreferences: asStringArray(item.activityPreferences),
    participationCount: asNumber(item.participationCount),
    lastActiveAt:
      asString(item.lastActiveAt) ||
      asString(item.updatedAt) ||
      asString(item.createdAt) ||
      new Date().toISOString(),
    matchScore: Math.max(0, Math.min(100, asNumber(item.matchScore, 60))),
    isUnlocked: item.isUnlocked === true,
    isFavorited: item.isFavorited === true,
    name: asString(item.name) || undefined,
    phone: asString(item.phone) || undefined,
    email: asString(item.email) || undefined,
    company: asString(item.company) || undefined,
    bio: asString(item.bio) || undefined,
    age,
    skills: asStringArray(item.skills),
  };
}

// ========================================
// 主页面组件
// ========================================

const UserPoolPage: React.FC = () => {
  // ========================================
  // 顶层 Tab 状态
  // ========================================
  const [activeTab, setActiveTab] = useState<UserPoolTab>("my-users");

  // ========================================
  // 「我的用户」状态
  // ========================================
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterCriteria, setFilterCriteria] = useState<UserPoolFilterCriteria>({
    ...DEFAULT_USER_POOL_FILTER,
  });
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(searchKeyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);
  const poolScope = JSON.stringify([selectedActivityId, debouncedKeyword, filterCriteria]);
  const [pageState, setPageState] = useState({ scope: "", page: 1 });
  const poolPage = pageState.scope === poolScope ? pageState.page : 1;
  const setPoolPage = (page: number) => setPageState({ scope: poolScope, page });
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(),
  );
  const [detailUser, setDetailUser] = useState<MerchantUser | null>(null);
  const [batchTagVisible, setBatchTagVisible] = useState(false);
  const [pushActivityVisible, setPushActivityVisible] = useState(false);
  const [tagManagerVisible, setTagManagerVisible] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // sortMode 持久化到 URL，便于浏览器返回时保留视图
  const [searchParams, setSearchParams] = useSearchParams();
  const sortMode: "default" | "byActivity" =
    searchParams.get("sort") === "byActivity" ? "byActivity" : "default";
  const setSortMode = useCallback(
    (mode: "default" | "byActivity") => {
      const next = new URLSearchParams(searchParams);
      if (mode === "byActivity") next.set("sort", "byActivity");
      else next.delete("sort");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // ========================================
  // API 数据加载（React Query 统一缓存）
  // ========================================
  const USER_POOL_KEY = ["merchant", "user-pool"] as const;
  const CUSTOM_TAGS_KEY = ["merchant", "user-pool", "custom-tags"] as const;
  const ACTIVITIES_KEY = ["merchant", "activities"] as const;
  const PLATFORM_USERS_KEY = ["merchant", "platform-users"] as const;
  const DISCOVERY_QUOTA_KEY = ["merchant", "discovery-quota"] as const;

  // 1) 商家私域用户池 - 列表常变；60s stale 平衡新鲜度和重复拉取
  const {
    data: poolData,
    isLoading: merchantUsersLoading,
    isPlaceholderData: poolPageChanging,
    isError: merchantUsersError,
    refetch: refetchMerchantUsers,
  } = useQuery({
    queryKey: [...USER_POOL_KEY, poolScope, poolPage],
    queryFn: async () => {
      const res = await getMerchantUserPool(poolPage, 50, { keyword: debouncedKeyword, activityId: selectedActivityId || undefined, filters: filterCriteria });
      if (!res.success) throw new Error(res.message || "获取用户库失败");
      return res.data;
    },
    select: (data) => ({ ...data, users: data.users.map(normalizeMerchantUser).filter(Boolean) as MerchantUser[] }),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  const merchantUsers = useMemo(() => poolData?.users || [], [poolData?.users]);
  const poolTotal = poolData?.total || 0;
  const filteredTotal = poolData?.filteredTotal || 0;
  const poolPages = Math.max(1, Math.ceil(filteredTotal / 50));
  useEffect(() => { setSelectedUserIds(new Set()); }, [poolScope, poolPage]);
  useEffect(() => {
    if (poolData && !poolPageChanging && poolPage > poolPages) setPageState({ scope: poolScope, page: poolPages });
  }, [poolData, poolPageChanging, poolPage, poolPages, poolScope]);

  // 2) 商家自定义标签 - 几乎不变；5min stale
  const {
    data: customTags = [],
    isLoading: customTagsLoading,
    isError: customTagsError,
    refetch: refetchCustomTags,
  } = useQuery<CustomTag[]>({
    queryKey: CUSTOM_TAGS_KEY,
    queryFn: async () => {
      const res = await listCustomTags();
      if (!res.success) return [];
      return (res.data?.tags || []).map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        userCount: t.userCount,
        createdAt: t.createdAt,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  // 3) 商家自己的活动列表 - 5min stale；分组排序需要它做活动名兜底
  const {
    data: activities = [],
    isLoading: activitiesLoading,
    isError: activitiesError,
    refetch: refetchActivities,
  } = useQuery({
    queryKey: ACTIVITIES_KEY,
    queryFn: async () => {
      const activities: any[] = [];
      for (let page = 1; ; page += 1) {
        const response = await getMerchantActivities({ page, pageSize: 100 });
        const batch = normalizeActivityList(response);
        activities.push(...batch);
        if (batch.length < 100) return activities;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // ========================================
  // 「发现用户」状态
  // ========================================
  const [discoveryFilter, setDiscoveryFilter] =
    useState<DiscoveryFilterCriteria>({ ...DEFAULT_DISCOVERY_FILTER });
  const [discoveryDetailUser, setDiscoveryDetailUser] =
    useState<PlatformUser | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<PlatformUser | null>(null);
  const [inviteTarget, setInviteTarget] = useState<PlatformUser | null>(null);

  // 4) 平台公域用户库 - 仅在切到「发现用户」时拉取，省一次首屏请求
  const {
    data: platformUsers = [],
    isLoading: platformUsersLoading,
    isError: platformUsersError,
    refetch: refetchPlatformUsers,
  } = useQuery<PlatformUser[]>({
    queryKey: PLATFORM_USERS_KEY,
    queryFn: async () => {
      const res = await getPlatformUsers();
      return res.success ? (res.data?.users ?? []) : [];
    },
    select: (data) =>
      (data as unknown[])
        .map(normalizePlatformUser)
        .filter(Boolean) as PlatformUser[],
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === "discover",
  });

  // 5) 发现额度 - 同样仅在「发现用户」 tab 时拉取
  const DEFAULT_QUOTA: DiscoveryQuota = {
    usedUnlocks: 0,
    freeUnlockLimit: 10,
    usedViews: 0,
    freeViewLimit: 100,
    planName: "免费版",
    planExpiresAt: null,
  };
  const { data: discoveryQuota = DEFAULT_QUOTA } = useQuery<DiscoveryQuota>({
    queryKey: DISCOVERY_QUOTA_KEY,
    queryFn: async () => {
      const res = await getDiscoveryQuota();
      return res.success ? res.data : DEFAULT_QUOTA;
    },
    staleTime: 60 * 1000,
    enabled: activeTab === "discover",
  });

  const myUsersLoading =
    merchantUsersLoading || poolPageChanging || customTagsLoading || activitiesLoading;
  const myUsersError =
    merchantUsersError || customTagsError || activitiesError;

  // ---- 缓存级写入辅助：替代原本的 setXxx 乐观更新 ----
  const patchPlatformUsers = useCallback(
    (mutator: (prev: PlatformUser[]) => PlatformUser[]) => {
      queryClient.setQueryData<PlatformUser[]>(PLATFORM_USERS_KEY, (old) =>
        mutator(old ?? []),
      );
    },
    [queryClient],
  );
  const patchDiscoveryQuota = useCallback(
    (mutator: (prev: DiscoveryQuota) => DiscoveryQuota) => {
      queryClient.setQueryData<DiscoveryQuota>(DISCOVERY_QUOTA_KEY, (old) =>
        mutator(old ?? DEFAULT_QUOTA),
      );
    },
    [queryClient],
  );
  const patchCustomTags = useCallback(
    (mutator: (prev: CustomTag[]) => CustomTag[]) => {
      queryClient.setQueryData<CustomTag[]>(CUSTOM_TAGS_KEY, (old) =>
        mutator(old ?? []),
      );
    },
    [queryClient],
  );
  const invalidateUserPool = useCallback(
    () => queryClient.invalidateQueries({ queryKey: USER_POOL_KEY }),
    [queryClient],
  );
  const invalidateCustomTags = useCallback(
    () => queryClient.invalidateQueries({ queryKey: CUSTOM_TAGS_KEY }),
    [queryClient],
  );

  // ---- 数据 ----

  // Search and filtering happen over the entire organizer pool before pagination.
  const filteredUsers = merchantUsers;

  // 按活动分组（仅 sortMode === "byActivity"）
  // groupBgPalette：柔和、低饱和度，仅做视觉分隔，不抢戏
  const groupBgPalette = useMemo(
    () => [
      "bg-blue-50/40",
      "bg-amber-50/40",
      "bg-rose-50/40",
      "bg-emerald-50/40",
      "bg-violet-50/40",
      "bg-cyan-50/40",
    ],
    [],
  );

  // 活动 ID -> 活动名 查找表（fallback 用，确保不会出现 UUID）
  const activityNameById = useMemo(() => {
    const map = new Map<string, string>();
    activities.forEach((a: any) => {
      if (a?.id && a?.title) map.set(a.id, a.title);
    });
    return map;
  }, [activities]);

  const resolveActivityName = useCallback(
    (
      id: string,
      fallbackList?: string[],
      fallbackIndex = 0,
    ): string => {
      if (id === "__other__") return "其他";
      const fromList = fallbackList?.[fallbackIndex];
      if (fromList && fromList.trim()) return fromList;
      return activityNameById.get(id) || "未命名活动";
    },
    [activityNameById],
  );

  const groupedUsers = useMemo(() => {
    if (sortMode !== "byActivity") return null;
    // 按主参与活动（participatedActivityIds[0]）分组；无活动归入"其他"
    const groupsMap = new Map<
      string,
      { id: string; name: string; users: MerchantUser[] }
    >();
    filteredUsers.forEach((u) => {
      const aid = u.participatedActivityIds?.[0] || "__other__";
      const aname = resolveActivityName(aid, u.participatedActivityNames, 0);
      if (!groupsMap.has(aid)) {
        groupsMap.set(aid, { id: aid, name: aname, users: [] });
      }
      groupsMap.get(aid)!.users.push(u);
    });
    // 按用户数降序，便于核心活动靠前
    return Array.from(groupsMap.values()).sort(
      (a, b) => b.users.length - a.users.length,
    );
  }, [filteredUsers, sortMode, resolveActivityName]);

  const filterOptions = poolData?.filterOptions || calculateUserPoolFilterOptions([]);
  const stats = poolData?.stats || { totalUsers: 0, activeUsers: 0, newUsersThisMonth: 0, avgParticipation: "0.0" };

  // 活跃筛选数
  const activeFilterCount = useMemo(
    () => getActiveFilterCount(filterCriteria),
    [filterCriteria],
  );

  const userCountByActivity = useMemo(() => new Map(Object.entries(poolData?.activityCounts || {})), [poolData?.activityCounts]);

  // 活动选项列表
  const activityOptions: ActivityOption[] = useMemo(
    () =>
      activities.map((a: any) => ({
        id: a.id,
        title: a.title,
        participantCount:
          userCountByActivity.get(a.id) ??
          (a.currentParticipants ?? a.current_participants ?? 0),
        status: a.status,
      })),
    [activities, userCountByActivity],
  );

  // 推送活动选项列表
  const pushActivityOptions: PushActivityOption[] = useMemo(
    () =>
      activities.map((a: any) => ({
        id: a.id,
        title: a.title,
        startTime: a.activityStart ?? a.start_time,
        location: a.location || "",
        participantCount: a.currentParticipants ?? a.current_participants ?? 0,
        maxParticipants: a.capacity ?? a.max_participants ?? 0,
        status: a.status,
      })),
    [activities],
  );

  // ---- 发现用户数据派生 ----
  const discoveryFilterOptions = useMemo(
    () => getDiscoveryFilterOptions(platformUsers),
    [platformUsers],
  );

  const filteredPlatformUsers = useMemo(
    () => applyDiscoveryFilters(platformUsers, discoveryFilter),
    [platformUsers, discoveryFilter],
  );

  // 推送/邀请活动选项（复用）
  const inviteActivityOptions: InviteActivityOption[] = useMemo(
    () =>
      activities.map((a: any) => ({
        id: a.id,
        title: a.title,
        startTime: a.activityStart ?? a.start_time,
        location: a.location || "",
        participantCount: a.currentParticipants ?? a.current_participants ?? 0,
        maxParticipants: a.capacity ?? a.max_participants ?? 0,
        status: a.status,
      })),
    [activities],
  );

  // ---- 操作 ----

  const handleSelectUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedUserIds.size === filteredUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
    }
  }, [filteredUsers, selectedUserIds.size]);

  const handleClearSelection = useCallback(() => {
    setSelectedUserIds(new Set());
  }, []);

  const handleBatchTag = useCallback(() => {
    if (selectedUserIds.size === 0) {
      Toast.show({ content: "请先选择用户", position: "bottom" });
      return;
    }
    setBatchTagVisible(true);
  }, [selectedUserIds.size]);

  const handleBatchPush = useCallback(() => {
    if (selectedUserIds.size === 0) {
      Toast.show({ content: "请先选择用户", position: "bottom" });
      return;
    }
    setPushActivityVisible(true);
  }, [selectedUserIds.size]);

  const handleClearFilters = useCallback(() => {
    setFilterCriteria({ ...DEFAULT_USER_POOL_FILTER });
    setSearchKeyword("");
  }, []);

  const handleActivityChange = useCallback((activityId: string | null) => {
    setSelectedActivityId(activityId);
    // 切换活动时清空选择和筛选
    setSelectedUserIds(new Set());
    setFilterCriteria({ ...DEFAULT_USER_POOL_FILTER });
    setSearchKeyword("");
  }, []);

  // 批量打标签确认
  const handleBatchTagConfirm = useCallback(
    async (tagNames: string[]) => {
      const userIds = Array.from(selectedUserIds);
      // tagNames → tagIds
      const nameToId = new Map(customTags.map((t) => [t.name, t.id]));
      const tagIds = tagNames.map((n) => nameToId.get(n)).filter(Boolean) as string[];

      if (userIds.length === 0 || tagIds.length === 0) {
        Toast.show({ content: "请选择用户和标签", position: "bottom" });
        return;
      }

      try {
        const res = await batchTagUsers(userIds, tagIds);
        if (!res.success) {
          Toast.show({ icon: "fail", content: res.message || "打标签失败", position: "bottom" });
          return;
        }
        Toast.show({
          icon: "success",
          content: `已为 ${userIds.length} 位用户添加 ${tagIds.length} 个标签`,
          position: "bottom",
        });
        setBatchTagVisible(false);
        setSelectedUserIds(new Set());
        invalidateUserPool();
        invalidateCustomTags();
      } catch (err: any) {
        Toast.show({ icon: "fail", content: err?.message || "请求失败", position: "bottom" });
      }
    },
    [selectedUserIds, customTags, invalidateUserPool, invalidateCustomTags],
  );

  // 推送活动确认
  const handlePushConfirm = useCallback(
    async (params: { activityId: string; message: string; channels: string[] }) => {
      const userIds = Array.from(selectedUserIds);
      if (userIds.length === 0) return;
      try {
        const channels = (params.channels || []).filter((c) => c === "notification") as Array<"notification">;
        const res = await pushActivityToUsers(
          userIds,
          params.activityId,
          params.message,
          channels.length > 0 ? channels : ["notification"],
        );
        if (!res.success) {
          Toast.show({ icon: "fail", content: res.message || "推送失败", position: "bottom" });
          return;
        }
        const pushed = res.data?.pushedCount ?? userIds.length;
        const skipped = res.data?.skippedCount ?? 0;
        Toast.show({
          icon: "success",
          content: skipped > 0
            ? `已向 ${pushed} 位用户推送（${skipped} 位非私域，跳过）`
            : `已向 ${pushed} 位用户推送活动邀请`,
          position: "bottom",
        });
        setPushActivityVisible(false);
        setSelectedUserIds(new Set());
      } catch (err: any) {
        Toast.show({ icon: "fail", content: err?.message || "请求失败", position: "bottom" });
      }
    },
    [selectedUserIds],
  );

  // 创建自定义标签
  const handleCreateTag = useCallback(
    async (name: string, color: string) => {
      try {
        const res = await createCustomTagApi(name, color);
        if (!res.success) {
          Toast.show({ icon: "fail", content: "创建失败", position: "bottom" });
          return;
        }
        const t = res.data?.tag;
        if (t) {
          patchCustomTags((prev) => [
            ...prev,
            { id: t.id, name: t.name, color: t.color, userCount: t.userCount, createdAt: t.createdAt },
          ]);
          Toast.show({ icon: "success", content: "标签已创建", position: "bottom" });
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || "请求失败";
        Toast.show({ icon: "fail", content: msg, position: "bottom" });
      }
    },
    [patchCustomTags],
  );

  // 删除自定义标签
  const handleDeleteTag = useCallback(
    async (tagId: string) => {
      const prev = customTags;
      // 乐观删除
      patchCustomTags((arr) => arr.filter((t) => t.id !== tagId));
      try {
        const res = await deleteCustomTagApi(tagId);
        if (!res.success) {
          patchCustomTags(() => prev);
          Toast.show({ icon: "fail", content: "删除失败", position: "bottom" });
          return;
        }
        invalidateUserPool();
      } catch {
        patchCustomTags(() => prev);
        Toast.show({ icon: "fail", content: "请求失败", position: "bottom" });
      }
    },
    [customTags, patchCustomTags, invalidateUserPool],
  );

  // ========================================
  // 发现用户操作
  // ========================================

  // 解锁用户：先调 API 扣额度，再乐观更新 UI
  const handleUnlockConfirm = useCallback(
    async (userId: string) => {
      try {
        const res = await unlockDiscoveryUser(userId);
        if (!res.success) {
          Toast.show({ icon: "fail", content: res.message || "解锁失败", position: "bottom" });
          return;
        }
        patchPlatformUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isUnlocked: true } : u)),
        );
        if (!res.data?.alreadyUnlocked) {
          patchDiscoveryQuota((prev) => ({
            ...prev,
            usedUnlocks: prev.usedUnlocks + 1,
          }));
        }
        if (discoveryDetailUser?.id === userId) {
          setDiscoveryDetailUser((prev) =>
            prev ? { ...prev, isUnlocked: true } : null,
          );
        }
        Toast.show({
          icon: "success",
          content: res.data?.alreadyUnlocked ? "你已解锁过此用户" : "解锁成功",
          position: "bottom",
        });
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || "解锁失败";
        Toast.show({ icon: "fail", content: msg, position: "bottom" });
      } finally {
        setUnlockTarget(null);
      }
    },
    [discoveryDetailUser, patchPlatformUsers, patchDiscoveryQuota],
  );

  // 收藏/取消收藏：乐观更新，失败回滚
  const handleToggleFavorite = useCallback(
    async (userId: string) => {
      const prevList = platformUsers;
      const prevDetail = discoveryDetailUser;
      patchPlatformUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, isFavorited: !u.isFavorited } : u,
        ),
      );
      if (discoveryDetailUser?.id === userId) {
        setDiscoveryDetailUser((p) =>
          p ? { ...p, isFavorited: !p.isFavorited } : null,
        );
      }
      try {
        const res = await toggleDiscoveryFavoriteApi(userId);
        if (!res.success) throw new Error("失败");
      } catch {
        // 回滚
        patchPlatformUsers(() => prevList);
        setDiscoveryDetailUser(prevDetail);
        Toast.show({ icon: "fail", content: "操作失败", position: "bottom" });
      }
    },
    [platformUsers, discoveryDetailUser, patchPlatformUsers],
  );

  // 邀请用户参加活动
  const handleInviteConfirm = useCallback(
    async (params: { userId: string; activityId: string; message: string }) => {
      try {
        const res = await inviteDiscoveryUser(params.userId, params.activityId, params.message);
        if (!res.success) {
          Toast.show({ icon: "fail", content: res.message || "邀请失败", position: "bottom" });
          return;
        }
        Toast.show({ icon: "success", content: "邀请已发送", position: "bottom" });
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || "邀请失败";
        Toast.show({ icon: "fail", content: msg, position: "bottom" });
      } finally {
        setInviteTarget(null);
      }
    },
    [],
  );

  // 从详情弹窗触发解锁
  const handleDetailUnlock = useCallback(
    (userId: string) => {
      const user = platformUsers.find((u) => u.id === userId) || null;
      setUnlockTarget(user);
    },
    [platformUsers],
  );

  // 从详情弹窗触发邀请
  const handleDetailInvite = useCallback(
    (userId: string) => {
      const user = platformUsers.find((u) => u.id === userId) || null;
      setInviteTarget(user);
    },
    [platformUsers],
  );

  // 是否全选
  const isAllSelected =
    filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length;

  return (
    <MerchantLayout title="用户管理" showBack={false}>
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* Tab 切换：我的用户 / 发现用户 */}
        <UserPoolTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          myUserCount={poolTotal}
          platformUserCount={platformUsers.length}
        />

        {activeTab === "my-users" && (
          <p className="text-xs text-gray-500 px-1">
            活动结束后，审核通过的报名用户会自动加入，仅当前商家可见。
          </p>
        )}

        {/* ============================================ */}
        {/* 「我的用户」视图 */}
        {/* ============================================ */}
        {activeTab === "my-users" && myUsersError && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white rounded-xl border border-gray-100">
            <AlertCircle size={36} className="text-red-300 mb-3" />
            <p className="text-sm mb-3">用户数据加载失败</p>
            <button
              className="px-4 py-2 rounded-lg bg-primary-400 text-white text-sm font-medium"
              onClick={() => {
                refetchMerchantUsers();
                refetchCustomTags();
                refetchActivities();
              }}
            >
              重新加载
            </button>
          </div>
        )}

        {activeTab === "my-users" && myUsersLoading && !myUsersError && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white rounded-xl border border-gray-100">
            <Loader2 size={32} className="text-primary-400 animate-spin mb-3" />
            <p className="text-sm">正在加载用户数据...</p>
          </div>
        )}

        {activeTab === "my-users" && !myUsersLoading && !myUsersError && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="总用户数"
                value={stats.totalUsers}
                icon={Users}
                iconColor="text-primary-400"
                bgColor="bg-primary-50"
              />
              <StatCard
                label="再次参与用户"
                value={stats.activeUsers}
                icon={UserCheck}
                iconColor="text-green-500"
                bgColor="bg-green-50"
              />
              <StatCard
                label="本月新增"
                value={stats.newUsersThisMonth}
                icon={TrendingUp}
                iconColor="text-orange-500"
                bgColor="bg-orange-50"
              />
              <StatCard
                label="人均参与"
                value={`${stats.avgParticipation}次`}
                icon={Activity}
                iconColor="text-purple-500"
                bgColor="bg-purple-50"
              />
            </div>

            {/* 活动选择器 + 搜索 + 筛选 */}
            <div className="space-y-3">
              <ActivitySelector
                selectedActivityId={selectedActivityId}
                activities={activityOptions}
                totalUserCount={poolTotal}
                onSelect={handleActivityChange}
              />
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 rounded-xl">
                  <Search size={16} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                    placeholder="搜索姓名、行业、城市、标签..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                  />
                  {searchKeyword && (
                    <button onClick={() => setSearchKeyword("")}>
                      <X size={14} className="text-gray-400" />
                    </button>
                  )}
                </div>
                <button
          className={`flex flex-shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors [&>svg]:shrink-0 ${
                    activeFilterCount > 0
                      ? "border-primary-400 bg-primary-50 text-primary-600"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                  onClick={() => setFilterVisible(true)}
                >
                  <Filter size={16} />
                  筛选
                  {activeFilterCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary-400 px-1 text-[10px] font-bold tabular-nums text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <button
          className="flex flex-shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 [&>svg]:shrink-0"
                  onClick={() => setTagManagerVisible(true)}
                >
                  <Settings size={16} />
                  标签
                </button>
              </div>
            </div>

            {/* 操作栏：全选/批量操作 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                  onClick={handleSelectAll}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      isAllSelected
                        ? "bg-primary-400 border-primary-400"
                        : "border-gray-300"
                    }`}
                  >
                    {isAllSelected && (
                      <svg
                        width="10"
                        height="8"
                        viewBox="0 0 10 8"
                        fill="none"
                        className="text-white"
                      >
                        <path
                          d="M1 4L3.5 6.5L9 1"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  {isAllSelected ? "取消本页全选" : "全选本页"}
                </button>
                <span className="text-sm text-gray-400">
                  共 {filteredTotal} 人
                  {filteredTotal !== (poolData?.scopeTotal || 0) && (
                    <span>
                      {" "}
                      (已筛选,{" "}
                      <button
                        className="text-primary-400 hover:underline"
                        onClick={handleClearFilters}
                      >
                        清除
                      </button>
                      )
                    </span>
                  )}
                </span>
                {/* 排序模式切换 */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 ml-1">
                  <button
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      sortMode === "default"
                        ? "bg-white text-gray-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setSortMode("default")}
                  >
                    默认
                  </button>
                  <button
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      sortMode === "byActivity"
                        ? "bg-white text-gray-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                    onClick={() => setSortMode("byActivity")}
                  >
                    按活动分组
                  </button>
                </div>
              </div>
              {selectedUserIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-primary-400 font-medium">
                    已选 {selectedUserIds.size} 人
                  </span>
                  <button
              className="flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-[22px] bg-accent-50 px-3 py-1.5 text-sm font-medium text-accent-600 transition-colors hover:bg-accent-100 [&>svg]:shrink-0"
                    onClick={handleBatchTag}
                  >
                    <TagIcon size={14} />
                    打标签
                  </button>
                  <button
              className="flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-[22px] bg-gradient-to-br from-primary-400 to-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md [&>svg]:shrink-0"
                    onClick={handleBatchPush}
                  >
                    <Send size={14} />
                    推送活动
                  </button>
                  <button
                    className="text-xs text-gray-400 hover:text-gray-600 ml-1"
                    onClick={handleClearSelection}
                  >
                    取消
                  </button>
                </div>
              )}
            </div>

            {/* 用户列表 */}
            <div className="space-y-3">
              {filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Users size={48} strokeWidth={1.2} className="mb-3" />
                  <p className="text-base font-medium mb-1">暂无用户</p>
                  <p className="text-sm">
                    {searchKeyword || activeFilterCount > 0
                      ? "没有匹配的用户，试试调整筛选条件"
                      : selectedActivityId
                        ? "该活动暂无报名用户"
                        : "报名审核通过的用户会自动出现在这里"}
                  </p>
                  {(searchKeyword || activeFilterCount > 0) && (
                    <button
                      className="mt-3 px-4 py-2 text-sm text-primary-400 hover:bg-primary-50 rounded-lg transition-colors"
                      onClick={handleClearFilters}
                    >
                      清除筛选条件
                    </button>
                  )}
                </div>
              ) : sortMode === "byActivity" && groupedUsers ? (
                groupedUsers.map((group, groupIdx) => {
                  const bg = groupBgPalette[groupIdx % groupBgPalette.length];
                  const isOther = group.id === "__other__";
                  return (
                    <div key={group.id} className="space-y-2">
                      <div className="sticky top-0 z-[1] -mx-1 px-1 py-1 bg-gray-50/95 backdrop-blur-sm">
                        <button
                          type="button"
                          disabled={isOther}
                          onClick={() => {
                            if (!isOther) {
                              navigate(
                                `/dashboard/activity/${group.id}/detail`,
                              );
                            }
                          }}
                      className={`inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors [&>svg]:shrink-0 ${
                            isOther
                              ? "text-gray-500 cursor-default"
                              : "text-gray-700 hover:text-primary-600 hover:bg-primary-50"
                          }`}
                          title={isOther ? undefined : "查看活动详情"}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                          {group.name}
                          <span className="text-gray-400">
                            (本页 {group.users.length} 人)
                          </span>
                          {!isOther && (
                            <ChevronRight
                              size={12}
                              className="text-gray-400"
                            />
                          )}
                        </button>
                      </div>
                      {group.users.map((user) => (
                        <UserCard
                          key={user.id}
                          user={user}
                          selected={selectedUserIds.has(user.id)}
                          onSelect={() => handleSelectUser(user.id)}
                          onClick={() => setDetailUser(user)}
                          groupBg={bg}
                          activityNameById={activityNameById}
                          customTagDefs={customTags}
                        />
                      ))}
                    </div>
                  );
                })
              ) : (
                filteredUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    selected={selectedUserIds.has(user.id)}
                    onSelect={() => handleSelectUser(user.id)}
                    onClick={() => setDetailUser(user)}
                    activityNameById={activityNameById}
                    customTagDefs={customTags}
                  />
                ))
              )}
            </div>
            {poolPages > 1 && <div className="flex items-center justify-center gap-4 py-2 text-sm text-gray-600">
              <button type="button" disabled={poolPage <= 1} className="rounded-lg border border-gray-200 bg-white px-4 py-2 disabled:opacity-40" onClick={() => setPoolPage(poolPage - 1)}>上一页</button>
              <span>第 {poolPage} / {poolPages} 页 · 共 {filteredTotal} 人</span>
              <button type="button" disabled={poolPage >= poolPages} className="rounded-lg border border-gray-200 bg-white px-4 py-2 disabled:opacity-40" onClick={() => setPoolPage(poolPage + 1)}>下一页</button>
            </div>}
          </>
        )}

        {/* ============================================ */}
        {/* 「发现用户」视图 */}
        {/* ============================================ */}
        {activeTab === "discover" && platformUsersError && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white rounded-xl border border-gray-100">
            <AlertCircle size={36} className="text-red-300 mb-3" />
            <p className="text-sm mb-3">发现用户加载失败</p>
            <button
              className="px-4 py-2 rounded-lg bg-primary-400 text-white text-sm font-medium"
              onClick={() => refetchPlatformUsers()}
            >
              重新加载
            </button>
          </div>
        )}

        {activeTab === "discover" && platformUsersLoading && !platformUsersError && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white rounded-xl border border-gray-100">
            <Loader2 size={32} className="text-primary-400 animate-spin mb-3" />
            <p className="text-sm">正在加载发现用户...</p>
          </div>
        )}

        {activeTab === "discover" &&
          !platformUsersLoading &&
          !platformUsersError && (
          <>
            {/* 配额指示器 */}
            <QuotaIndicator quota={discoveryQuota} />

            {/* 筛选栏 */}
            <DiscoveryFilterBar
              criteria={discoveryFilter}
              options={discoveryFilterOptions}
              onChange={setDiscoveryFilter}
            />

            {/* 结果计数 */}
            <div className="text-sm text-gray-400">
              共发现 {filteredPlatformUsers.length} 位用户
            </div>

            {/* 平台用户卡片列表 */}
            <div className="space-y-3">
              {filteredPlatformUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Users size={48} strokeWidth={1.2} className="mb-3" />
                  <p className="text-base font-medium mb-1">暂无匹配用户</p>
                  <p className="text-sm">试试调整筛选条件</p>
                  <button
                    className="mt-3 px-4 py-2 text-sm text-primary-400 hover:bg-primary-50 rounded-lg transition-colors"
                    onClick={() =>
                      setDiscoveryFilter({ ...DEFAULT_DISCOVERY_FILTER })
                    }
                  >
                    重置筛选
                  </button>
                </div>
              ) : (
                filteredPlatformUsers.map((user) => (
                  <DiscoveryUserCard
                    key={user.id}
                    user={user}
                    onViewDetail={() => setDiscoveryDetailUser(user)}
                    onUnlock={() => setUnlockTarget(user)}
                    onInvite={() => setInviteTarget(user)}
                    onToggleFavorite={() => handleToggleFavorite(user.id)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ============================================ */}
      {/* 「我的用户」弹窗/抽屉 */}
      {/* ============================================ */}

      {/* 筛选面板 */}
      <UserPoolFilterDrawer
        visible={filterVisible}
        filterOptions={filterOptions}
        filterCriteria={filterCriteria}
        onChange={setFilterCriteria}
        onClose={() => setFilterVisible(false)}
      />

      {/* 用户详情抽屉 */}
      <UserDetailDrawer
        visible={detailUser !== null}
        user={detailUser}
        onClose={() => setDetailUser(null)}
        onTagUser={(userId) => {
          setDetailUser(null);
          setSelectedUserIds(new Set([userId]));
          setTimeout(() => setBatchTagVisible(true), 300);
        }}
        onPushActivity={(userId) => {
          setDetailUser(null);
          setSelectedUserIds(new Set([userId]));
          setTimeout(() => setPushActivityVisible(true), 300);
        }}
        onViewProfile={(userId) => {
          setDetailUser(null);
          navigate(`/u/profile/${userId}`);
        }}
        customTagDefs={customTags}
      />

      {/* 批量打标签弹窗 */}
      <BatchTagModal
        visible={batchTagVisible}
        selectedCount={selectedUserIds.size}
        existingTags={customTags}
        onConfirm={handleBatchTagConfirm}
        onClose={() => setBatchTagVisible(false)}
      />

      {/* 推送活动弹窗 */}
      <PushActivityModal
        visible={pushActivityVisible}
        selectedCount={selectedUserIds.size}
        activities={pushActivityOptions}
        onConfirm={handlePushConfirm}
        onClose={() => setPushActivityVisible(false)}
      />

      {/* 标签管理 */}
      <CustomTagManager
        visible={tagManagerVisible}
        tags={customTags}
        onCreate={handleCreateTag}
        onDelete={handleDeleteTag}
        onClose={() => setTagManagerVisible(false)}
      />

      {/* ============================================ */}
      {/* 「发现用户」弹窗/抽屉 */}
      {/* ============================================ */}

      {/* 平台用户详情 */}
      <DiscoveryUserDetail
        visible={discoveryDetailUser !== null}
        user={discoveryDetailUser}
        onClose={() => setDiscoveryDetailUser(null)}
        onUnlock={handleDetailUnlock}
        onInvite={handleDetailInvite}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* 解锁确认弹窗 */}
      <UnlockConfirmModal
        visible={unlockTarget !== null}
        user={unlockTarget}
        quota={discoveryQuota}
        onConfirm={handleUnlockConfirm}
        onClose={() => setUnlockTarget(null)}
      />

      {/* 邀请参加活动弹窗 */}
      <InviteActivityModal
        visible={inviteTarget !== null}
        user={inviteTarget}
        activities={inviteActivityOptions}
        onConfirm={handleInviteConfirm}
        onClose={() => setInviteTarget(null)}
      />
    </MerchantLayout>
  );
};

export default UserPoolPage;
