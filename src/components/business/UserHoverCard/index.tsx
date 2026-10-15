/**
 * UserHoverCard - 用户悬浮卡片组件
 *
 * 悬停在用户头像时显示用户简要信息卡片
 * 支持 PC 端悬停和移动端点击触发
 *
 * @example
 * ```tsx
 * <UserHoverCard
 *   user={userData}
 *   matchScore={85}
 *   onViewProfile={(id) => navigate(`/u/profile/${id}`)}
 * >
 *   <Avatar src={userData.avatar} />
 * </UserHoverCard>
 * ```
 */

import {
  FC,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { UserCardContent } from "./UserCardContent";
import type { UserHoverCardProps } from "./types";

// 悬停延迟时间 (ms)
const HOVER_DELAY = 300;
const HIDE_DELAY = 150;
const PREFETCH_DELAY = 140;
const CARD_WIDTH_FALLBACK = 288;
const CARD_HEIGHT_FALLBACK = 280;
const CARD_WITH_DETAILS_HEIGHT_FALLBACK = 520;
const VIEWPORT_GAP = 8;

/**
 * UserHoverCard 组件
 */
export const UserHoverCard: FC<UserHoverCardProps> = ({
  user,
  matchScore,
  children,
  placement = "bottom",
  disabled = false,
  onViewProfile,
  actionsSlot,
  detailsSlot,
  onPrefetch,
  className,
  focusable = false,
  focusWithin = false,
  triggerAriaLabel,
  showProfileAction = true,
}) => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDetails = Boolean(detailsSlot);

  const clearPrefetchTimer = useCallback(() => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current);
      prefetchTimeoutRef.current = null;
    }
  }, []);

  const runPrefetch = useCallback(() => {
    if (!onPrefetch) return;
    try {
      void Promise.resolve(onPrefetch()).catch(() => undefined);
    } catch {
      // 预取失败不能影响资料卡主交互，真正打开后会展示局部加载状态。
    }
  }, [onPrefetch]);

  const schedulePrefetch = useCallback(() => {
    if (!onPrefetch) return;
    clearPrefetchTimer();
    prefetchTimeoutRef.current = setTimeout(runPrefetch, PREFETCH_DELAY);
  }, [clearPrefetchTimer, onPrefetch, runPrefetch]);

  // 计算卡片位置
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const cardWidth = cardRef.current?.offsetWidth || CARD_WIDTH_FALLBACK;
    const cardHeight =
      cardRef.current?.offsetHeight ||
      (hasDetails
        ? CARD_WITH_DETAILS_HEIGHT_FALLBACK
        : CARD_HEIGHT_FALLBACK);
    const offset = 8;

    let top = 0;
    let left = 0;

    switch (placement) {
      case "top":
        top = triggerRect.top - cardHeight - offset;
        left = triggerRect.left + triggerRect.width / 2 - cardWidth / 2;
        break;
      case "bottom":
        top = triggerRect.bottom + offset;
        left = triggerRect.left + triggerRect.width / 2 - cardWidth / 2;
        break;
      case "left":
        top = triggerRect.top + triggerRect.height / 2 - cardHeight / 2;
        left = triggerRect.left - cardWidth - offset;
        break;
      case "right":
        top = triggerRect.top + triggerRect.height / 2 - cardHeight / 2;
        left = triggerRect.right + offset;
        break;
    }

    // 边界检测
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 水平边界：极窄视口下也不能把卡片定位到负数坐标。
    const maxLeft = Math.max(
      VIEWPORT_GAP,
      viewportWidth - cardWidth - VIEWPORT_GAP,
    );
    left = Math.min(Math.max(left, VIEWPORT_GAP), maxLeft);

    // 垂直边界 - 如果下方放不下，放到上方
    if (
      top + cardHeight > viewportHeight - VIEWPORT_GAP &&
      placement === "bottom"
    ) {
      top = triggerRect.top - cardHeight - offset;
    }
    if (top < VIEWPORT_GAP) top = VIEWPORT_GAP;

    setPosition((current) =>
      current.top === top && current.left === left
        ? current
        : { top, left },
    );
  }, [hasDetails, placement]);

  // 显示卡片
  const showCard = useCallback(
    (prefetchImmediately = false) => {
      if (disabled) return;

      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      if (prefetchImmediately) {
        clearPrefetchTimer();
        runPrefetch();
      } else {
        schedulePrefetch();
      }

      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = setTimeout(() => {
        calculatePosition();
        setIsVisible(true);
      }, HOVER_DELAY);
    },
    [
      calculatePosition,
      clearPrefetchTimer,
      disabled,
      runPrefetch,
      schedulePrefetch,
    ],
  );

  // 隐藏卡片
  const hideCard = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    clearPrefetchTimer();

    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, HIDE_DELAY);
  }, [clearPrefetchTimer]);

  // 鼠标进入卡片时保持显示
  const handleCardMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const handleCardBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (
        nextFocusedElement instanceof Node &&
        cardRef.current?.contains(nextFocusedElement)
      ) {
        return;
      }
      hideCard();
    },
    [hideCard],
  );

  const handleFocusWithinBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const nextFocusedElement = event.relatedTarget;
      if (
        nextFocusedElement instanceof Node &&
        triggerRef.current?.contains(nextFocusedElement)
      ) {
        return;
      }
      hideCard();
    },
    [hideCard],
  );

  // 查看详情
  const handleViewProfile = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    setIsVisible(false);
    if (onViewProfile) {
      onViewProfile(user.id);
    } else {
      navigate(`/u/profile/${user.id}`);
    }
  }, [user.id, onViewProfile, navigate]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      clearPrefetchTimer();
    };
  }, [clearPrefetchTimer]);

  // 图片加载后卡片高度会变化，按真实尺寸重新定位，避免贴近视口底部时被截断。
  useLayoutEffect(() => {
    if (!isVisible) return;
    calculatePosition();

    if (typeof ResizeObserver === "undefined" || !cardRef.current) return;
    const observer = new ResizeObserver(calculatePosition);
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [calculatePosition, isVisible]);

  // 监听滚动和 resize，更新位置或隐藏
  useEffect(() => {
    if (!isVisible) return;

    const handleScrollOrResize = (event: Event) => {
      // The card itself is scrollable. Keep its actions reachable on small screens.
      if (event.target instanceof Node && cardRef.current?.contains(event.target)) return;
      setIsVisible(false);
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isVisible]);

  // 移动端点击外部关闭
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        cardRef.current &&
        !cardRef.current.contains(e.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isVisible]);

  return (
    <>
      {/* 触发器 */}
      <div
        ref={triggerRef}
        className={clsx("inline-block cursor-pointer", className)}
        tabIndex={focusable && !disabled ? 0 : undefined}
        role={focusable ? "button" : undefined}
        aria-label={
          focusable ? triggerAriaLabel || `查看${user.name}的资料` : undefined
        }
        aria-haspopup={focusable ? "dialog" : undefined}
        aria-expanded={focusable ? isVisible : undefined}
        onMouseEnter={() => showCard(false)}
        onMouseLeave={hideCard}
        onFocus={focusable ? () => showCard(true) : undefined}
        onBlur={focusable ? hideCard : undefined}
        onFocusCapture={
          !focusable && focusWithin ? () => showCard(true) : undefined
        }
        onBlurCapture={
          !focusable && focusWithin ? handleFocusWithinBlur : undefined
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (showTimeoutRef.current) {
              clearTimeout(showTimeoutRef.current);
              showTimeoutRef.current = null;
            }
            clearPrefetchTimer();
            setIsVisible(false);
            return;
          }

          if (focusable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            if (showTimeoutRef.current) {
              clearTimeout(showTimeoutRef.current);
              showTimeoutRef.current = null;
            }
            if (isVisible) {
              setIsVisible(false);
            } else {
              runPrefetch();
              calculatePosition();
              setIsVisible(true);
            }
          }
        }}
        onClick={() => {
          // 移动端点击触发
          if (window.innerWidth < 768) {
            if (isVisible) {
              setIsVisible(false);
            } else {
              runPrefetch();
              calculatePosition();
              setIsVisible(true);
            }
          }
        }}
      >
        {children}
      </div>

      {/* 悬浮卡片 - Portal 渲染 */}
      {isVisible &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={`${user.name}的用户资料`}
            className={clsx(
              "fixed z-[1070]",
              "animate-fade-in",
              "transition-opacity duration-150"
            )}
            style={{
              top: position.top,
              left: position.left,
            }}
            onMouseEnter={handleCardMouseEnter}
            onMouseLeave={hideCard}
            onFocusCapture={handleCardMouseEnter}
            onBlurCapture={handleCardBlur}
            onClick={(event) => {
              // Let the target action run before closing the portal.
              event.stopPropagation();
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest("button, a")
              ) {
                if (showTimeoutRef.current) {
                  clearTimeout(showTimeoutRef.current);
                  showTimeoutRef.current = null;
                }
                setIsVisible(false);
              }
            }}
          >
            <UserCardContent
              user={user}
              matchScore={matchScore}
              onViewProfile={
                showProfileAction ? handleViewProfile : undefined
              }
              actionsSlot={actionsSlot}
              detailsSlot={detailsSlot}
            />
          </div>,
          document.body
        )}
    </>
  );
};

export { UserCardContent } from "./UserCardContent";
export type {
  UserHoverCardProps,
  UserCardContentProps,
  UserBrief,
} from "./types";
export default UserHoverCard;
