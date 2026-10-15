/**
 * 匹配结果 Tab（per-user top5 视图）
 *
 * 后端每个参与者对应一条 best_matches 记录：{ user_id, best_match_users[5] }
 * 这里按参与者维度展示：左侧为本人信息，右侧并排显示其 top5 候选，支持展开查看详细排序
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Info,
  History,
  HelpCircle,
  Search,
  AlertCircle,
  Pencil,
  LockKeyhole,
  ShieldCheck,
  FilePenLine,
  X,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { UserHoverCard } from "@/components/business/UserHoverCard";
import type { UserBrief } from "@/components/business/UserHoverCard";
import {
  PublishResultDialog,
  PublishResultFeedback,
  type NotificationConfig,
  type ParticipantPreview,
  type MatchGroupStats,
} from "../PublishResultDialog";
import { MatchingHistoryPanel } from "../MatchingHistoryPanel";
import { HistoryDetailDialog } from "../HistoryDetailDialog";
import ManualMatchEditor from "../ManualMatchEditor";
import PrivateEnrollmentImageGallery from "@/components/enrollment/PrivateEnrollmentImageGallery";
import { prefetchEnrollmentImages } from "@/features/enrollment/hooks/useEnrollmentImages";
import { useAuthStore } from "@/features/auth/stores";
import type {
  MatchConstraints,
  MatchingRule,
  MatchingHistory,
  ParticipantMatchResult,
  MatchResultState,
  MatchValidationResult,
} from "../../types";
import {
  buildParticipantResultRows,
  getCollapsedMatchPreview,
  shouldShowMatchListToggle,
  sortParticipantResultRows,
} from "./resultViewModel";
import type {
  CandidateMatchView,
  ParticipantResultSort,
  ResultParticipant,
} from "./resultViewModel";

type MatchRule = MatchingRule;
type Participant = ResultParticipant;

interface ResultsTabProps {
  activityId: string;
  /** per-user top5 记录 */
  matchResults: ParticipantMatchResult[];
  /** 参与者完整列表（用于渲染本人和 top5 候选的详细信息） */
  participants: Participant[];
  /** 当前规则下实际参与匹配的人数，用于展示结果覆盖率 */
  eligibleParticipantCount?: number;
  rules: MatchRule[];
  isPublishing: boolean;
  onPublish: (
    sendNotification?: boolean,
    notificationConfig?: NotificationConfig,
  ) => Promise<void | { success: boolean; error?: string }>;
  /** 切回规则 Tab 进行重新匹配 */
  onRematch: () => void | Promise<void>;
  isRematching: boolean;
  history?: MatchingHistory[];
  currentHistoryId?: string | null;
  constraints: MatchConstraints;
  onResultsChanged: () => Promise<void> | void;
  readOnly?: boolean;
  actionsDisabled?: boolean;
  resultState?: MatchResultState;
  resultVersion?: number;
  matchStatusId?: string;
  validationResult?: MatchValidationResult | null;
  isValidating?: boolean;
  isCreatingAdjustmentDraft?: boolean;
  onValidate?: () => Promise<MatchValidationResult | void>;
  onCreateAdjustmentDraft?: () => Promise<unknown>;
}

/** 把 Participant 映射成 UserHoverCard 需要的 UserBrief */
const toUserBrief = (
  p: Participant | undefined,
  fallbackId = "",
): UserBrief => ({
  id: p?.id || fallbackId,
  name: p?.name || fallbackId.slice(0, 8) || "未知用户",
  avatar: p?.avatar,
  role: p?.occupation,
  occupation: p?.occupation,
  city: p?.city,
  tags: p?.tags,
  gender:
    p?.gender === "男" || p?.gender === "male"
      ? "male"
      : p?.gender === "女" || p?.gender === "female"
        ? "female"
        : p?.gender
          ? "other"
          : undefined,
  age: p?.age,
  company: p?.company,
  industry: p?.industry,
  bio: p?.bio,
});

const getParticipantTags = (participant?: Participant): string[] => {
  if (!participant?.tags) return [];
  return participant.tags
    .map((tag) => String(tag).trim())
    .filter(Boolean);
};

