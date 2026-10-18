/**
 * UserHoverCard 类型定义
 */

export interface UserBrief {
  id: string;
  name: string;
  avatar?: string;
  role?: string;
  occupation?: string;
  city?: string;
  tags?: string[];
  /** 性别 */
  gender?: "male" | "female" | "other";
  /** 年龄 */
  age?: number;
  /** 所在公司 */
  company?: string;
  /** 所属行业 */
  industry?: string;
  /** 个人简介 */
  bio?: string;
}

export interface UserHoverCardProps {
  /** 用户简要信息 */
  user: UserBrief;
  /** 标签区标题，按使用场景提供 */
  tagsLabel?: string;
  /** 匹配度分数 (0-100)，可选 */
  matchScore?: number;
  /** 子元素（触发器，通常是头像） */
  children: React.ReactNode;
  /** 卡片位置 */
  placement?: "top" | "bottom" | "left" | "right";
  /** 是否禁用悬浮 */
  disabled?: boolean;
  /** 点击查看详情回调 */
  onViewProfile?: (userId: string) => void;
  /** 自定义操作区（如关注/私信按钮）；显示在"查看主页"按钮上方 */
  actionsSlot?: React.ReactNode;
  /** 资料卡内的补充内容（如受保护的报名图片预览） */
  detailsSlot?: React.ReactNode;
  /** 悬停意图成立后执行的轻量预取 */
  onPrefetch?: () => void | Promise<unknown>;
  /** 额外的类名 */
  className?: string;
  /** 是否允许通过键盘聚焦触发悬浮卡片 */
  focusable?: boolean;
  /** 子元素获得键盘焦点时是否显示悬浮卡片，适用于触发区内保留独立按钮的场景 */
  focusWithin?: boolean;
  /** 可聚焦触发器的无障碍名称 */
  triggerAriaLabel?: string;
  /** 是否在悬浮卡片底部展示“查看个人主页”操作 */
  showProfileAction?: boolean;
}

export interface UserCardContentProps {
  /** 用户简要信息 */
  user: UserBrief;
  /** 标签区标题，按使用场景提供 */
  tagsLabel?: string;
  /** 匹配度分数 (0-100)，可选 */
  matchScore?: number;
  /** 点击查看详情回调 */
  onViewProfile?: () => void;
  /** 自定义操作区（如关注/私信按钮）；显示在"查看主页"按钮上方 */
  actionsSlot?: React.ReactNode;
  /** 展示在操作区之前的补充内容 */
  detailsSlot?: React.ReactNode;
  /** 额外的类名 */
  className?: string;
}
