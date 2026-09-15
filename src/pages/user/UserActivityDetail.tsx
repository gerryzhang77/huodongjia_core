/**
 * 用户端活动详情页
 * 简洁现代的详情展示
 */

import { FC, useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Heart,
  Share2,
  Calendar,
  MapPin,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Phone,
} from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui";
import { Toast } from "@/components/ui/Toast";
import { ImageCarousel } from "@/components/business/ImageCarousel";
import { MerchantHoverCard } from "@/components/business/MerchantHoverCard";
import { UserLayout } from "@/components/layout/UserLayout";
import {
  useActivityDetail,
  usePublicActivityDetail,
  useUserActivities,
} from "@/features/user";
import { useToggleFavorite } from "@/features/user/activity/hooks/useFavorites";
import { api } from "@/services/api/client";
import { useQuery } from "@tanstack/react-query";
import { getEnrollmentsDetailed } from "@/features/enrollment/services/enrollmentApi";
import type { UserActivityStatus } from "@/services/userApi";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import {
  getTagLabel,
  isOnlineOnlyActivity,
} from "@/features/activities/utils/constants";
import { parseRequirements } from "@/features/activities/components/ActivityForm/RequirementListEditor";
import { getRegistrationAvailability } from "@/features/user/activity/utils/registrationAvailability";
import {
  buildLoginPathWithRedirect,
  savePendingRedirectPath,
} from "@/utils/redirect";
import { getActivityCapacityPresentation } from "@/features/user/activity/utils/activityDetailPresentation";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";
import dayjs from "dayjs";

// 状态配置
const statusConfig: Record<
  UserActivityStatus,
  {
    label: string;
    color: string;
    btnLabel: string;
    btnStyle: string;
    disabled?: boolean;
  }
> = {
  recruiting: {
    label: "报名中",
    color: "bg-success-500",
    btnLabel: "立即报名",
    btnStyle: "bg-primary-400 text-white hover:bg-primary-500",
  },
  pending: {
    label: "待审核",
    color: "bg-warning-500",
    btnLabel: "修改报名资料",
    btnStyle: "bg-primary-400 text-white hover:bg-primary-500",
  },
  rejected: {
    label: "审核结束",
    color: "bg-gray-400",
    btnLabel: "审核已结束",
    btnStyle: "bg-gray-200 text-gray-500",
    disabled: true,
  },
  waitlist: {
    label: "候补中",
    color: "bg-warning-500",
    btnLabel: "修改报名资料",
    btnStyle: "bg-primary-400 text-white hover:bg-primary-500",
  },
  cancelled: {
    label: "已取消",
    color: "bg-gray-400",
    btnLabel: "已取消报名",
    btnStyle: "bg-gray-200 text-gray-500",
    disabled: true,
  },
  approved: {
    label: "已通过",
    color: "bg-primary-400",
    btnLabel: "查看分组",
    btnStyle: "bg-success-500 text-white hover:bg-success-600",
  },
  completed: {
    label: "已结束",
    color: "bg-gray-400",
    btnLabel: "活动回顾",
    btnStyle: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    // 不再 disabled：approved 参与者可看回顾，非参与者点击会被跳走（PR5 接通）
  },
};

const normalizeUtc = (s: string) => s.includes('+') || s.endsWith('Z') ? s : s + 'Z';
const formatDate = (dateStr: string): string => dayjs(normalizeUtc(dateStr)).format("M月D日 HH:mm");