const getParticipantMeta = (participant?: Participant): string => {
  if (!participant) return "";

  const tagText = getParticipantTags(participant).slice(0, 3).join("、");
  if (tagText) return tagText;

  return [
    participant.occupation,
    participant.industry,
    participant.company,
    participant.city,
    participant.registrationTypeName,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
};

/** 头像色块（无头像时的回退） */
const Avatar: React.FC<{ participant?: Participant; size?: "sm" | "md" | "lg" }> = ({
  participant,
  size = "md",
}) => {
  const sizeCls =
    size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-10 h-10 text-sm";
  const bg =
    participant?.gender === "male" || participant?.gender === "男"
      ? "bg-blue-100 text-blue-600"
      : participant?.gender === "female" || participant?.gender === "女"
        ? "bg-pink-100 text-pink-600"
        : "bg-gray-100 text-gray-600";

  if (participant?.avatar) {
    return (
      <img
        src={participant.avatar}
        alt={participant.name}
        loading="lazy"
        decoding="async"
        className={`${sizeCls} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${sizeCls} ${bg} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}
      title={participant?.name}
    >
      {participant?.name?.charAt(0) || "?"}
    </div>
  );
};

const LOW_MATCH_THRESHOLD = 40;
const PAGE_SIZE = 15;

const getEnrollmentImageCount = (participant?: Participant): number =>
  Math.max(0, Number(participant?.imageCount) || 0);

const EnrollmentImageCountBadge: React.FC<{ participant?: Participant }> = ({
  participant,
}) => {
  const imageCount = getEnrollmentImageCount(participant);
  if (!imageCount || !participant?.enrollmentId) return null;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600"
      title={`${imageCount} 张报名图片`}
      aria-label={`${imageCount} 张报名图片`}
    >
      <ImageIcon size={11} aria-hidden="true" />
      {imageCount}
    </span>
  );
};

interface ParticipantHoverPreviewProps {
  activityId: string;
  participant?: Participant;
  fallbackId: string;
  children: React.ReactNode;
  className?: string;
  onViewProfile: (userId: string) => void;
  onOpenFullGallery: (participant: Participant) => void;
}

const ParticipantHoverPreview: React.FC<ParticipantHoverPreviewProps> = ({
  activityId,
  participant,
  fallbackId,
  children,
  className,
  onViewProfile,
  onOpenFullGallery,
}) => {
  const queryClient = useQueryClient();
  const sessionScope = useAuthStore(
    (state) => state.user?.id || "anonymous",
  );
  const participantName =
    participant?.name || fallbackId.slice(0, 8) || "未知用户";
  const imageCount = getEnrollmentImageCount(participant);
  const enrollmentId = participant?.enrollmentId;
  const canPreviewImages = Boolean(imageCount && enrollmentId);

  const handlePrefetch = useCallback(() => {
    if (!enrollmentId || !canPreviewImages) return;
    return prefetchEnrollmentImages(
      queryClient,
      sessionScope,
      activityId,
      enrollmentId,
      { contentLimit: 4 },
    );
  }, [
    activityId,
    canPreviewImages,
    enrollmentId,
    queryClient,
    sessionScope,
  ]);

  const handleOpenFullGallery = useCallback(() => {
    if (participant) onOpenFullGallery(participant);
  }, [onOpenFullGallery, participant]);

  const detailsSlot =
    canPreviewImages && enrollmentId ? (
      <PrivateEnrollmentImageGallery
        activityId={activityId}
        participantId={enrollmentId}
        variant="embedded"
        maxImages={4}
        onOpenFullGallery={handleOpenFullGallery}
      />
    ) : undefined;

  return (
    <UserHoverCard
      user={toUserBrief(participant, fallbackId)}
      placement="bottom"
      focusable
      onViewProfile={onViewProfile}
      onPrefetch={canPreviewImages ? handlePrefetch : undefined}
      detailsSlot={detailsSlot}
      triggerAriaLabel={
        canPreviewImages
          ? `查看${participantName}的资料和 ${imageCount} 张报名图片`
          : `查看${participantName}的资料`
      }
      className={className}
    >
      {children}
    </UserHoverCard>
  );
};

interface RecommendationParticipantItemProps {
  activityId: string;
  match: CandidateMatchView;
  variant: "compact" | "expanded";
  onViewProfile: (userId: string) => void;
  onOpenFullGallery: (participant: Participant) => void;
}

const RecommendationParticipantItem = memo(
  ({
    activityId,
    match,
    variant,
    onViewProfile,
    onOpenFullGallery,
  }: RecommendationParticipantItemProps) => {
    const candidate = match.candidate;
    const participantName =
      candidate?.name || match.candidateId.slice(0, 8);

    return (
      <ParticipantHoverPreview
        activityId={activityId}
        participant={candidate}
        fallbackId={match.candidateId}
        onViewProfile={onViewProfile}
        onOpenFullGallery={onOpenFullGallery}
        className="group w-full rounded-xl focus:outline-none"
      >
        {variant === "compact" ? (
          <div className="flex min-h-16 min-w-0 items-center gap-2 rounded-xl border border-transparent bg-gray-50 px-2.5 py-2 transition-colors group-hover:border-primary-200 group-hover:bg-primary-50 group-focus-visible:border-primary-300 group-focus-visible:bg-primary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-200">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-primary-600 shadow-sm">
              {match.rank}
            </span>
            <Avatar participant={candidate} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-xs font-semibold text-gray-800">
                  {participantName}
                </p>
                {match.supplementary && (
                  <span className="shrink-0 text-[10px] text-gray-500">补充推荐</span>
                )}
                {match.reciprocalRank != null && (
                  <span
                    className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                    title={`双方互荐 · 对方第 ${match.reciprocalRank} 位`}
                  >
                    互荐
                  </span>
                )}
              </div>
              {getParticipantMeta(candidate) && (
                <p
                  className="mt-0.5 truncate text-[11px] text-gray-500"
                  title={getParticipantMeta(candidate)}
                >
                  {getParticipantMeta(candidate)}
                </p>
              )}
            </div>
            <EnrollmentImageCountBadge participant={candidate} />
          </div>
        ) : (
          <article className="flex h-[76px] min-w-0 items-center gap-2.5 rounded-xl border border-primary-100 bg-white px-3 py-2.5 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:border-primary-300 group-hover:shadow-md group-focus-visible:border-primary-400 group-focus-visible:ring-2 group-focus-visible:ring-primary-200">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700">
              {match.rank}
            </span>
            <Avatar participant={candidate} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {participantName}
                </p>
                {match.supplementary && (
                  <span className="shrink-0 text-[10px] text-gray-500">补充推荐</span>
                )}
                {match.reciprocalRank != null && (
                  <span
                    className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                    title={`双方互荐 · 对方第 ${match.reciprocalRank} 位`}
                  >
                    双方
                  </span>
                )}
              </div>
              {getParticipantMeta(candidate) && (
                <p
                  className="mt-0.5 truncate text-xs text-gray-500"
                  title={getParticipantMeta(candidate)}
                >
                  {getParticipantMeta(candidate)}
                </p>
              )}
            </div>
            <EnrollmentImageCountBadge participant={candidate} />
          </article>
        )}
      </ParticipantHoverPreview>
    );
  },
);

RecommendationParticipantItem.displayName = "RecommendationParticipantItem";

const getParticipantSearchText = (participant?: Participant): string =>
  [
    participant?.name,
    participant?.occupation,
    participant?.industry,
    participant?.company,
    participant?.city,
    participant?.registrationTypeName,
    ...(participant?.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const ResultsTab: React.FC<ResultsTabProps> = ({
  activityId,
  matchResults,
  participants,
  eligibleParticipantCount,
  isPublishing,
  onPublish,
  onRematch,
  isRematching,
  history = [],
  currentHistoryId = null,
  constraints,
  onResultsChanged,
  readOnly = false,
  actionsDisabled = false,
  resultState,
  resultVersion,
  matchStatusId,
  validationResult,
  isValidating = false,
  isCreatingAdjustmentDraft = false,
  onValidate,
  onCreateAdjustmentDraft,
}) => {
  const navigate = useNavigate();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [resultSort, setResultSort] =
    useState<ParticipantResultSort>("score-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showHistoryDetailDialog, setShowHistoryDetailDialog] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<MatchingHistory | null>(null);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [imageViewer, setImageViewer] = useState<Participant | null>(null);
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    success: boolean;
    error?: string;
  } | null>(null);

  // 参与者 ID → Participant 查找表
  const participantMap = useMemo(() => {
    const m = new Map<string, Participant>();
    for (const p of participants) m.set(p.id, p);
    return m;
  }, [participants]);

  const resultRecordMap = useMemo(
    () => new Map(matchResults.map((record) => [record.userId, record])),
    [matchResults],
  );

  const validationIssueMap = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const issue of validationResult?.issues || []) {
      if (!issue.userId) continue;
      const messages = grouped.get(issue.userId) || [];
      if (!messages.includes(issue.message)) {
        messages.push(issue.message);
      }
      grouped.set(issue.userId, messages);
    }
    return grouped;
  }, [validationResult?.issues]);

  const participantResultRows = useMemo(
    () =>
      buildParticipantResultRows({
        matchResults,
        participantMap,
        validationIssueMap,
        lowMatchThreshold: LOW_MATCH_THRESHOLD,
      }),
    [matchResults, participantMap, validationIssueMap],
  );

  const attentionCount = useMemo(
    () =>
      participantResultRows.filter(
        (row) => row.hasConflict || row.hasNoMatches || row.isLowMatch,
      ).length,
    [participantResultRows],
  );

  const filteredAndSortedRows = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const filtered = participantResultRows.filter((row) => {
      return (
        !keyword ||
        getParticipantSearchText(row.owner).includes(keyword) ||
        row.matches.some((match) =>
          getParticipantSearchText(match.candidate).includes(keyword),
        )
      );
    });

    return sortParticipantResultRows(filtered, resultSort);
  }, [participantResultRows, resultSort, searchKeyword]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAndSortedRows.length / PAGE_SIZE),
  );
  const currentPageSafe = Math.min(currentPage, totalPages);
  const pagedParticipantRows = useMemo(
    () =>
      filteredAndSortedRows.slice(
        (currentPageSafe - 1) * PAGE_SIZE,
        currentPageSafe * PAGE_SIZE,
      ),
    [currentPageSafe, filteredAndSortedRows],
  );

  const coverageTotal = Math.max(
    resultRecordMap.size,
    eligibleParticipantCount ??
      validationResult?.summary.eligibleParticipants ??
      resultRecordMap.size,
  );

  const visibleRecommendationCount = useMemo(
    () =>
      filteredAndSortedRows.reduce(
        (count, row) => count + row.matches.length,
        0,
      ),
    [filteredAndSortedRows],
  );

  const toggleOwnerDetails = (ownerId: string) => {
    setExpandedOwnerId((current) => (current === ownerId ? null : ownerId));
  };

  // 跳转到用户主页：同标签跳，保证返回按钮可用
  const handleViewProfile = useCallback(
    (userId: string) => {
      if (!userId) return;
      const fallbackName = participantMap.get(userId)?.name;
      const qs = new URLSearchParams();
      if (fallbackName) qs.set("fallbackName", fallbackName);
      navigate(`/u/profile/${userId}${qs.toString() ? `?${qs}` : ""}`);
    },
    [navigate, participantMap],
  );

  const handleOpenEnrollmentImages = useCallback(
    (participant: Participant) => setImageViewer(participant),
    [],
  );

  // 发布
  const handlePublishClick = async (
    sendNotification?: boolean,
    notificationConfig?: NotificationConfig,
  ) => {
    const result = await onPublish(sendNotification, notificationConfig);
    if (result && typeof result === "object" && "success" in result) {
      setShowPublishDialog(false);
      setFeedback({
        visible: true,
        success: result.success,
        error: result.error,
      });
    } else {
      setShowPublishDialog(false);
      setFeedback({ visible: true, success: true });
    }
  };

  const focusIssueRows = () => {
    const sortedRows = sortParticipantResultRows(
      participantResultRows,
      resultSort,
    );
    const targetRow =
      sortedRows.find((row) => row.hasConflict) ||
      sortedRows.find((row) => row.hasNoMatches || row.isLowMatch);

    setSearchKeyword("");

    if (!targetRow) {
      setCurrentPage(1);
      window.requestAnimationFrame(() => {
        document
          .getElementById("matching-result-list")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }

    const targetIndex = sortedRows.findIndex(
      (row) => row.ownerId === targetRow.ownerId,
    );
    setCurrentPage(Math.floor(targetIndex / PAGE_SIZE) + 1);
    setExpandedOwnerId(
      shouldShowMatchListToggle(targetRow.matches.length)
        ? targetRow.ownerId
        : null,
    );

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const targetElement = document.getElementById(
          `matching-result-${targetRow.ownerId}`,
        );
        targetElement?.scrollIntoView({ behavior: "smooth", block: "center" });
        targetElement?.focus({ preventScroll: true });
      });
    });
  };

  const handlePrimaryAction = async () => {
    if (resultState === "published") {
      await onCreateAdjustmentDraft?.();
      return;
    }

    if (validationResult?.valid) {
      setShowPublishDialog(true);
      return;
    }

    if (validationResult && !validationResult.valid) {
      focusIssueRows();
      return;
    }

    const validation = await onValidate?.();
    if (validation && validation.valid) {
      setShowPublishDialog(true);
    } else if (validation) {
      focusIssueRows();
    }
  };

  const participantPreviews: ParticipantPreview[] = useMemo(
    () =>
      matchResults.map((r) => {
        const p = participantMap.get(r.userId);
        return {
          id: r.userId,
          enrollmentId: p?.enrollmentId,
          name: p?.name || r.userId.slice(0, 6),
          avatar: p?.avatar,
        } as ParticipantPreview;
      }),
    [matchResults, participantMap],
  );

  // 发布对话框需要 MatchGroupStats 结构，这里按"每个参与者一条记录"的形式合成
  const publishGroupStats: MatchGroupStats[] = useMemo(
    () =>
      matchResults.map((r) => ({
        id: r.id,
        name: participantMap.get(r.userId)?.name,
        members: [r.userId, ...r.bestMatchUserIds],
        isLocked: false,
      })),
    [matchResults, participantMap],
  );

  // 空状态
  if (matchResults.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 md:p-10 text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gray-50 flex items-center justify-center">
          <Info size={24} className="text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">暂无匹配结果</h3>
        <p className="text-sm text-gray-500 mb-4">
          请先在"规则设置"中配置规则并执行匹配
        </p>
        <Button
          size="small"
          variant="light"
          onClick={() => void onRematch()}
          loading={isRematching}
        >
          修改匹配设置
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-sm md:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                匹配结果
              </h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  currentHistoryId
                    ? "bg-amber-50 text-amber-700"
                    : resultState === "published"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-blue-50 text-blue-700"
                }`}
              >
                {currentHistoryId
                  ? `历史版本 v${resultVersion || 1}`
                  : resultState === "published"
                    ? `已发布 v${resultVersion || 1}`
                    : `草稿 v${resultVersion || 1}`}
              </span>
              {validationResult?.valid &&
                resultState !== "published" &&
                !currentHistoryId && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    校验通过
                  </span>
                )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>
                覆盖 {resultRecordMap.size}/{coverageTotal} 位参与者
              </span>
              {attentionCount > 0 && (
                <span className="font-medium text-orange-600">
                  {attentionCount} 位需关注
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              aria-label="查看匹配结果说明"
              title="结果说明"
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <HelpCircle size={18} />
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistoryPanel(true)}
                aria-label="查看历史匹配记录"
                title="历史记录"
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <History size={18} />
              </button>
            )}
            {!currentHistoryId && matchStatusId && (
              <Button
                size="small"
                variant="light"
                icon={<Download size={15} />}
                onClick={() => navigate(`/dashboard/activity/${activityId}/matching/export`)}
              >
                导出结果
              </Button>
            )}
            <Button
              size="small"
              variant="light"
              onClick={() => void onRematch()}
              loading={isRematching}
              className="flex-1 sm:flex-none"
            >
              修改匹配设置
            </Button>
            {!currentHistoryId && (
              <Button
                size="small"
                onClick={() => void handlePrimaryAction()}
                disabled={actionsDisabled}
                loading={
                  resultState === "published"
                    ? isCreatingAdjustmentDraft
                    : isValidating || isPublishing
                }
                icon={
                  resultState === "published" ? (
                    <FilePenLine size={16} />
                  ) : validationResult?.valid ? (
                    <Send size={16} />
                  ) : validationResult ? (
                    <AlertCircle size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )
                }
                className="min-w-32 flex-1 sm:flex-none"
              >
                {resultState === "published"
                  ? "创建调整草稿"
                  : validationResult?.valid
                    ? "发布结果"
                    : validationResult
                      ? `处理 ${validationResult.summary.issueCount} 个问题`
                      : "校验并发布"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {currentHistoryId && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Info size={16} className="shrink-0" />
          <span>当前为只读历史版本。</span>
        </div>
      )}

      {!currentHistoryId &&
        resultState !== "published" &&
        validationResult &&
        !validationResult.valid && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>
              校验未通过：{validationResult.summary.issueCount} 个问题需要处理。
            </span>
            <button
              type="button"
              disabled={isValidating}
              onClick={() => void onValidate?.()}
              className="shrink-0 font-medium underline-offset-2 hover:underline disabled:opacity-50"
            >
              {isValidating ? "校验中…" : "重新校验"}
            </button>
          </div>
        )}

      {/* 搜索与排序 */}
      <section className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={searchKeyword}
              onChange={(event) => {
                setSearchKeyword(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="搜索参与者或推荐对象"
              aria-label="搜索参与者或推荐对象"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30"
            />
          </div>
          <select
            aria-label="排序方式"
            value={resultSort}
            onChange={(event) => {
              setResultSort(event.target.value as ParticipantResultSort);
              setCurrentPage(1);
            }}
            className="w-full shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 sm:w-36"
          >
            <option value="score-desc">高匹配优先</option>
            <option value="score-asc">低匹配优先</option>
            <option value="name">按姓名</option>
          </select>
        </div>
      </section>

      <section
        id="matching-result-list"
        className="scroll-mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
      >
        <h3 className="sr-only">参与者匹配名单</h3>
        <div className="hidden grid-cols-[220px_minmax(0,1fr)_220px] gap-4 border-b border-gray-100 bg-gray-50 px-4 py-3 text-xs font-medium text-gray-500 lg:grid">
          <span>参与者</span>
          <span>优先推荐对象</span>
          <span className="text-right">操作</span>
        </div>

        {pagedParticipantRows.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {pagedParticipantRows.map((row) => {
              const canExpand = shouldShowMatchListToggle(row.matches.length);
              const expanded = canExpand && expandedOwnerId === row.ownerId;
              const previewMatches = getCollapsedMatchPreview(row.matches);
              const hiddenMatchCount =
                row.matches.length - previewMatches.length;
              return (
                <li
                  key={row.id}
                  id={`matching-result-${row.ownerId}`}
                  tabIndex={-1}
                  className={`group/result-row relative scroll-mt-4 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-300 ${
                    expanded
                      ? "bg-primary-50/60 hover:bg-primary-50/80"
                      : "bg-white hover:bg-primary-50/40"
                  }`}
                >
                  {expanded && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 z-10 w-1 bg-primary-500"
                    />
                  )}
                  <div className="grid gap-4 px-4 py-4 lg:grid-cols-[220px_minmax(0,1fr)_220px] lg:items-center">
                    <div className="min-w-0">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 lg:hidden">
                        参与者
                      </p>
                      <ParticipantHoverPreview
                        activityId={activityId}
                        participant={row.owner}
                        fallbackId={row.ownerId}
                        onViewProfile={handleViewProfile}
                        onOpenFullGallery={handleOpenEnrollmentImages}
                        className="group w-full rounded-xl focus:outline-none"
                      >
                        <div className="flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-colors group-hover:border-primary-200 group-hover:bg-primary-50 group-focus-visible:border-primary-300 group-focus-visible:bg-primary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-200">
                          <Avatar participant={row.owner} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {row.owner?.name || row.ownerId.slice(0, 8)}
                            </p>
                            {getParticipantMeta(row.owner) && (
                              <p className="mt-0.5 truncate text-xs text-gray-500">
                                {getParticipantMeta(row.owner)}
                              </p>
                            )}
                            {(row.hasConflict ||
                              row.hasNoMatches ||
                              row.isLowMatch) && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {row.hasConflict && (
                                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                    有冲突
                                  </span>
                                )}
                                {row.hasNoMatches && (
                                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                    无结果
                                  </span>
                                )}
                                {row.isLowMatch && (
                                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                    低匹配
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <EnrollmentImageCountBadge participant={row.owner} />
                        </div>
                      </ParticipantHoverPreview>
                    </div>

                    {!expanded && (
                      <div className="min-w-0">
                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 lg:hidden">
                          优先推荐对象
                        </p>
                        {row.matches.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {previewMatches.map((match) => (
                              <RecommendationParticipantItem
                                key={match.id}
                                activityId={activityId}
                                match={match}
                                variant="compact"
                                onViewProfile={handleViewProfile}
                                onOpenFullGallery={
                                  handleOpenEnrollmentImages
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-700">
                            暂无推荐对象，需要人工补充名单。
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 lg:col-start-3">
                      {!readOnly && !actionsDisabled && !currentHistoryId && row.owner && (
                        <button
                          type="button"
                          onClick={() => setEditingOwnerId(row.ownerId)}
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-primary-200 px-2.5 py-2 text-xs font-medium text-primary-600 transition-all hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 lg:pointer-events-none lg:flex-none lg:translate-x-1 lg:opacity-0 lg:group-hover/result-row:pointer-events-auto lg:group-hover/result-row:translate-x-0 lg:group-hover/result-row:opacity-100 lg:focus-visible:pointer-events-auto lg:focus-visible:translate-x-0 lg:focus-visible:opacity-100"
                        >
                          {row.isLocked ? (
                            <LockKeyhole size={13} />
                          ) : (
                            <Pencil size={13} />
                          )}
                          {row.isLocked
                            ? "查看或解锁"
                            : row.hasNoMatches
                              ? "补充名单"
                              : "调整名单"}
                        </button>
                      )}
                      {canExpand && (
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={`match-details-${row.ownerId}`}
                          aria-label={
                            expanded
                              ? `收起${
                                  row.owner?.name || "该参与者"
                                }的推荐名单`
                              : `展开${
                                  row.owner?.name || "该参与者"
                                }其余 ${hiddenMatchCount} 位推荐对象`
                          }
                          title={
                            expanded
                              ? "收起名单"
                              : `展开其余 ${hiddenMatchCount} 人`
                          }
                          onClick={() => toggleOwnerDetails(row.ownerId)}
                          className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
                            expanded
                              ? "border-primary-200 bg-white text-primary-600 hover:bg-primary-50"
                              : "border-gray-200 bg-white text-gray-600 hover:border-primary-300 hover:text-primary-600"
                          }`}
                        >
                          {expanded ? (
                            <>
                              <span>收起名单</span>
                              <ChevronUp size={16} aria-hidden="true" />
                            </>
                          ) : (
                            <>
                              <span>展开其余 {hiddenMatchCount} 人</span>
                              <ChevronDown size={16} aria-hidden="true" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded && canExpand && (
                    <div
                      id={`match-details-${row.ownerId}`}
                      role="region"
                      aria-label={`${row.owner?.name || "该参与者"}的推荐对象`}
                      className="border-t border-primary-100 bg-primary-50/60 px-4 pb-4 pt-3"
                    >
                      {row.issues.length > 0 && (
                        <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
                          {row.issues.join("；")}
                        </div>
                      )}

                      {row.matches.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                          {row.matches.map((match) => (
                            <RecommendationParticipantItem
                              key={match.id}
                              activityId={activityId}
                              match={match}
                              variant="expanded"
                              onViewProfile={handleViewProfile}
                              onOpenFullGallery={
                                handleOpenEnrollmentImages
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-white py-8 text-center text-sm text-gray-500">
                          暂无推荐对象，可通过“补充名单”手动添加。
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="py-12 text-center">
            <Search size={22} className="mx-auto text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">没有符合当前条件的参与者</p>
            <button
              type="button"
              onClick={() => {
                setSearchKeyword("");
                setCurrentPage(1);
              }}
              className="mt-2 text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              清除搜索
            </button>
          </div>
        )}

        {filteredAndSortedRows.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="text-gray-500">
              共 {filteredAndSortedRows.length} 名参与者 · {visibleRecommendationCount} 条推荐
            </span>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={currentPageSafe <= 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <span className="text-gray-500">
                  第 {currentPageSafe} / {totalPages} 页
                </span>
                <label className="flex items-center gap-2 text-gray-500">
                  <span className="sr-only">跳转页码</span>
                  <select
                    value={currentPageSafe}
                    onChange={(event) => setCurrentPage(Number(event.target.value))}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30"
                  >
                    {Array.from(
                      { length: totalPages },
                      (_, index) => index + 1,
                    ).map((page) => (
                      <option key={page} value={page}>
                        第 {page} 页
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={currentPageSafe >= totalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <Modal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        title="匹配结果说明"
        width="medium"
      >
        <div className="space-y-3 text-sm leading-6 text-gray-600">
          <p>
            系统会为每位参与者独立生成一份有序推荐名单，顺序与用户侧一致。
          </p>
          <p>
            “双方互荐”表示两人都进入了对方名单；单向推荐仍是有效结果。
          </p>
        </div>
      </Modal>

      {/* 历史面板（内嵌，非模态） */}
      {showHistoryPanel && (
        <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center p-0 md:p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowHistoryPanel(false)}
          />
          <div className="relative w-full max-w-2xl max-h-[80vh] bg-white rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-base font-semibold">历史匹配记录</h3>
              <button
                type="button"
                onClick={() => setShowHistoryPanel(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                关闭
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <MatchingHistoryPanel
                history={history}
                currentHistoryId={currentHistoryId ?? undefined}
                onViewHistory={(h) => {
                  setViewingHistory(h);
                  setShowHistoryDetailDialog(true);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 历史详情 */}
      {showHistoryDetailDialog && viewingHistory && (
        <HistoryDetailDialog
          historyItem={viewingHistory}
          visible={showHistoryDetailDialog}
          participants={participants.map((p) => ({
            id: p.id,
            name: p.name,
            gender:
              p.gender === "男" || p.gender === "male"
                ? "male"
                : p.gender === "女" || p.gender === "female"
                  ? "female"
                  : undefined,
            industry: p.industry,
            occupation: p.occupation,
          }))}
          onClose={() => setShowHistoryDetailDialog(false)}
        />
      )}

      {/* 发布对话框 */}
      <PublishResultDialog
        visible={showPublishDialog}
        groups={publishGroupStats}
        participantCount={matchResults.length}
        participants={participantPreviews}
        onConfirm={handlePublishClick}
        onCancel={() => setShowPublishDialog(false)}
        isLoading={isPublishing}
      />

      {!currentHistoryId &&
        editingOwnerId &&
        participantMap.get(editingOwnerId) && (
          <ManualMatchEditor
            open
            activityId={activityId}
            source={participantMap.get(editingOwnerId)!}
            initialCandidateIds={
              matchResults.find((result) => result.userId === editingOwnerId)
                ?.bestMatchUserIds || []
            }
            participants={participants}
            constraints={constraints}
            onClose={() => setEditingOwnerId(null)}
            onSaved={onResultsChanged}
          />
        )}

      {imageViewer?.enrollmentId && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/45 p-4" onClick={() => setImageViewer(null)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{imageViewer.name} 的报名图片</h3>
                <p className="mt-1 text-xs text-gray-500">仅本活动主办方可见</p>
              </div>
              <button type="button" onClick={() => setImageViewer(null)} className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <PrivateEnrollmentImageGallery activityId={activityId} participantId={imageViewer.enrollmentId} />
          </div>
        </div>
      )}

      {/* 发布反馈 */}
      {feedback && (
        <PublishResultFeedback
          visible={feedback.visible}
          success={feedback.success}
          errorMessage={feedback.error}
          onClose={() => setFeedback(null)}
        />
      )}
    </div>
  );
};

export default ResultsTab;
