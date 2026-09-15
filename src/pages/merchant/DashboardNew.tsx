/**
 * Dashboard Page - 商家管理后台首页 (新版)
 * 使用新的 MerchantLayout 和设计系统
 */

import { FC, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Users,
  Plus,
  ChevronRight,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  PartyPopper,
  BarChart3,
  Settings,
  HelpCircle,
  UserSearch,
  Loader2,
} from "lucide-react";
import { Dialog } from "antd-mobile";
import { Toast } from "@/components/ui/Toast";
import { MerchantLayout } from "@/components/layout";
import {
  MerchantActivity,
  getActivityStatusText,
  getActivityStatusColor,
} from "@/mocks/data/merchant";
import { useMerchantActivities } from "@/features/merchant/activity-manage/hooks/useMerchantActivities";
import { useDeleteActivity } from "@/features/merchant/activity-manage/hooks/useDeleteActivity";
import type { Activity } from "@/services/activityApi";
import { usePrefetchMerchantActivity } from "@/hooks/usePrefetchMerchantActivity";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";

/**
 * 统计卡片组件
 */
interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: "primary" | "secondary" | "accent" | "success";
  trend?: string;
}

const StatCard: FC<StatCardProps> = ({ title, value, icon, color, trend }) => {
  const colorStyles = {
    primary: {
      bg: "bg-primary-50",
      iconBg: "bg-primary-100",
      iconColor: "text-primary-500",
      valueColor: "text-primary-600",
    },
    secondary: {
      bg: "bg-orange-50",
      iconBg: "bg-orange-100",
      iconColor: "text-secondary-500",
      valueColor: "text-secondary-600",
    },
    accent: {
      bg: "bg-purple-50",
      iconBg: "bg-purple-100",
      iconColor: "text-accent-500",
      valueColor: "text-accent-600",
    },
    success: {
      bg: "bg-green-50",
      iconBg: "bg-green-100",
      iconColor: "text-success-500",
      valueColor: "text-success-600",
    },
  };

  const styles = colorStyles[color];

  return (
    <div className={`${styles.bg} rounded-xl p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-1">{title}</p>
          <p className={`text-2xl font-bold ${styles.valueColor}`}>{value}</p>
          {trend && (
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <TrendingUp size={12} className="text-success-500" />
              {trend}
            </p>
          )}
        </div>
        <div
          className={`${styles.iconBg} w-10 h-10 rounded-xl flex items-center justify-center`}
        >
          <span className={styles.iconColor}>{icon}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * 活动卡片组件
 */
interface ActivityCardProps {
  activity: MerchantActivity;
  onView: () => void;
  onEdit: () => void;
  onEditPreload?: () => void;
  onManage: () => void;
  onMatch: () => void;
  onDelete: () => void;
  onViewPreload?: () => void;
  onManagePreload?: () => void;
  onMatchPreload?: () => void;
}

const ActivityCard: FC<ActivityCardProps> = ({
  activity,
  onView,
  onEdit,
  onEditPreload,
  onManage,
  onMatch,
  onDelete,
  onViewPreload,
  onManagePreload,
  onMatchPreload,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const statusText = getActivityStatusText(activity.status);
  const statusColor = getActivityStatusColor(activity.status);

  // 状态颜色样式映射
  const statusStyles: Record<string, string> = {
    primary: "bg-primary-100 text-primary-600",
    secondary: "bg-orange-100 text-secondary-600",
    accent: "bg-purple-100 text-accent-600",
    success: "bg-green-100 text-success-600",
    warning: "bg-yellow-100 text-warning-600",
    error: "bg-red-100 text-error-600",
    gray: "bg-gray-100 text-gray-600",
  };

  // 格式化日期（确保 UTC 解析，避免无时区后缀时被当作本地时间）
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "待定";
    const normalized = dateStr.includes('+') || dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const date = new Date(normalized);
    if (isNaN(date.getTime())) return "日期格式错误";
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${month}月${day}日 ${hours}:${minutes}`;
  };

  const displayParticipantCount = getDisplayParticipantCount(
    activity,
    activity.currentParticipants,
  );
  // 展示进度与展示人数保持一致，原始活动数据仍供统计和业务判断使用。
  const progress =
    activity.maxParticipants > 0
      ? Math.round(
          (displayParticipantCount / activity.maxParticipants) * 100,
        )
      : 0;

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
      onClick={onView}
      onPointerEnter={onViewPreload}
      onFocus={onViewPreload}
    >
      {/* 封面图 */}
      <div className="relative h-36 bg-gradient-to-br from-primary-50 to-purple-50">
        {activity.coverImage ? (
          <img
            src={activity.coverImage}
            alt={activity.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PartyPopper size={40} className="text-primary-300" />
          </div>
        )}

        {/* 状态标签 */}
        <div className="absolute top-3 left-3">
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[statusColor]}`}
          >
            {statusText}
          </span>
        </div>

        {/* 更多操作 */}
        <div className="absolute top-3 right-3">
          <button
            className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <MoreHorizontal size={16} className="text-gray-600" />
          </button>

          {/* 下拉菜单 */}
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[120px] z-20">
                <button
                  className="flex w-full flex-nowrap items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 [&>svg]:shrink-0"
                  onClick={() => {
                    onView();
                    setShowMenu(false);
                  }}
                >
                  <Eye size={14} />
                  查看详情
                </button>
                <button
                  className="flex w-full flex-nowrap items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 [&>svg]:shrink-0"
                  onMouseEnter={onEditPreload}
                  onFocus={onEditPreload}
                  onClick={() => {
                    onEditPreload?.();
                    onEdit();
                    setShowMenu(false);
                  }}
                >
                  <Edit size={14} />
                  编辑活动
                </button>
                <button
                  className="flex w-full flex-nowrap items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-error-500 hover:bg-error-50 [&>svg]:shrink-0"
                  onClick={() => {
                    onDelete();
                    setShowMenu(false);
                  }}
                >
                  <Trash2 size={14} />
                  删除活动
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 flex-col p-4">
        {/* 标题 */}
        <h3 className="text-base font-semibold text-gray-900 mb-2 line-clamp-1">
          {activity.title}
        </h3>

        {/* 信息 */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar size={14} className="text-gray-400 flex-shrink-0" />
            <span className="truncate min-w-0 flex-1">
              {formatDate(activity.eventStartTime)} - {formatDate(activity.eventEndTime)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <MapPin size={14} className="text-gray-400 flex-shrink-0" />
            <span className="truncate min-w-0 flex-1">{activity.location}</span>
          </div>
        </div>

        {/* 报名进度 */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-500">报名进度</span>
            <span className="font-medium text-gray-900">
              {displayParticipantCount}/{activity.maxParticipants}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progress >= 100
                  ? "bg-error-500"
                  : progress >= 80
                    ? "bg-warning-500"
                    : "bg-primary-400"
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="mt-auto flex gap-2">
          <button
            className="flex h-9 min-w-0 flex-1 flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-primary-50 px-2 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-100"
            onClick={(e) => {
              e.stopPropagation();
              onManage();
            }}
            onPointerEnter={onManagePreload}
            onFocus={onManagePreload}
          >
            <Users size={14} className="flex-shrink-0" />
            <span className="truncate">管理报名</span>
            {activity.pendingCount > 0 && (
              <span className="ml-0.5 flex h-5 min-w-[20px] flex-shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-error-500 px-1 text-xs tabular-nums text-white">
                {activity.pendingCount > 99 ? "99+" : activity.pendingCount}
              </span>
            )}
          </button>
          {activity.hasMatchResult ? (
            <button
              className="flex h-9 flex-shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap rounded-lg bg-accent-50 px-3 text-sm font-medium text-accent-600 transition-colors hover:bg-accent-100 [&>svg]:shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onMatch();
              }}
              onPointerEnter={onMatchPreload}
              onFocus={onMatchPreload}
            >
              <CheckCircle size={14} />
              已匹配
            </button>
          ) : activity.status === "recruiting" || activity.status === "full" ? (
            <button
              className="flex h-9 flex-shrink-0 flex-nowrap items-center gap-1 whitespace-nowrap rounded-lg bg-gray-100 px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
              onClick={(e) => {
                e.stopPropagation();
                onMatch();
              }}
              onPointerEnter={onMatchPreload}
              onFocus={onMatchPreload}
            >
              智能匹配
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const preloadActivityEdit = () => {
  void import("./ActivityEditNew");
};

// 将后端 Activity 转换为 MerchantActivity 格式
function toMerchantActivity(a: Activity): MerchantActivity {
  // 后端返回的是 camelCase 格式，需要转换
  const backendData = a;

  // 状态映射：后端 -> 前端
  let status: MerchantActivity["status"] = "draft";
  if (a.status === "published" || a.status === "active" || a.status === "registration" as string) {
    status = "recruiting";
  } else if (a.status === "full") {
    status = "full";
  } else if (a.status === "ongoing" as string || a.status === "ended" as string) {
    status = "ongoing";
  } else if (a.status === "completed" as string) {
    status = "completed";
  } else if (a.status === "cancelled") {
    status = "cancelled";
  } else if (a.status === "draft") {
    status = "draft";
  }

  return {
    id: a.id,
    title: a.title,
    status: status,
    // 后端返回 camelCase: registrationStart, registrationEnd
    registrationStartTime: backendData.registrationStart ?? a.created_at ?? "",
    registrationEndTime: backendData.registrationEnd ?? a.registration_deadline ?? "",
    // 后端返回 camelCase: activityStart, activityEnd
    eventStartTime: backendData.activityStart ?? a.start_time ?? "",
    eventEndTime: backendData.activityEnd ?? a.end_time ?? "",
    location: a.location ?? "",
    // 后端返回 camelCase: coverImage
    coverImage: backendData.coverImage ?? a.cover_image ?? null,
    // 后端返回 camelCase: capacity
    maxParticipants: backendData.capacity ?? a.max_participants ?? 0,
    // 名额进度只使用 pending + approved；累计报名仍由 enrolledCount 表示。
    currentParticipants:
      backendData.occupiedParticipants ?? backendData.currentParticipants ?? 0,
    pendingCount: backendData.pendingCount ?? 0,
    approvedCount: backendData.approvedCount ?? 0,
    hasMatchResult: backendData.hasMatchResult ?? false,
    createdAt: a.created_at ?? backendData.createdAt ?? "",
    updatedAt: a.updated_at ?? backendData.updatedAt ?? "",
  };
}

/**
 * Dashboard 页面组件
 */
export const DashboardNew: FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { prefetchDetail, prefetchEnrollment, prefetchMatching } =
    usePrefetchMerchantActivity();
  const { data, isLoading, isError, refetch } = useMerchantActivities();
  const deleteMutation = useDeleteActivity();

  const activities: MerchantActivity[] = useMemo(
    () => (data?.data?.activities ?? []).map(toMerchantActivity),
    [data]
  );

  const activitiesWithCounts = activities;

  const stats = {
    totalActivities: activitiesWithCounts.length,
    activeActivities: activitiesWithCounts.filter((a) => a.status === "recruiting" || a.status === "ongoing").length,
    totalParticipants: activitiesWithCounts.reduce((sum, a) => sum + a.currentParticipants, 0),
    pendingEnrollments: activitiesWithCounts.reduce((sum, a) => sum + a.pendingCount, 0),
  };

  // 筛选活动状态
  const statusFilter = searchParams.get("status") || "all";

  // 筛选后的活动列表
  const filteredActivities =
    statusFilter === "all"
      ? activitiesWithCounts
      : activitiesWithCounts.filter((a) => a.status === statusFilter);

  // 快捷入口配置
  const quickActions: Array<{
    icon: React.ElementType;
    label: string;
    path: string;
    color: string;
  }> = [
    {
      icon: BarChart3,
      label: "数据分析",
      path: "/dashboard/analytics",
      color: "text-primary-500",
    },
    {
      icon: UserSearch,
      label: "用户管理",
      path: "/dashboard/user-pool",
      color: "text-accent-500",
    },
    {
      icon: Settings,
      label: "活动设置",
      path: "/dashboard/settings",
      color: "text-secondary-500",
    },
    {
      icon: HelpCircle,
      label: "帮助中心",
      path: "/dashboard/help",
      color: "text-gray-500",
    },
  ];

  return (
    <MerchantLayout title="活动管理">
      {isLoading && !data ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin mb-3" />
          <p className="text-sm">正在加载活动数据...</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 bg-white rounded-xl border border-gray-100">
          <AlertCircle size={36} className="text-red-300 mb-3" />
          <p className="text-sm mb-3">活动数据加载失败</p>
          <button
            className="px-4 py-2 rounded-lg bg-primary-400 text-white text-sm font-medium"
            onClick={() => refetch()}
          >
            重新加载
          </button>
        </div>
      ) : (
      <div className="space-y-6 px-3 pt-3 pb-6 sm:px-4 lg:p-0">
        {/* 欢迎卡片 + 创建按钮 */}
        <div className="relative mb-4">
          <div className="bg-gradient-to-br from-primary-400 to-primary-500 rounded-2xl p-5 pb-12 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold mb-1">欢迎回来</h2>
                <p className="text-sm text-white/80">
                  今日有 {stats.activeActivities} 个活动正在进行
                </p>
              </div>
            </div>
          </div>

          {/* 🎯 创建按钮 - 类似抖音/快手创作入口，位于欢迎卡片底部中央 */}
          <button
            className="absolute -bottom-7 left-1/2 -translate-x-1/2 w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full shadow-lg shadow-primary-500/40 flex items-center justify-center text-white hover:scale-110 hover:shadow-xl hover:shadow-primary-600/50 active:scale-95 transition-all duration-200 group z-10 ring-4 ring-white"
            onClick={() => navigate("/dashboard/activity/create")}
            aria-label="创建新活动"
          >
            <Plus
              size={28}
              strokeWidth={2.5}
              className="group-hover:rotate-90 transition-transform duration-300"
            />
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            title="活动总数"
            value={stats.totalActivities}
            icon={<Calendar size={20} />}
            color="primary"
          />
          <StatCard
            title="进行中"
            value={stats.activeActivities}
            icon={<Clock size={20} />}
            color="accent"
          />
          <StatCard
            title="总参与人数"
            value={stats.totalParticipants}
            icon={<Users size={20} />}
            color="secondary"
          />
          <StatCard
            title="待审核报名"
            value={stats.pendingEnrollments}
            icon={<AlertCircle size={20} />}
            color="success"
          />
        </div>

        {/* 快捷入口 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">快捷入口</h3>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  className="min-w-0 flex flex-col items-center py-3 px-1 bg-white rounded-xl border border-gray-100 hover:border-primary-200 hover:bg-primary-50/50 transition-all duration-200 hover:-translate-y-0.5"
                  onClick={() => navigate(action.path)}
                >
                  <div
                    className={`w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-2 ${action.color}`}
                  >
                    <Icon size={20} />
                  </div>
                  <span className="text-xs text-gray-600 truncate max-w-full">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 活动列表 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">
              我的活动
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({filteredActivities.length})
              </span>
            </h3>
            <button
              className="flex flex-nowrap items-center gap-1 whitespace-nowrap text-sm text-primary-500 hover:text-primary-600 [&>svg]:shrink-0"
              onClick={() => navigate("/dashboard/activities")}
            >
              查看全部 <ChevronRight size={16} />
            </button>
          </div>

          {/* 状态筛选 */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
            {[
              { key: "all", label: "全部" },
              { key: "recruiting", label: "报名中" },
              { key: "full", label: "已满员" },
              { key: "ongoing", label: "进行中" },
              { key: "completed", label: "已结束" },
              { key: "draft", label: "草稿" },
            ].map((item) => (
              <button
                key={item.key}
                className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                  statusFilter === item.key
                    ? "bg-primary-400 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                onClick={() =>
                  setSearchParams(
                    item.key === "all" ? {} : { status: item.key },
                    { replace: true },
                  )
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 活动卡片列表 */}
          {filteredActivities.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
              <p className="text-gray-400 mb-4">暂无相关活动</p>
              <button
                className="bg-primary-400 hover:bg-primary-500 text-white px-4 py-2 rounded-full text-sm font-medium transition-colors"
                onClick={() => navigate("/dashboard/activity/create")}
              >
                创建活动
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredActivities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onView={() =>
                    navigate(`/dashboard/activity/${activity.id}/detail`)
                  }
                  onViewPreload={() => prefetchDetail(activity.id)}
                  onEdit={() => {
                    preloadActivityEdit();
                    navigate(`/dashboard/activity/${activity.id}/edit`);
                  }}
                  onEditPreload={preloadActivityEdit}
                  onManage={() =>
                    navigate(`/dashboard/activity/${activity.id}/enrollment`, {
                      state: { returnTo: "/dashboard" },
                    })
                  }
                  onManagePreload={() => prefetchEnrollment(activity.id)}
                  onMatch={() =>
                    navigate(`/dashboard/activity/${activity.id}/matching`, {
                      state: { returnTo: "/dashboard" },
                    })
                  }
                  onMatchPreload={() => prefetchMatching(activity.id)}
                  onDelete={() => {
                    Dialog.confirm({
                      content: `确定要删除活动「${activity.title}」吗？`,
                      confirmText: "删除",
                      cancelText: "取消",
                      onConfirm: async () => {
                        try {
                          await deleteMutation.mutateAsync(activity.id);
                          Toast.show({
                            icon: "success",
                            content: "删除成功",
                          });
                        } catch (error) {
                          Toast.show({
                            icon: "fail",
                            content: error instanceof Error ? error.message : "删除失败",
                          });
                        }
                      },
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      )}
    </MerchantLayout>
  );
};

export default DashboardNew;