const UserActivityDetail: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);
  const showBreadcrumb = useIsDesktop();

  // 获取当前用户信息。扫码落地页允许未登录访问，登录能力按角色逐步启用。
  const { user, isAuthenticated } = useAuthStore();
  const userType = user?.user_type;
  const isParticipantUser = isAuthenticated && userType === "user";
  const isBusinessUser =
    isAuthenticated && (userType === "organizer" || userType === "admin");
  const showUserChrome = isParticipantUser;
  const registrationTypeId = useMemo(() => {
    return new URLSearchParams(location.search).get("rt") || "";
  }, [location.search]);
  const registrationTypeQuery = registrationTypeId
    ? `?rt=${encodeURIComponent(registrationTypeId)}`
    : "";
  const detailPath = id ? `/u/activities/${id}${registrationTypeQuery}` : "/u/home";
  const registrationPath = id
    ? `/u/activities/${id}/register${registrationTypeQuery}`
    : "";

  const goLoginForActivity = () => {
    savePendingRedirectPath(detailPath);
    navigate(buildLoginPathWithRedirect(detailPath));
  };

  // 收藏状态：从后端拉取，避免页面间状态不同步
  const { data: favStatus } = useQuery({
    queryKey: ["user", "favorite-status", id],
    queryFn: () =>
      api.get<{ success: boolean; data: { favorited: boolean } }>(
        `/api/user/favorites/${id}/status`,
      ),
    enabled: isParticipantUser && !!id,
    staleTime: 30 * 1000,
  });
  const isFavorited = !!favStatus?.data?.favorited;
  const toggleFav = useToggleFavorite();
  const handleToggleFavorite = async () => {
    if (!id) return;
    if (!isAuthenticated) {
      goLoginForActivity();
      return;
    }
    if (!isParticipantUser) {
      Toast.show({ content: "请使用参与者账号收藏活动" });
      return;
    }
    try {
      await toggleFav.mutateAsync(id);
    } catch (err) {
      Toast.show({
        icon: "fail",
        content: err instanceof Error ? err.message : "操作失败",
      });
    }
  };

  // 使用 hooks 获取活动详情
  const { data: publicActivityData, isLoading: publicActivityLoading } =
    usePublicActivityDetail(id, registrationTypeId);
  const { data: activityData, isLoading: userActivityLoading } =
    useActivityDetail(isParticipantUser ? id : undefined, registrationTypeId);
  const { data: activitiesData } = useUserActivities(undefined, {
    enabled: isParticipantUser,
  });

  const activity = useMemo(() => {
    return activityData?.data || publicActivityData?.data;
  }, [activityData, publicActivityData]);

  // 判断当前用户是否是活动创建者
  const isOrganizer = useMemo(() => {
    return isBusinessUser && activity?.organizer?.id === user?.id;
  }, [activity, isBusinessUser, user]);

  // 计算上一个/下一个活动
  const { prevActivity, nextActivity } = useMemo(() => {
    const activities = activitiesData?.data?.activities || [];
    if (!id || activities.length === 0) {
      return { prevActivity: undefined, nextActivity: undefined };
    }
    const currentIndex = activities.findIndex((a) => a.id === id);
    return {
      prevActivity: currentIndex > 0 ? activities[currentIndex - 1] : undefined,
      nextActivity:
        currentIndex < activities.length - 1
          ? activities[currentIndex + 1]
          : undefined,
    };
  }, [activitiesData, id]);

  // 获取真实报名人数
  useEffect(() => {
    if (!id || !isOrganizer) {
      setEnrolledCount(null);
      return;
    }
    getEnrollmentsDetailed(id, { page: 1, pageSize: 1 })
      .then((res) => setEnrolledCount(res.total))
      .catch(() => setEnrolledCount(null));
  }, [id, isOrganizer]);

  // 切换到上一个活动
  const goToPrevious = () => {
    if (prevActivity) {
      navigate(`/u/activities/${prevActivity.id}`);
    }
  };

  // 切换到下一个活动
  const goToNext = () => {
    if (nextActivity) {
      navigate(`/u/activities/${nextActivity.id}`);
    }
  };

  const hasUserActivityData = !!activityData?.data;
  const isLoading =
    publicActivityLoading ||
    (isParticipantUser && userActivityLoading && !hasUserActivityData);
  const homePath = isParticipantUser
    ? "/u/home"
    : isBusinessUser
      ? "/dashboard"
      : "/";
  const homeLabel = isBusinessUser ? "主办方工作台" : "首页";
  const handleBackToHome = () => {
    navigate(homePath, { replace: true });
  };

  // 加载中状态
  if (isLoading) {
    return (
      <UserLayout showTabBar={showUserChrome} showTopBar={true}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      </UserLayout>
    );
  }

  if (!activity) {
    return (
      <UserLayout showTabBar={showUserChrome} showTopBar={true}>
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
          <AlertCircle size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm mb-4">活动不存在</p>
          <button
            onClick={() => navigate(homePath)}
            className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg"
          >
            返回{homeLabel}
          </button>
        </div>
      </UserLayout>
    );
  }

  const config = statusConfig[activity.userStatus] || statusConfig.recruiting;
  const enrollmentUpdateRequired =
    activity.userStatus !== "rejected" &&
    activity.enrollment?.updateRequired === true;
  const registrationAvailability = getRegistrationAvailability(activity);
  const displayedParticipantCount = getDisplayParticipantCount(
    activity,
    enrolledCount ?? activity.currentParticipants,
  );
  const capacityPresentation = getActivityCapacityPresentation(
    activity.capacitySummary?.occupiedParticipants ?? activity.currentParticipants,
    activity.maxParticipants,
    displayedParticipantCount,
  );
  const isFull = capacityPresentation.isFull;
  const displayLocation = isOnlineOnlyActivity(activity.tags)
    ? "线上活动"
    : activity.location || "地点待定";

  const statusDisplayConfig =
    activity.userStatus === "recruiting" &&
    !registrationAvailability.canRegister
      ? {
          ...config,
          label: registrationAvailability.reason || config.label,
        }
      : config;

  const participantVariant: ButtonVariant =
    activity.userStatus === "approved"
      ? "success"
      : activity.userStatus === "pending"
        ? "light"
        : "primary";

  const actionConfig: {
    btnLabel: string;
    disabled?: boolean;
    variant: ButtonVariant;
  } = !isAuthenticated
    ? {
        btnLabel: "验证手机号后报名",
        disabled: false,
        variant: "primary" as const,
      }
    : !isParticipantUser
      ? isOrganizer
        ? {
            btnLabel: "管理报名",
            disabled: false,
            variant: "primary" as const,
          }
        : {
            btnLabel: "主办方不能报名自己创建的活动",
            disabled: true,
            variant: "light" as const,
          }
      : activity.userStatus === "rejected"
        ? {
            btnLabel: "审核已结束",
            disabled: true,
            variant: "light" as const,
          }
        : enrollmentUpdateRequired
          ? {
              btnLabel: "完善报名资料",
              disabled: false,
              variant: "primary" as const,
            }
          : activity.userStatus === "recruiting" &&
              !registrationAvailability.canRegister
            ? {
                btnLabel: registrationAvailability.reason || "暂不可报名",
                disabled: true,
                variant: "light" as const,
              }
            : {
                btnLabel: config.btnLabel,
                disabled: config.disabled,
                variant: participantVariant,
              };

  const handlePrimaryAction = () => {
    if (!id) return;
    if (!isAuthenticated) {
      navigate(registrationPath);
      return;
    }
    if (!isParticipantUser) {
      if (isOrganizer) navigate(`/dashboard/activity/${id}/enrollment`);
      return;
    }
    if (activity.userStatus === "rejected") return;
    if (
      activity.userStatus === "recruiting" &&
      registrationAvailability.canRegister
    ) {
      navigate(registrationPath);
    } else if (
      enrollmentUpdateRequired ||
      ["pending", "waitlist"].includes(activity.userStatus)
    ) {
      navigate(registrationPath);
    } else if (activity.userStatus === "approved") {
      navigate(`/u/activities/${id}/match-result`);
    } else if (activity.userStatus === "completed") {
      navigate(`/u/activities/${id}/recap`);
    }
  };

  const organizerName = activity.organizer?.name?.trim() || "发布者";
  const organizerIdentity = (
    <>
      <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-900/30">
        {activity.organizer?.avatar ? (
          <img
            src={activity.organizer.avatar}
            alt={organizerName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-primary-500">
            {organizerName.charAt(0) || "?"}
          </div>
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-200">
        {organizerName}
      </p>
    </>
  );
  const organizerContent =
    isAuthenticated && activity.organizer?.id ? (
      <button
        type="button"
        className="-mx-1 flex w-full max-w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40"
        onClick={() => navigate(`/u/profile/${activity.organizer.id}`)}
        aria-label={`查看活动发布者 ${organizerName}`}
      >
        {organizerIdentity}
      </button>
    ) : (
      <div className="flex max-w-full items-center gap-2.5 py-1">
        {organizerIdentity}
      </div>
    );

  return (
    <UserLayout
      showTabBar={showUserChrome}
      showTopBar={true}
      showBreadcrumb={showBreadcrumb}
      breadcrumbItems={[
        { label: homeLabel, path: homePath },
        { label: activity.title },
      ]}
      bgColor="bg-gray-100 dark:bg-gray-900"
    >
      {/* 页面内容 */}
      <div className="md:py-6 lg:py-8">
        {/* 响应式容器 - 桌面版增加上下边距和圆角 */}
        <div className="relative mx-auto flex min-h-screen max-w-lg flex-col bg-white shadow-sm dark:bg-gray-800 md:mb-6 md:min-h-[calc(100dvh-8rem)] md:max-w-2xl md:rounded-2xl md:shadow-xl lg:max-w-4xl">
          {/* 桌面端左右切换按钮 - 相对于卡片定位 */}
          {prevActivity && (
            <button
              onClick={goToPrevious}
              className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -left-16 z-40 w-12 h-12 rounded-full bg-white dark:bg-gray-700 shadow-lg border border-gray-100 dark:border-gray-600 items-center justify-center hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:border-primary-200 dark:hover:border-primary-700 hover:shadow-xl hover:scale-105 transition-all duration-200 group"
              aria-label="上一个活动"
              title="上一个活动"
            >
              <ChevronLeft
                size={24}
                className="text-gray-400 dark:text-gray-300 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors"
              />
              {/* 悬停提示 */}
              <span className="absolute left-full ml-2 px-2 py-1 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                上一个
              </span>
            </button>
          )}
          {nextActivity && (
            <button
              onClick={goToNext}
              className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -right-16 z-40 w-12 h-12 rounded-full bg-white dark:bg-gray-700 shadow-lg border border-gray-100 dark:border-gray-600 items-center justify-center hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:border-primary-200 dark:hover:border-primary-700 hover:shadow-xl hover:scale-105 transition-all duration-200 group"
              aria-label="下一个活动"
              title="下一个活动"
            >
              <ChevronRight
                size={24}
                className="text-gray-400 dark:text-gray-300 group-hover:text-primary-500 dark:group-hover:text-primary-400 transition-colors"
              />
              {/* 悬停提示 */}
              <span className="absolute right-full mr-2 px-2 py-1 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                下一个
              </span>
            </button>
          )}

          {/* 封面区域 - 图片轮播（与移动端切换按钮共用相对容器，确保按钮垂直居中） */}
          <div className="relative shrink-0">
            {prevActivity && (
              <button
                onClick={goToPrevious}
                className="lg:hidden absolute left-3 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-white/95 dark:bg-gray-800/95 shadow-md flex items-center justify-center hover:bg-white dark:hover:bg-gray-700 hover:shadow-lg active:scale-95 transition-all duration-150"
                aria-label="上一个活动"
              >
                <ChevronLeft
                  size={24}
                  className="text-gray-600 dark:text-gray-300"
                />
              </button>
            )}
            {nextActivity && (
              <button
                onClick={goToNext}
                className="lg:hidden absolute right-3 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-white/95 dark:bg-gray-800/95 shadow-md flex items-center justify-center hover:bg-white dark:hover:bg-gray-700 hover:shadow-lg active:scale-95 transition-all duration-150"
                aria-label="下一个活动"
              >
                <ChevronRight
                  size={24}
                  className="text-gray-600 dark:text-gray-300"
                />
              </button>
            )}
            <ImageCarousel
              images={
                activity.images?.length
                  ? activity.images
                  : [activity.coverImage]
              }
              variant="detail"
              className="md:rounded-t-2xl"
              renderOverlay={() => (
                <>
                {/* 顶部导航 - 增加顶部安全区域 */}
                <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-20">
                  <button
                    onClick={handleBackToHome}
                    className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
                    aria-label={`返回${homeLabel}`}
                  >
                    <ArrowLeft size={20} className="text-white" />
                  </button>
                  <div className="flex gap-2">
                    {!isBusinessUser && (
                      <button
                        onClick={handleToggleFavorite}
                        className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
                      >
                        <Heart
                          size={20}
                          className={
                            isFavorited
                              ? "text-red-400 fill-red-400"
                              : "text-white"
                          }
                        />
                      </button>
                    )}
                    <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                      <Share2 size={20} className="text-white" />
                    </button>
                  </div>
                </div>

                {/* 状态标签 - 移动到右下角，避免与返回按钮重叠 */}
                <div
                  className={`absolute bottom-3 right-4 z-20 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white ${statusDisplayConfig.color}`}
                >
                  {statusDisplayConfig.label}
                </div>

                {/* 底部标签 */}
                <div className="absolute bottom-3 left-4 flex gap-1.5 z-20">
                  {activity.tags.slice(0, 3).map((tag, i) => (
                    <span
                      key={i}
                      className="shrink-0 whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-gray-700 backdrop-blur-sm"
                    >
                      {getTagLabel(tag)}
                    </span>
                  ))}
                </div>
                </>
              )}
            />
          </div>

          {/* 内容区 */}
          <div className="flex-1 px-4 py-5 md:px-6 lg:px-8">
            {/* 标题与名额 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h1 className="min-w-0 text-xl font-bold leading-tight text-gray-900 dark:text-gray-100 md:text-2xl lg:text-3xl">
                {activity.title}
              </h1>
              <span
                className={`inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                  isFull
                    ? "bg-error-50 text-error-600 dark:bg-error-900/20 dark:text-error-400"
                    : "bg-[rgba(171,191,255,0.44)] text-[#4d5ef8] dark:bg-[#4d5ef8]/20 dark:text-[#9ba7ff]"
                }`}
              >
                <Users size={14} aria-hidden="true" />
                {capacityPresentation.label}
              </span>
            </div>

            {/* 信息卡片 - 桌面端网格布局 */}
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
              {/* 时间 */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                  <Calendar size={16} className="text-primary-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    活动时间
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatDate(activity.eventStartTime)} -{" "}
                    {formatDate(activity.eventEndTime)}
                  </p>
                </div>
              </div>

              {/* 报名时间 */}
              {(activity.registrationStart || activity.registrationEnd) && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-warning-50 dark:bg-warning-900/20 flex items-center justify-center flex-shrink-0">
                    <Clock size={16} className="text-warning-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">报名时间</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {activity.registrationStart ? formatDate(activity.registrationStart) : "即时开放"}
                      {" - "}
                      {activity.registrationEnd ? formatDate(activity.registrationEnd) : "截止未设置"}
                    </p>
                  </div>
                </div>
              )}

              {/* 地点 */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-success-50 dark:bg-success-900/20 flex items-center justify-center flex-shrink-0">
                  <MapPin
                    size={16}
                    className="text-success-500 dark:text-success-400"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    活动地点
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {displayLocation}
                  </p>
                </div>
              </div>

            </div>

            {/* 分隔线 */}
            <div className="h-px bg-gray-100 dark:bg-gray-700 my-5" />

            {/* 活动发布与咨询信息 */}
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                  活动发布
                </p>
                {activity.organizer?.id ? (
                  isAuthenticated ? (
                    <MerchantHoverCard
                      merchantId={activity.organizer.id}
                      fallbackName={activity.organizer.name}
                      fallbackAvatar={activity.organizer.avatar}
                      className="w-full max-w-full"
                    >
                      {organizerContent}
                    </MerchantHoverCard>
                  ) : (
                    organizerContent
                  )
                ) : (
                  organizerContent
                )}
              </div>

              {activity.contactInfo && (
                <div className="flex min-w-0 items-center gap-2.5 border-t border-gray-100 pt-3 dark:border-gray-700 sm:ml-auto sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/20">
                    <Phone
                      size={15}
                      className="text-primary-400"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="min-w-0 break-words text-xs leading-5 text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-200">
                      咨询我们
                    </span>
                    <span className="mx-1" aria-hidden="true">
                      ·
                    </span>
                    {activity.contactInfo}
                  </p>
                </div>
              )}
            </div>

            {/* 分隔线 */}
            <div className="h-px bg-gray-100 dark:bg-gray-700 my-5" />

            {/* 活动简介 */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                活动简介
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                {activity.description || "暂无活动简介"}
              </p>
            </div>

            {/* 参与要求 */}
            {activity.requirements && (() => {
              const items = parseRequirements(activity.requirements);
              if (items.length === 0) return null;
              return (
                <div className="mt-5 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/10 dark:to-amber-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-800/30">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 bg-orange-400 rounded-full" />
                    参与要求
                  </h3>
                  <ul className="space-y-2">
                    {items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400">
                        <span className="w-5 h-5 flex items-center justify-center text-xs font-medium text-orange-500 bg-orange-100 dark:bg-orange-900/30 rounded-full flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {/* 状态提示 */}
            {enrollmentUpdateRequired && (
              <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-3 dark:border-orange-800/50 dark:bg-orange-900/20">
                <div className="flex items-start gap-2">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0 text-orange-600 dark:text-orange-400"
                  />
                  <div>
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-300">
                      主办方需要你补充或确认报名资料
                    </p>
                    {Boolean(activity.enrollment?.updateFieldLabels?.length) && (
                      <p className="mt-1 text-xs leading-5 text-orange-700 dark:text-orange-400">
                        待处理：{activity.enrollment?.updateFieldLabels.join("、")}
                      </p>
                    )}
                    {activity.enrollment?.updateNote && (
                      <p className="mt-1 text-xs leading-5 text-orange-700 dark:text-orange-400">
                        {activity.enrollment.updateNote}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {activity.userStatus === "approved" && (
              <div className="mt-5 rounded-xl bg-success-50 p-3 dark:bg-success-900/20">
                <div className="flex items-center gap-2">
                <CheckCircle
                  size={16}
                  className="text-success-500 dark:text-success-400 flex-shrink-0"
                />
                <p className="text-xs text-success-700 dark:text-success-400">
                  报名已通过，点击下方查看分组结果
                </p>
                </div>
                {enrollmentUpdateRequired && (
                  <button
                    type="button"
                    onClick={() => navigate(`/u/activities/${id}/match-result`)}
                    className="mt-2 text-xs font-medium text-success-700 underline-offset-2 hover:underline dark:text-success-400"
                  >
                    查看分组结果
                  </button>
                )}
              </div>
            )}
            {activity.userStatus === "pending" && (
              <div className="mt-5 p-3 bg-warning-50 dark:bg-warning-900/20 rounded-xl flex items-center gap-2">
                <Clock
                  size={16}
                  className="text-warning-600 dark:text-warning-500 flex-shrink-0"
                />
                <p className="text-xs text-warning-700 dark:text-warning-400">
                  报名审核中，请耐心等待
                </p>
              </div>
            )}
            {activity.userStatus === "rejected" && (
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-gray-100 p-3 dark:bg-gray-700/40">
                <AlertCircle
                  size={16}
                  className="flex-shrink-0 text-gray-500 dark:text-gray-400"
                />
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  该报名审核流程已结束
                </p>
              </div>
            )}
            {activity.userStatus === "recruiting" &&
              !registrationAvailability.canRegister && (
                <div className="mt-5 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl flex items-center gap-2">
                  <AlertCircle
                    size={16}
                    className="text-gray-500 dark:text-gray-400 flex-shrink-0"
                  />
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    {registrationAvailability.reason || "当前暂不可报名"}
                  </p>
                </div>
              )}
          </div>

          {/* 底部操作栏 - 短内容时贴底，长内容时跟随文档流 */}
          <div className="mt-auto shrink-0 overflow-hidden md:rounded-b-2xl">
            <div className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 pt-3 pb-4 lg:pb-6">
              <div className="flex items-center gap-3">
                {!isBusinessUser && (
                  <button
                    onClick={handleToggleFavorite}
                    className="w-12 h-12 rounded-xl border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <Heart
                      size={22}
                      className={
                        isFavorited
                          ? "text-red-500 fill-red-500"
                          : "text-gray-400"
                      }
                    />
                  </button>
                )}
                <Button
                  variant={actionConfig.variant}
                  disabled={actionConfig.disabled}
                  onClick={handlePrimaryAction}
                  className="flex-1 h-12"
                >
                  {actionConfig.btnLabel}
                </Button>
              </div>
              {/* 移动端底部安全区域：TabBar (56px) + iOS 底部条 */}
              <div className="h-14 lg:hidden" />
            </div>
          </div>
        </div>
      </div>
    </UserLayout>
  );
};

export default UserActivityDetail;
