/**
 * UserCardContent - 用户卡片内容组件
 * 可独立使用或作为 UserHoverCard 的内容
 */

import { FC } from "react";
import { MapPin, Briefcase, ChevronRight, Building2, Cake } from "lucide-react";
import { clsx } from "clsx";
import type { UserCardContentProps } from "./types";

const GENDER_LABEL: Record<string, string> = {
  male: "男",
  female: "女",
  other: "其他",
};

export const UserCardContent: FC<UserCardContentProps> = ({
  user,
  tagsLabel,
  onViewProfile,
  actionsSlot,
  detailsSlot,
  className,
}) => {
  const getAvatarContent = () => {
    if (user.avatar) {
      return (
        <img
          src={user.avatar}
          alt={user.name}
          className="w-full h-full object-cover"
        />
      );
    }
    return (
      <span className="text-lg font-semibold text-primary-600">
        {user.name.charAt(0)}
      </span>
    );
  };

  const genderLabel = user.gender ? GENDER_LABEL[user.gender] : undefined;
  const hasMeta = genderLabel || user.age !== undefined;

  return (
    <div
      className={clsx(
        "w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg",
        "border border-gray-100 dark:border-gray-700",
        "max-h-[calc(100vh-1rem)] overflow-x-hidden overflow-y-auto",
        className
      )}
    >
      {/* 顶部背景 + 头像 */}
      <div className="relative h-16 bg-gradient-to-br from-primary-400 to-primary-500">
        <div className="absolute -bottom-6 left-4">
          <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-800 p-0.5 shadow-md">
            <div className="w-full h-full rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center overflow-hidden">
              {getAvatarContent()}
            </div>
          </div>
        </div>

        {/* 匹配分数 - 暂时隐藏 */}
        {/* {matchScore !== undefined && (
          <div className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 dark:bg-gray-800/90 rounded-full">
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
              匹配 {matchScore}%
            </span>
          </div>
        )} */}
      </div>

      {/* 用户信息 */}
      <div className="pt-8 px-4 pb-3">
        {/* 姓名 + 角色 + 性别/年龄 */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-1">
          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {user.name}
          </h4>
          {user.role && (
            <span className="px-1.5 py-0.5 bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 text-[10px] font-medium rounded">
              {user.role}
            </span>
          )}
          {hasMeta && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] rounded">
              {genderLabel}
              {genderLabel && user.age !== undefined && " · "}
              {user.age !== undefined && `${user.age}岁`}
            </span>
          )}
        </div>

        {/* 职业 · 城市 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          {user.occupation && (
            <span className="flex items-center gap-1">
              <Briefcase size={12} />
              {user.occupation}
            </span>
          )}
          {user.city && (
            <span className="flex items-center gap-1">
              <MapPin size={12} />
              {user.city}
            </span>
          )}
        </div>

        {/* 公司 · 行业 */}
        {(user.company || user.industry) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            {user.company && (
              <span className="flex items-center gap-1 truncate">
                <Building2 size={12} />
                <span className="truncate">{user.company}</span>
              </span>
            )}
            {user.industry && (
              <span className="flex items-center gap-1 truncate">
                <Cake size={12} />
                <span className="truncate">{user.industry}</span>
              </span>
            )}
          </div>
        )}

        {/* 简介 */}
        {user.bio && (
          <p
            className="text-xs text-gray-500 dark:text-gray-400 mb-2 overflow-hidden leading-relaxed"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {user.bio}
          </p>
        )}

        {/* 标签 */}
        {user.tags && user.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tagsLabel && (
              <p className="mb-0.5 w-full text-[10px] font-medium text-gray-500 dark:text-gray-400">
                {tagsLabel}
              </p>
            )}
            {user.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
              className="max-w-full truncate whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                {tag}
              </span>
            ))}
            {user.tags.length > 3 && (
              <span className="px-2 py-0.5 text-gray-400 text-[10px]">
                +{user.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {detailsSlot && (
          <div className="mb-3 border-t border-gray-100 pt-3 dark:border-gray-700">
            {detailsSlot}
          </div>
        )}

        {/* 自定义操作区（如关注/私信按钮） */}
        {actionsSlot && (
          <div className="flex items-center gap-2 mb-2">{actionsSlot}</div>
        )}

        {/* 查看详情按钮 */}
        {onViewProfile && (
          <button
            onClick={onViewProfile}
          className="flex w-full flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 py-2 text-xs font-semibold text-white transition-colors hover:from-primary-600 hover:to-primary-700 [&>svg]:shrink-0"
          >
            查看个人主页
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default UserCardContent;
