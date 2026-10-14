/**
 * 用户端匹配结果页面
 * 路由: /u/activities/:id/match-result
 *
 * 展示当前用户的 top5 最佳匹配列表。
 * 说明：后端不再区分"分组"与"最佳匹配"—— 每个用户的"小组"就是其 top5 匹配。
 */

import { FC, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { Toast } from "antd-mobile";
import {
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Smartphone,
  Trophy,
} from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui";
import { NFCTouchModal } from "@/components/business/NFCTouchModal";
import { useActivityDetail } from "@/features/user";
import { useBestMatches } from "@/features/user/hooks/useBestMatches";
import {
  getBestMatchDetail,
  getMatchMessage,
  type MatchExplanationField,
} from "@/features/user/services/matchApi";
import { CompatibilityInsightPopover } from "@/features/user/matching/components/CompatibilityInsightPopover";
import { MatchExplanationCard } from "@/features/user/matching/components/MatchExplanationCard";
import {
  getMatchFieldSemanticType,
  getStandardFieldLabel,
} from "@/utils/fieldLabels";
import { generateDefaultAvatar } from "@/utils/avatar";
import { cn } from "@/utils/cn";
import dayjs from "dayjs";

interface TopMatchUser {
  id: string;
  name: string;
  avatar: string;
  matchHighlights: MatchExplanationField[];
  supplementary?: boolean;
}

const MatchUniverseCard: FC<{
  activityId: string;
  user: TopMatchUser;
  expanded: boolean;
  matchMessage?: string;
  loadingMessageUserId: string | null;
  onToggle: (userId: string) => void;
  onViewMessage: (userId: string) => Promise<void>;
  onViewDetail: (userId: string) => void;
}> = ({
  activityId,
  user,
  expanded,
  matchMessage,
  loadingMessageUserId,
  onToggle,
  onViewMessage,
  onViewDetail,
}) => {
  const [detailRequested, setDetailRequested] = useState(false);
  const detailQuery = useQuery({
    queryKey: ["user", "match-detail", activityId, user.id],
    queryFn: () => getBestMatchDetail(activityId, user.id),
    enabled: Boolean((expanded || detailRequested) && activityId && user.id),
    staleTime: 10 * 60 * 1000,
  });

  const detailFields = detailQuery.data?.data?.explanation.fields;
  const matchHighlights = (
    detailFields && detailFields.length > 0
      ? detailFields
      : user.matchHighlights
  ).slice(0, 3);
  const isLoadingCurrent = loadingMessageUserId === user.id;
  const isLoadingOther = Boolean(
    loadingMessageUserId && loadingMessageUserId !== user.id,
  );

  const badgeFields = matchHighlights
    .map((field) => {
      const label = getStandardFieldLabel(
        field.source_field,
        field.source_label || field.target_label || field.source_field,
      );
      const semanticType =
        field.semantic_type ||
        getMatchFieldSemanticType(field.source_field, field.source_label) ||
        getMatchFieldSemanticType(field.target_field, field.target_label);
      return label
        ? {
            field:
              semanticType && !field.semantic_type
                ? { ...field, semantic_type: semanticType }
                : field,
            label,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 3);
  const requestDetail = () => {
    setDetailRequested(true);
    if (detailQuery.isSuccess && !detailQuery.isFetching) {
      void detailQuery.refetch();
    }
  };

  return (
    <div
      className={cn(
        "rounded-[24px] border bg-white p-5 shadow-sm transition-all",
        expanded ? "border-accent-200 shadow-md" : "border-gray-100 hover:-translate-y-1 hover:shadow-md",
      )}
    >
      <div className="mb-4 flex items-start gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="shrink-0">
              <img
                src={user.avatar}
                alt={`${user.name}的头像`}
                loading="lazy"
                decoding="async"
                className="h-12 w-12 rounded-2xl border border-gray-100 bg-gray-50 object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[18px] font-semibold text-gray-900">
                {user.name}
              </div>
              {user.supplementary && <p className="mt-1 text-xs text-gray-500">补充推荐</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Sparkles size={15} className="text-accent-500" />
            匹配寄语
          </div>
          {!matchMessage ? (
            <Button
              variant="secondary"
              className="h-8 px-3 text-sm"
              loading={isLoadingCurrent}
              disabled={isLoadingOther}
              onClick={() => onViewMessage(user.id)}
            >
              {isLoadingCurrent ? "正在准备" : "查看匹配寄语"}
            </Button>
          ) : null}
        </div>

        {matchMessage ? (
          <div className="text-sm leading-6 text-gray-600">{matchMessage}</div>
        ) : null}
      </div>

      {badgeFields.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {badgeFields.map(({ field, label }, badgeIndex) => {
            const needsInsight = Boolean(
              field.semantic_type && !field.compatibility_insight,
            );
            return (
              <CompatibilityInsightPopover
                key={`${user.id}-${label}-${badgeIndex}`}
                fieldLabel={label}
                insight={field.compatibility_insight}
                canLoad={needsInsight}
                onOpenIntent={needsInsight ? requestDetail : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs",
                  badgeIndex === 0
                    ? "bg-gray-100 text-gray-700"
                    : "border border-accent-100 bg-accent-50 text-accent-600",
                )}
              >
                {label}
              </CompatibilityInsightPopover>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        {user.matchHighlights.length > 0 ? (
          <button
            onClick={() => onToggle(user.id)}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            {expanded ? "收起细节" : "查看匹配细节"}
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        ) : null}
        <button
          onClick={() => onViewDetail(user.id)}
          className="ml-auto inline-flex flex-nowrap items-center gap-1 whitespace-nowrap text-sm font-medium text-accent-500 hover:text-accent-600 [&>svg]:shrink-0"
        >
          进入详情
          <ChevronRight size={16} />
        </button>
      </div>

      {expanded && user.matchHighlights.length > 0 ? (
        <div className="mt-4 space-y-4 border-t border-gray-100 pt-4">
          <div className="grid gap-3">
            {matchHighlights.length > 0 ? (
              matchHighlights.map((field) => {
                const semanticType =
                  field.semantic_type ||
                  getMatchFieldSemanticType(
                    field.source_field,
                    field.source_label,
                  ) ||
                  getMatchFieldSemanticType(
                    field.target_field,
                    field.target_label,
                  );
                const normalizedField =
                  semanticType && !field.semantic_type
                    ? { ...field, semantic_type: semanticType }
                    : field;
                const needsInsight = Boolean(
                  normalizedField.semantic_type &&
                    !normalizedField.compatibility_insight,
                );
                return (
                  <MatchExplanationCard
                    key={`${field.rule_index}-${field.source_field}-${field.target_field}-detail`}
                    field={normalizedField}
                    canLoadInsight={needsInsight}
                    onOpenInsight={needsInsight ? requestDetail : undefined}
                  />
                );
              })
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-500">
                暂无可展示的匹配规则字段。
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const formatDate = (dateStr: string): string => {
  return dayjs(dateStr).format("M月D日");
};

const UserMatchResult: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [showNFCModal, setShowNFCModal] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [matchMessages, setMatchMessages] = useState<Record<string, string>>({});
  const [loadingMessageUserId, setLoadingMessageUserId] = useState<string | null>(null);

  const { data: activityData, isLoading } = useActivityDetail(id);

  const {
    data: bestMatchesData,
    loading: matchLoading,
    error: matchError,
  } = useBestMatches(id);

  const activity = useMemo(() => activityData?.data, [activityData]);

  const topMatches: TopMatchUser[] = useMemo(() => {
    if (!bestMatchesData || bestMatchesData.length === 0) return [];
    return bestMatchesData.map((user) => {
      return {
        id: user.user_id,
        name: user.name,
        avatar: user.avatar || generateDefaultAvatar(user.user_id),
        matchHighlights: user.matchHighlights.slice(0, 3),
        supplementary: user.supplementary,
      };
    });
  }, [bestMatchesData]);
  const visibleMatches = showAllMatches ? topMatches : topMatches.slice(0, 3);

  const supportsNFC = Boolean(
    (activity as { enableNfc?: boolean } | undefined)?.enableNfc,
  );

  const handleNavigateToDetail = (userId: string) => {
    if (!userId) return;
    navigate(`/u/activities/${id}/match-result/${userId}`);
  };

  const toggleExpandedCard = (userId: string) => {
    setExpandedUserId((current) => (current === userId ? null : userId));
  };

  const viewMessageMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!id) {
        throw new Error("缺少活动信息");
      }
      return {
        userId,
        response: await getMatchMessage(id, userId),
      };
    },
    onMutate: async (userId) => {
      setLoadingMessageUserId(userId);
    },
    onSuccess: ({ userId, response }) => {
      const message =
        typeof response.data === "string" ? response.data.trim() : "";
      if (message) {
        setMatchMessages((current) => ({
          ...current,
          [userId]: message,
        }));
      }
    },
    onError: () => {
      Toast.show({
        icon: "fail",
        content: "匹配寄语暂时无法查看，请稍后重试",
      });
    },
    onSettled: () => {
      setLoadingMessageUserId(null);
    },
  });

  const handleViewMessage = async (userId: string) => {
    if (loadingMessageUserId || matchMessages[userId]) {
      return;
    }
    try {
      await viewMessageMutation.mutateAsync(userId);
    } catch {
      // 错误提示统一由 mutation.onError 展示。
    }
  };

  // 加载中
  if (isLoading || matchLoading) {
    return (
      <UserLayout showTabBar={true} showTopBar={true}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </div>
      </UserLayout>
    );
  }

  // 活动不存在
  if (!activity) {
    return (
      <UserLayout showTabBar={true} showTopBar={true}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
          <AlertCircle size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">活动不存在</p>
          <button
            onClick={() => navigate("/u/home")}
            className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg"
          >
            返回首页
          </button>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout
      showTabBar={true}
      showTopBar={true}
      showBreadcrumb={true}
      breadcrumbItems={[
        { label: "首页", path: "/u/home" },
        { label: activity.title, path: `/u/activities/${id}` },
        { label: "匹配结果" },
      ]}
      bgColor="bg-gray-50"
    >
      <div className="min-h-screen pb-36">
        {/* 头部 */}
        <header className="bg-gradient-to-br from-accent-400 to-accent-500 pt-6 pb-6 px-4 md:px-6">
          <div className="text-center">
            <h1 className="text-lg font-bold text-white">匹配结果</h1>
            <p className="text-sm text-white/80 mt-1">
              {activity.title}
              {activity.eventStartTime && ` · ${formatDate(activity.eventStartTime)}`}
            </p>
          </div>
        </header>

        {/* 主内容 */}
        <div className="px-4 md:px-6 py-4">
          {matchError ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <AlertCircle size={36} className="mx-auto mb-3 text-orange-400" />
              <p className="text-sm text-gray-600 mb-2">{matchError}</p>
              <p className="text-xs text-gray-400">
                若活动方尚未完成匹配，请稍后再试
              </p>
            </div>
          ) : topMatches.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-accent-50 flex items-center justify-center">
                <Trophy size={24} className="text-accent-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">
                匹配结果暂未出炉
              </h3>
              <p className="text-sm text-gray-500">
                活动方正在为您寻找最合适的伙伴，请稍候
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-[28px] border border-gray-100 bg-white px-6 py-6 text-center shadow-sm">
                <h2 className="text-xl font-semibold text-gray-900">
                  你的匹配结果已生成
                </h2>
                <p className="mt-3 text-sm leading-6 text-gray-500">
                  太棒了！系统基于你的报名信息，在本次活动中找到了
                  <span className="mx-1 font-semibold text-accent-500">
                    {topMatches.length}
                  </span>
                  位值得认识的伙伴，可以从共同话题开始交流。
                </p>
              </section>

              <div className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <Sparkles size={18} className="text-accent-500" />
                我的匹配小宇宙
              </div>

              <section className="rounded-2xl border border-dashed border-accent-200 bg-accent-50 px-5 py-4 text-sm leading-6 text-gray-600">
                <span className="font-medium text-accent-600">系统匹配通告：</span>
                系统按活动方设置的规则整理了推荐对象，可从匹配依据中的共同话题开始交流。
              </section>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleMatches.map((user) => (
                  <MatchUniverseCard
                    key={user.id}
                    activityId={id!}
                    user={user}
                    expanded={expandedUserId === user.id}
                    matchMessage={matchMessages[user.id]}
                    loadingMessageUserId={loadingMessageUserId}
                    onToggle={toggleExpandedCard}
                    onViewMessage={handleViewMessage}
                    onViewDetail={handleNavigateToDetail}
                  />
                ))}
              </div>

              {topMatches.length > 3 ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    aria-expanded={showAllMatches}
                    onClick={() => setShowAllMatches((current) => !current)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:border-accent-200 hover:text-accent-600"
                  >
                    {showAllMatches
                      ? "收起推荐"
                      : `查看全部 ${topMatches.length} 位`}
                    {showAllMatches ? (
                      <ChevronUp size={16} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={16} aria-hidden="true" />
                    )}
                  </button>
                </div>
              ) : null}

              <section className="rounded-2xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  匹配是怎么来的？
                </h3>
                <div className="grid gap-3 md:grid-cols-3 text-sm text-gray-600">
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    系统会根据活动方配置的字段规则，结合你的报名信息与其他参与者做综合匹配。
                  </div>
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    结果页会按活动方设置的规则排列对象，帮助你快速找到值得先认识的人。
                  </div>
                  <div className="rounded-xl bg-gray-50 px-4 py-3">
                    匹配结果是辅助建议，不会公开敏感联系方式，是否进一步交流仍由你自己决定。
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="fixed bottom-mobile-tabbar left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-4 py-3 z-30">
          <div className="flex gap-3 max-w-lg mx-auto">
            <button
              onClick={() => navigate(`/u/activities/${id}`)}
              className="flex-1 h-12 rounded-[22px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
            >
              查看活动详情
            </button>
            {supportsNFC && (
              <button
                onClick={() => setShowNFCModal(true)}
          className="flex h-12 flex-nowrap items-center gap-2 whitespace-nowrap rounded-[22px] bg-gradient-to-r from-primary-400 to-primary-500 px-4 text-sm font-semibold text-white shadow-lg shadow-primary-400/30 transition-all hover:shadow-xl active:scale-[0.98] [&>svg]:shrink-0"
              >
                <Smartphone size={18} />
                NFC 碰一碰
              </button>
            )}
          </div>
        </div>

        {/* NFC 弹窗 */}
        <NFCTouchModal
          open={showNFCModal}
          onClose={() => setShowNFCModal(false)}
          activityId={id}
        />
      </div>
    </UserLayout>
  );
};

export default UserMatchResult;
