/**
 * 用户端活动卡片组件
 * 现代化卡片设计 - 圆角、阴影、动效
 */

import { FC, memo } from "react";

import {
  Calendar,
  MapPin,
  Users,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { UserActivity, UserActivityStatus } from "@/mocks/data/user-activities";
import { getTagLabel } from "@/features/activities/utils/constants";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";
import dayjs from "dayjs";

interface UserActivityCardProps {
  activity: UserActivity;
  onClick?: (activity: UserActivity) => void;
  /** 鼠标进入事件（用于详情预拉） */
  onMouseEnter?: (id: string) => void;
}

// 状态配置
const statusConfig: Record<
  UserActivityStatus,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  recruiting: {
    label: "报名中",
    color: "text-success-600",
    bgColor: "bg-success-50",
    borderColor: "border-success-200",
  },
  pending: {
    label: "待审核",
    color: "text-warning-600",
    bgColor: "bg-warning-50",
    borderColor: "border-warning-200",
  },
  approved: {
    label: "已通过",
    color: "text-primary-600",
    bgColor: "bg-primary-50",
    borderColor: "border-primary-200",
  },
  rejected: {
    label: "审核结束",
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-200",
  },
  waitlist: {
    label: "候补中",
    color: "text-warning-600",
    bgColor: "bg-warning-50",
    borderColor: "border-warning-200",
  },
  cancelled: {
    label: "已取消",
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-200",
  },
  completed: {
    label: "已结束",
    color: "text-gray-500",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-200",
  },
};

/**
 * 格式化日期显示
 */
const formatEventDate = (startTime: string): string => {
  const date = dayjs(startTime);
  const today = dayjs();
  const tomorrow = today.add(1, "day");

  if (date.isSame(today, "day")) return `今天 ${date.format("HH:mm")}`;
  if (date.isSame(tomorrow, "day")) return `明天 ${date.format("HH:mm")}`;
  return date.format("M月D日 HH:mm");
};

/**
 * 用户端活动卡片 - 现代化设计
 */
const UserActivityCardInner: FC<UserActivityCardProps> = ({
  activity,
  onClick,
  onMouseEnter,
}) => {
  const config = statusConfig[activity.userStatus];
  const isFull = activity.currentParticipants >= activity.maxParticipants;
  const displayParticipantCount = getDisplayParticipantCount(activity, activity.currentParticipants);
  const participationRate = Math.round(
    (displayParticipantCount / activity.maxParticipants) * 100
  );

  return (
    <article
      onClick={() => onClick?.(activity)}
      onMouseEnter={() => onMouseEnter?.(activity.id)}
      className="group relative bg-white rounded-2xl overflow-hidden cursor-pointer
                 border border-gray-100/80
                 shadow-sm hover:shadow-xl hover:shadow-gray-200/50
                 transition-all duration-300 ease-out
                 hover:-translate-y-1 active:scale-[0.98]"
    >
      {/* 封面图片区域 */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        <img
          src={activity.coverImage}
          alt={activity.title}
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          loading="lazy"
        />

        {/* 渐变叠加层 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

        {/* 状态标签 - 左上角 */}
        <div className="absolute top-3 left-3">
          <span
            className={`
              inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold
              backdrop-blur-md border
              ${config.bgColor} ${config.color} ${config.borderColor}
            `}
          >
            {config.label}
          </span>
        </div>

        {/* 人数徽章 - 右上角 */}
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 backdrop-blur-md rounded-lg shadow-sm">
            <Users className="w-3.5 h-3.5 text-gray-500" />
            <span
              className={`text-xs font-bold ${
                isFull ? "text-orange-600" : "text-gray-700"
              }`}
            >
              {displayParticipantCount}/{activity.maxParticipants}
            </span>
            {participationRate >= 80 && !isFull && (
              <TrendingUp className="w-3 h-3 text-orange-500" />
            )}
          </div>
        </div>

        {/* 标签云 - 底部 */}
        {activity.tags.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
            {activity.tags.slice(0, 3).map((tag, i) => (
              <span
                key={i}
                className="px-2.5 py-1 bg-white/90 backdrop-blur-sm text-gray-700 text-[11px] font-medium rounded-md shadow-sm"
              >
                #{getTagLabel(tag)}
              </span>
            ))}
            {activity.tags.length > 3 && (
              <span className="px-2 py-1 bg-white/80 backdrop-blur-sm text-gray-400 text-[11px] rounded-md">
                +{activity.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="p-4 sm:p-5 md:p-6">
        {/* 标题 */}
        <h3 className="text-base sm:text-lg font-bold text-gray-900 line-clamp-2 leading-snug mb-3 group-hover:text-primary-600 transition-colors duration-200">
          {activity.title}
        </h3>

        {/* 信息列表 */}
        <div className="space-y-2.5">
          {/* 时间 */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4 text-primary-500" />
            </div>
            <span className="text-sm text-gray-600 font-medium">
              {formatEventDate(activity.eventStartTime)}
            </span>
          </div>

          {/* 地点 */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-accent-500" />
            </div>
            <span className="text-sm text-gray-600 truncate">
              {activity.location}
            </span>
          </div>
        </div>

        {/* 底部进度条 */}
        {participationRate > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">
                {isFull ? "名额已满" : `已报名 ${participationRate}%`}
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all duration-200" />
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isFull
                    ? "bg-gradient-to-r from-orange-400 to-orange-500"
                    : participationRate >= 80
                    ? "bg-gradient-to-r from-amber-400 to-amber-500"
                    : "bg-gradient-to-r from-primary-400 to-primary-500"
                }`}
                style={{ width: `${Math.min(participationRate, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 悬停装饰线 */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary-500 to-accent-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
    </article>
  );
};

export const UserActivityCard = memo(UserActivityCardInner);
UserActivityCard.displayName = "UserActivityCard";

export default UserActivityCard;
