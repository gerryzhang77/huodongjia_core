/**
 * ActivityCard - 通用活动卡片组件
 *
 * 用途: 展示活动信息的统一卡片
 * 复用于: 发现页、活动记录、收藏列表等
 *
 * 设计规范:
 * - 圆角: 16px
 * - 阴影: shadow-card
 * - 悬停效果: 上移 + 阴影增强
 */

import { FC, memo } from "react";
import { clsx } from "clsx";
import { Calendar, MapPin, Users, Heart, Trash2 } from "lucide-react";
import { Tag } from "@/components/ui";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useToggleFavorite } from "@/features/user/activity/hooks/useFavorites";
import { api } from "@/services/api";
import { Toast } from "@/components/ui/Toast";
import { isOnlineOnlyActivity } from "@/features/activities/utils/constants";
import type { ActivityCardProps } from "./types";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";

// 用户状态配置
const userStatusConfig = {
  recruiting: { color: "primary" as const, text: "报名中" },
  pending: { color: "warning" as const, text: "待审核" },
  approved: { color: "success" as const, text: "已通过" },
  rejected: { color: "gray" as const, text: "审核结束" },
  waitlist: { color: "warning" as const, text: "候补中" },
  cancelled: { color: "gray" as const, text: "已取消" },
  completed: { color: "gray" as const, text: "已结束" },
};

// 格式化日期（确保 UTC 解析）
const formatDate = (dateStr: string): string => {
  const normalized = dateStr.includes('+') || dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  return dayjs(normalized).format("M月D日 HH:mm");
};

/**
 * ActivityCard 组件
 */
const ActivityCardInner: FC<ActivityCardProps> = ({
  activity,
  onClick,
  onMouseEnter,
  showUserStatus = true,
  showFavorite = false,
  isFavorited = false,
  onToggleFavorite,
  enableQuickFavorite = true,
  editMode = false,
  onRemove,
  className,
  priority = false,
}) => {
  const {
    id,
    title,
    coverImage,
    eventStartTime,
    eventEndTime,
    location,
    maxParticipants,
    currentParticipants,
    tags,
    userStatus,
    organizer,
  } = activity;

  const statusConfig = userStatusConfig[userStatus];
  const displayParticipantCount = getDisplayParticipantCount(activity, currentParticipants);
  const displayLocation = isOnlineOnlyActivity(tags)
    ? "线上活动"
    : location || "地点待定";

  // 内置快捷收藏：仅当外部未提供 onToggleFavorite，且未关闭，且非编辑模式时启用
  const useInternalFav =
    enableQuickFavorite && !showFavorite && !editMode && !onToggleFavorite;
  const toggleFav = useToggleFavorite();
  // 收藏状态由 React Query 缓存统一管理（乐观更新在 useToggleFavorite 中实现）
  // 初始值优先用 activity.isFavorite 兜底，避免冷启动闪烁
  const { data: favStatus } = useQuery({
    queryKey: ["user", "favorite-status", id],
    queryFn: () =>
      api.get<{ success: boolean; data: { favorited: boolean } }>(
        `/api/user/favorites/${id}/status`,
      ),
    enabled: useInternalFav,
    initialData: activity.isFavorite
      ? { success: true, data: { favorited: true } }
      : undefined,
    staleTime: 30 * 1000,
  });

  const showFavoriteButton =
    !editMode && (showFavorite || useInternalFav);
  const favoritedState = useInternalFav
    ? !!favStatus?.data?.favorited
    : isFavorited;

  const handleClick = () => {
    if (!editMode) {
      onClick?.(id);
    }
  };

  const handleMouseEnter = () => {
    if (!editMode) {
      onMouseEnter?.(id);
    }
  };

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (useInternalFav) {
      // 乐观更新由 useToggleFavorite 内部处理；失败时它已自动回滚
      try {
        await toggleFav.mutateAsync(id);
      } catch (err) {
        Toast.show({
          icon: "fail",
          content: err instanceof Error ? err.message : "操作失败",
        });
      }
      return;
    }
    onToggleFavorite?.(id);
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.(id);
  };

  const organizerInitial =
    (organizer?.name && organizer.name.charAt(0)) || "?";

  return (
    <div
      className={clsx(
        "relative bg-white dark:bg-gray-800 rounded-2xl shadow-card overflow-hidden",
        "transition-all duration-200",
        !editMode &&
          "hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer",
        className
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      {/* 封面图 */}
      <div className="relative h-40 overflow-hidden bg-gray-100 dark:bg-gray-700">
        <img
          src={coverImage}
          alt={title}
          loading={priority ? "eager" : "lazy"}
          {...(priority ? { fetchPriority: "high" as const } : {})}
          decoding="async"
          className="w-full h-full object-cover"
        />

        {/* 用户状态标签 */}
        {showUserStatus && (
          <div className="absolute top-3 left-3">
            <Tag color={statusConfig.color} variant="filled" size="small">
              {statusConfig.text}
            </Tag>
          </div>
        )}

        {/* 收藏按钮 */}
        {showFavoriteButton && (
          <button
            onClick={handleFavoriteClick}
            disabled={useInternalFav && toggleFav.isPending}
            aria-label={favoritedState ? "取消收藏" : "收藏"}
            className={clsx(
              "absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center",
              "transition-all duration-200",
              favoritedState
                ? "bg-error-500 text-white"
                : "bg-white/90 backdrop-blur-sm text-gray-400 hover:text-error-500",
            )}
          >
            <Heart size={18} className={favoritedState ? "fill-current" : ""} />
          </button>
        )}

        {/* 删除按钮 (编辑模式) */}
        {editMode && onRemove && (
          <button
            onClick={handleRemoveClick}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-error-500 text-white flex items-center justify-center hover:bg-error-600 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="p-4">
        {/* 标题 */}
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 mb-2">
          {title}
        </h3>

        {/* 信息 */}
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Calendar size={14} className="flex-shrink-0" />
            <span className="truncate">{formatDate(eventStartTime)} - {formatDate(eventEndTime)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <MapPin size={14} className="flex-shrink-0" />
            <span className="truncate">{displayLocation}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Users size={14} className="flex-shrink-0" />
            <span>
              {displayParticipantCount}/{maxParticipants} 人
            </span>
          </div>
        </div>

        {/* 标签 */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.slice(0, 3).map((tag, index) => (
              <Tag key={index} color="gray" variant="soft" size="small">
                {tag}
              </Tag>
            ))}
          </div>
        )}

        {/* 组织者 */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="w-6 h-6 rounded-full overflow-hidden bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
            {organizer?.avatar ? (
              <img
                src={organizer.avatar}
                alt={organizer.name || ""}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-semibold text-primary-600 dark:text-primary-300">
                {organizerInitial}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {organizer?.name || "主办方"}
          </span>
        </div>
      </div>
    </div>
  );
};

export const ActivityCard = memo(ActivityCardInner);
ActivityCard.displayName = "ActivityCard";

export default ActivityCard;
