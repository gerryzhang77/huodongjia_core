/**
 * HotActivityCarousel - 热门活动轮播组件
 *
 * 用途: 首页热门活动展示，支持自动轮播和手动滑动
 *
 * 设计规范:
 * - 圆角: 16px
 * - 封面无滤镜，底部渐变保证文字可读
 * - 支持自动轮播，悬停暂停
 * - PC 端显示多张，移动端显示单张
 */

import { FC, useRef } from "react";
import { Swiper } from "antd-mobile";
import { clsx } from "clsx";
import { Flame, Users, ChevronLeft, ChevronRight } from "lucide-react";
import type { SwiperRef } from "antd-mobile";
import type { HotActivityCarouselProps, HotActivitySlideProps } from "./types";
import dayjs from "dayjs";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";

/**
 * 格式化日期
 */
const formatShortDate = (dateStr: string): string => {
  const d = dayjs(dateStr);
  const today = dayjs();
  const tomorrow = today.add(1, "day");

  if (d.isSame(today, "day")) return `今天 ${d.format("HH:mm")}`;
  if (d.isSame(tomorrow, "day")) return `明天 ${d.format("HH:mm")}`;
  return d.format("M/D HH:mm");
};

/**
 * 单个轮播卡片
 */
const HotActivitySlide: FC<HotActivitySlideProps> = ({ activity, onClick }) => {
  const displayParticipantCount = getDisplayParticipantCount(activity, activity.currentParticipants);
  const isAlmostFull =
    activity.currentParticipants / activity.maxParticipants >= 0.8;

  return (
    <div
      onClick={onClick}
      className="relative h-[180px] sm:h-[220px] lg:h-[320px] xl:h-[360px] rounded-2xl overflow-hidden cursor-pointer group"
    >
      {/* 封面图片 - 首屏关键资源，立即加载 */}
      <img
        src={activity.coverImage}
        alt={activity.title}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      {/* 底部渐变遮罩 - 增强底部区域 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 via-40% to-transparent" />

      {/* 顶部标签区 */}
      <div className="absolute top-3 sm:top-4 lg:top-5 left-3 sm:left-4 lg:left-6 right-3 sm:right-4 lg:right-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAlmostFull && (
            <span className="flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-full bg-secondary-500/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm lg:px-3 lg:py-1.5 lg:text-xs">
              <Flame size={12} className="lg:w-3.5 lg:h-3.5" />
              即将满员
            </span>
          )}
          {activity.tags[0] && (
            <span className="whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm backdrop-blur-sm lg:px-3 lg:py-1.5 lg:text-xs">
              #{activity.tags[0]}
            </span>
          )}
        </div>

        {/* 人数 */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 lg:px-3 lg:py-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm">
          <Users size={12} className="text-gray-500 lg:w-3.5 lg:h-3.5" />
          <span className="text-[11px] lg:text-xs font-semibold text-gray-700">
            {displayParticipantCount}/{activity.maxParticipants}
          </span>
        </div>
      </div>

      {/* 底部信息 */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 lg:p-6 xl:p-8">
        {/* 活动描述 - 仅 PC 端显示 */}
        {activity.description && (
          <p className="hidden lg:block text-sm text-white/80 line-clamp-2 mb-3 max-w-[70%] leading-relaxed">
            {activity.description}
          </p>
        )}
        <h3 className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-white line-clamp-2 mb-2 lg:mb-3 leading-snug drop-shadow-sm">
          {activity.title}
        </h3>
        <div className="flex items-center justify-between text-xs lg:text-sm text-white/90">
          <span className="drop-shadow-sm">
            {formatShortDate(activity.eventStartTime)} - {formatShortDate(activity.eventEndTime)}
          </span>
          <span className="truncate max-w-[50%] drop-shadow-sm">
            {activity.location.split(" ")[0]}
          </span>
        </div>
      </div>

      {/* 悬停高亮边框 */}
      <div className="absolute inset-0 rounded-2xl border-2 border-transparent group-hover:border-white/30 transition-colors duration-300 pointer-events-none" />
    </div>
  );
};

/**
 * 热门活动轮播组件
 */
export const HotActivityCarousel: FC<HotActivityCarouselProps> = ({
  activities,
  onClick,
  autoplay = true,
  autoplayInterval = 4000,
  className,
}) => {
  const swiperRef = useRef<SwiperRef>(null);

  if (!activities || activities.length === 0) {
    return null;
  }

  const handlePrev = () => {
    swiperRef.current?.swipePrev();
  };

  const handleNext = () => {
    swiperRef.current?.swipeNext();
  };

  return (
    <div className={clsx("relative group/carousel", className)}>
      {/* Swiper 轮播 */}
      <Swiper
        ref={swiperRef}
        autoplay={autoplay}
        autoplayInterval={autoplayInterval}
        loop
        indicator={(total, current) => (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={clsx(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  i === current
                    ? "bg-white w-5"
                    : "bg-white/50 hover:bg-white/70"
                )}
              />
            ))}
          </div>
        )}
        className="rounded-2xl overflow-hidden"
      >
        {activities.map((activity) => (
          <Swiper.Item key={activity.id}>
            <HotActivitySlide
              activity={activity}
              onClick={() => onClick?.(activity.id)}
            />
          </Swiper.Item>
        ))}
      </Swiper>

      {/* PC 端导航箭头 */}
      {activities.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 z-20
                       w-10 h-10 items-center justify-center rounded-full
                       bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-lg
                       text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white dark:hover:bg-gray-700
                       opacity-0 group-hover/carousel:opacity-100
                       transition-all duration-300
                       hover:scale-110"
            aria-label="上一张"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={handleNext}
            className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 z-20
                       w-10 h-10 items-center justify-center rounded-full
                       bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-lg
                       text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white dark:hover:bg-gray-700
                       opacity-0 group-hover/carousel:opacity-100
                       transition-all duration-300
                       hover:scale-110"
            aria-label="下一张"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}
    </div>
  );
};

export default HotActivityCarousel;
