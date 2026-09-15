/**
 * ActivityListItem - 活动列表卡片组件（水平布局）
 *
 * 用途: 用于列表形式展示活动，左侧封面 + 右侧信息
 *
 * 设计规范:
 * - 圆角: 16px
 * - 阴影: shadow-card
 * - 封面无滤镜，直接展示
 * - PC 端封面更大，信息更丰富
 */

import { FC, memo } from "react";
import { clsx } from "clsx";
import { Calendar, MapPin, TrendingUp } from "lucide-react";
import { Tag } from "@/components/ui";
import dayjs from "dayjs";
import { isOnlineOnlyActivity } from "@/features/activities/utils/constants";
import type { ActivityListItemProps } from "./types";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";

// 用户状态配置
const userStatusConfig = {
  recruiting: { color: "primary" as const, text: "报名中" },
  pending: { color: "warning" as const, text: "待审核" },
  approved: { color: "success" as const, text: "已通过" },
  completed: { color: "gray" as const, text: "已结束" },
};

/**
 * 格式化日期显示
 */
const formatDate = (dateStr: string): string => {
  const normalized = dateStr.includes('+') || dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
  const d = dayjs(normalized);
  const today = dayjs();
  const tomorrow = today.add(1, "day");
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  if (d.isSame(today, "day")) return `今天 ${d.format("HH:mm")}`;
  if (d.isSame(tomorrow, "day")) return `明天 ${d.format("HH:mm")}`;
  return `${d.format("M月D日")} ${weekdays[d.day()]} ${d.format("HH:mm")}`;
};

/**
 * ActivityListItem 组件
 */
const ActivityListItemInner: FC<ActivityListItemProps> = ({
  activity,
  onClick,
  onMouseEnter,
  size = "default",
  showUserStatus = false,
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
  } = activity;

  const statusConfig = userStatusConfig[userStatus];
  const displayParticipantCount = getDisplayParticipantCount(activity, currentParticipants);
  const isHot = currentParticipants / maxParticipants >= 0.8;
  const displayLocation = isOnlineOnlyActivity(tags)
    ? "线上活动"
    : location || "地点待定";
  const isUpcoming =
    dayjs(eventStartTime).diff(dayjs(), "day") <= 3 &&
    dayjs(eventStartTime).isAfter(dayjs());

  // 尺寸配置
  const sizeClasses = {
    compact: {
      container: "h-[110px]",
      cover: "w-28 sm:w-32",
      title: "text-sm",
      info: "text-[11px]",
      padding: "p-3",
    },
    default: {
      container: "h-[130px] lg:h-[140px]",
      cover: "w-32 sm:w-36 lg:w-48",
      title: "text-sm sm:text-base",
      info: "text-xs",
      padding: "p-3 sm:p-4",
    },
    large: {
      container: "h-[150px] lg:h-[160px]",
      cover: "w-36 sm:w-44 lg:w-56",
      title: "text-base sm:text-lg",
      info: "text-xs sm:text-sm",
      padding: "p-4",
    },
  };

  const sizes = sizeClasses[size];

  const handleClick = () => {
    onClick?.(id);
  };

  const handleMouseEnter = () => {
    onMouseEnter?.(id);
  };

  return (
    <article
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      className={clsx(
        "bg-white dark:bg-gray-800 rounded-2xl shadow-card overflow-hidden flex cursor-pointer",
        "transition-all duration-200 ease-out",
        "hover:shadow-card-hover hover:-translate-y-0.5",
        "active:scale-[0.99]",
        sizes.container,
        className
      )}
    >
      {/* 左侧封面 */}
      <div
        className={clsx("relative flex-shrink-0 overflow-hidden", sizes.cover)}
      >
        {coverImage ? (
          <img
            src={coverImage}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            loading={priority ? "eager" : "lazy"}
            {...(priority ? { fetchPriority: "high" as const } : {})}
            decoding="async"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center">
            <Calendar size={28} className="text-primary-400" />
          </div>
        )}

        {/* 角标 - 热门/即将开始 */}
        {(isHot || isUpcoming) && (
          <div className="absolute top-2 left-2">
            <span
              className={clsx(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
                isHot
                  ? "bg-secondary-500 text-white"
                  : "bg-primary-500 text-white"
              )}
            >
              {isHot && <TrendingUp size={10} />}
              {isHot ? "热门" : "即将开始"}
            </span>
          </div>
        )}

        {/* 用户状态标签 */}
        {showUserStatus && (
          <div className="absolute bottom-2 left-2">
            <Tag color={statusConfig.color} variant="filled" size="small">
              {statusConfig.text}
            </Tag>
          </div>
        )}
      </div>

      {/* 右侧内容 */}
      <div
        className={clsx(
          "flex-1 flex flex-col justify-between min-w-0",
          sizes.padding
        )}
      >
        {/* 标题 */}
        <h3
          className={clsx(
            "font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug",
            sizes.title
          )}
        >
          {title}
        </h3>

        {/* 信息 */}
        <div className="space-y-1.5 mt-auto">
          {/* 时间 */}
          <div
            className={clsx(
              "flex items-center gap-1.5 text-gray-500 dark:text-gray-400",
              sizes.info
            )}
          >
            <Calendar
              size={size === "compact" ? 12 : 14}
              className="flex-shrink-0 text-primary-400"
            />
            <span className="truncate">{formatDate(eventStartTime)} - {formatDate(eventEndTime)}</span>
          </div>

          {/* 地点 */}
          <div
            className={clsx(
              "flex items-center gap-1.5 text-gray-500 dark:text-gray-400",
              sizes.info
            )}
          >
            <MapPin
              size={size === "compact" ? 12 : 14}
              className="flex-shrink-0 text-accent-400"
            />
            <span className="truncate">{displayLocation}</span>
          </div>
        </div>

        {/* 底部信息 */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {/* 价格 */}
            <span className="text-sm font-bold text-primary-500">免费</span>
            {/* 人数 */}
            <span
              className={clsx("text-gray-400 dark:text-gray-500", sizes.info)}
            >
              {displayParticipantCount}/{maxParticipants}人
            </span>
          </div>

          {/* 标签 */}
          <div className="flex gap-1 overflow-hidden">
            {tags.slice(0, 2).map((tag, i) => (
              <Tag
                key={i}
                color={i === 0 ? "primary" : "gray"}
                variant="soft"
                size="small"
              >
                {tag}
              </Tag>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
};

export const ActivityListItem = memo(ActivityListItemInner);
ActivityListItem.displayName = "ActivityListItem";

export default ActivityListItem;
