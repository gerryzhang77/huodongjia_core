import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  MapPin,
  MoreHorizontal,
  QrCode,
  Settings,
  Users,
} from "lucide-react";
import { ActionSheet, Dialog } from "antd-mobile";
import dayjs from "dayjs";
import { MerchantLayout } from "@/components/layout";
import { Button } from "@/components/ui";
import { Toast } from "@/components/ui/Toast";
import {
  ParticipantAvatar,
  type ParticipantInfo,
} from "@/components/business/ParticipantAvatar";
import { ImageCarousel } from "@/components/business/ImageCarousel";
import { RegistrationQrModal } from "@/components/enrollment";
import { useActivityDetail } from "@/features/activities/hooks/useActivityDetail";
import { parseRequirements } from "@/features/activities/components/ActivityForm/RequirementListEditor";
import {
  getCategoryLabel,
  getTagLabel,
} from "@/features/activities/utils/constants";
import { getEnrollmentsDetailed } from "@/features/enrollment/services/enrollmentApi";
import {
  merchantCacheTimes,
  merchantQueryKeys,
} from "@/features/merchant/queryKeys";
import { cancelActivity as cancelOrganizerActivity } from "@/services/activityApi";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";

type DetailTab = "info" | "participants";
const PAGE_SIZE = 10;

const normalizeUtc = (value: string) =>
  value.includes("+") || value.endsWith("Z") ? value : `${value}Z`;
const formatDate = (value?: string) =>
  value ? dayjs(normalizeUtc(value)).format("M月D日 HH:mm") : "待定";
const formatDateTime = (value?: string) =>
  value ? dayjs(normalizeUtc(value)).format("YYYY年M月D日 HH:mm") : "—";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  draft: { label: "草稿", className: "bg-gray-100 text-gray-600" },
  published: { label: "已发布", className: "bg-blue-50 text-blue-700" },
  recruiting: { label: "报名中", className: "bg-emerald-50 text-emerald-700" },
  recruiting_ended: { label: "报名结束", className: "bg-amber-50 text-amber-700" },
  full: { label: "已满员", className: "bg-amber-50 text-amber-700" },
  ongoing: { label: "进行中", className: "bg-blue-50 text-blue-700" },
  ended: { label: "已结束", className: "bg-gray-100 text-gray-600" },
  completed: { label: "已结束", className: "bg-gray-100 text-gray-600" },
  cancelled: { label: "已取消", className: "bg-red-50 text-red-700" },
};

const preloadEnrollmentRoute = () =>
  import("@/pages/merchant/EnrollmentManagementNew");
const preloadMatchingRoute = () => import("@/pages/merchant/MatchingConfig");
const preloadEditRoute = () => import("@/pages/merchant/ActivityEditNew");

const ActivityDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activity, loading, error } = useActivityDetail(id);
  const [showQrModal, setShowQrModal] = useState(false);
  const participantListRef = useRef<HTMLDivElement>(null);

  const activeTab: DetailTab =
    searchParams.get("tab") === "participants" ? "participants" : "info";
  const participantStatus = searchParams.get("status") || undefined;
  const parsedPage = Number(searchParams.get("page"));
  const participantPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const participantsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.enrollmentList(id),
      "detail-preview",
      participantStatus || "all",
      participantPage,
    ],
    queryFn: () =>
      getEnrollmentsDetailed(id!, {
        page: participantPage,
        pageSize: PAGE_SIZE,
        status: participantStatus,
      }),
    enabled: Boolean(id && activeTab === "participants"),
    staleTime: merchantCacheTimes.enrollmentStale,
    gcTime: merchantCacheTimes.enrollmentGc,
    placeholderData: (previous) => previous,
  });

  const participants = useMemo<ParticipantInfo[]>(
    () =>
      (participantsQuery.data?.enrollments || []).map((enrollment) => ({
        user_id: enrollment.userId || enrollment.id,
        name: enrollment.name,
        avatar: enrollment.avatar || undefined,
        gender: enrollment.gender,
        age: enrollment.age,
        occupation: enrollment.occupation,
        company: enrollment.company,
        city: enrollment.city,
        interests: enrollment.tags,
        status: (enrollment.status === "approved"
          ? "confirmed"
          : enrollment.status) as ParticipantInfo["status"],
        registration_time: enrollment.enrolledAt,
      })),
    [participantsQuery.data],
  );
  const participantsTotal =
    participantsQuery.data?.total ?? activity?.enrolledCount ?? 0;
  const status = activity
    ? STATUS_CONFIG[activity.status] || STATUS_CONFIG.draft
    : STATUS_CONFIG.draft;

  const updateView = (patch: {
    tab?: DetailTab;
    status?: string;
    page?: number;
  }) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (patch.tab) {
          if (patch.tab === "info") next.delete("tab");
          else next.set("tab", patch.tab);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "status")) {
          if (patch.status) next.set("status", patch.status);
          else next.delete("status");
        }
        if (Object.prototype.hasOwnProperty.call(patch, "page")) {
          if ((patch.page || 1) > 1) next.set("page", String(patch.page));
          else next.delete("page");
        }
        return next;
      },
      { replace: true },
    );
  };

  const prefetchEnrollmentData = () => {
    if (!id) return;
    void preloadEnrollmentRoute();
    void queryClient.prefetchQuery({
      queryKey: merchantQueryKeys.enrollmentList(id),
      queryFn: () => getEnrollmentsDetailed(id, { page: 1, pageSize: 1000 }),
      staleTime: merchantCacheTimes.enrollmentStale,
      gcTime: merchantCacheTimes.enrollmentGc,
    });
  };

  const handleMoreActions = () => {
    ActionSheet.show({
      actions: [
        {
          text: "发送通知",
          key: "notify",
          onClick: () =>
            navigate(`/dashboard/activity/${id}/enrollment`, {
              state: { returnTo: `/dashboard/activity/${id}/detail` },
            }),
        },
        {
          text: "取消活动",
          key: "cancel",
          danger: true,
          onClick: () => void handleCancelActivity(),
        },
      ],
      cancelText: "关闭",
    });
  };

  const handleCancelActivity = async () => {
    const confirmed = await Dialog.confirm({
      title: "取消活动？",
      content: "取消后参与者将无法继续报名，此操作不可恢复。",
      confirmText: "确认取消",
      cancelText: "暂不取消",
    });
    if (!confirmed || !id) return;
    try {
      const response = await cancelOrganizerActivity(id);
      if (!response.success) throw new Error(response.message || "取消失败");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.activity(id),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.activities(),
        }),
      ]);
      Toast.show({ icon: "success", content: "活动已取消" });
    } catch (cancelError) {
      Toast.show({
        icon: "fail",
        content:
          cancelError instanceof Error ? cancelError.message : "取消活动失败",
      });
    }
  };

  if (loading) {
    return (
      <MerchantLayout title="活动详情" showBack onBack={() => navigate("/dashboard")}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
            <p className="text-sm text-gray-500">正在加载活动详情...</p>
          </div>
        </div>
      </MerchantLayout>
    );
  }

  if (!activity || error) {
    return (
      <MerchantLayout title="活动详情" showBack onBack={() => navigate("/dashboard")}>
        <div className="flex min-h-[50vh] flex-col items-center justify-center">
          <AlertCircle size={40} className="mb-3 text-gray-300" />
          <p className="mb-4 text-sm text-gray-500">活动不存在或暂时无法读取</p>
          <Button onClick={() => navigate("/dashboard")}>返回活动列表</Button>
        </div>
      </MerchantLayout>
    );
  }

  const totalApplications =
    activity.totalApplications ?? activity.enrolledCount ?? participantsTotal;
  const occupiedParticipants =
    activity.occupiedParticipants ?? activity.enrolledCount ?? 0;
  const displayParticipantCount = getDisplayParticipantCount(activity, occupiedParticipants);
  const remainingParticipants = activity.capacity > 0
    ? activity.remainingParticipants ?? Math.max(0, activity.capacity - occupiedParticipants)
    : null;
  const participationRate = activity.capacity
    ? Math.round((displayParticipantCount / activity.capacity) * 100)
    : 0;
  const requirements = parseRequirements(activity.requirements || "");

  return (
    <MerchantLayout
      title="活动详情"
      showBack
      onBack={() => navigate("/dashboard")}
      fullWidth
      contentClassName="pb-24 lg:pb-8"
    >
      <main className="mx-auto max-w-6xl space-y-5 px-1 py-3 md:px-5 md:py-6">
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm lg:grid lg:h-[480px] lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <ImageCarousel
            images={
              activity.images?.length
                ? activity.images
                : activity.coverImage
                  ? [activity.coverImage]
                  : []
            }
            variant="organizer-detail"
            renderOverlay={() => (
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {activity.category && (
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-primary-700 backdrop-blur-sm">
                      {getCategoryLabel(activity.category)}
                    </span>
                  )}
                  {(activity.tags || []).slice(0, 3).map((tag) => (
                    <span key={tag} className="shrink-0 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-xs text-gray-700 backdrop-blur-sm">
                      {getTagLabel(tag)}
                    </span>
                  ))}
                </div>
                <span className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
            )}
          />
          <div className="flex min-w-0 flex-col p-5 md:p-6 lg:h-full lg:min-h-0 lg:overflow-hidden">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1
                  title={activity.title}
                  className="line-clamp-2 text-2xl font-bold leading-tight text-gray-900 md:text-3xl"
                >
                  {activity.title}
                </h1>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">
                  {activity.description || "暂无活动简介"}
                </p>
              </div>
              <button type="button" aria-label="更多活动操作" onClick={handleMoreActions} className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50">
                <MoreHorizontal size={19} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
              <div className="min-w-0 rounded-xl bg-primary-50 p-3 text-center">
                <p className="truncate whitespace-nowrap text-xl font-bold tabular-nums text-primary-600">{totalApplications}</p>
                <p className="mt-1 truncate whitespace-nowrap text-xs text-gray-500">累计报名</p>
              </div>
              <div className="min-w-0 rounded-xl bg-emerald-50 p-3 text-center">
                <p
                  className="break-all text-xl font-bold leading-tight tabular-nums text-emerald-600"
                  title={activity.capacity > 0 ? `${displayParticipantCount}/${activity.capacity}` : String(displayParticipantCount)}
                >
                  {activity.capacity > 0 ? `${displayParticipantCount}/${activity.capacity}` : displayParticipantCount}
                </p>
                <p className="mt-1 truncate whitespace-nowrap text-xs text-gray-500">名额占用</p>
              </div>
              <div className="min-w-0 rounded-xl bg-blue-50 p-3 text-center">
                <p className="truncate whitespace-nowrap text-xl font-bold tabular-nums text-blue-600">
                  {remainingParticipants === null ? "不限" : remainingParticipants}
                </p>
                <p className="mt-1 truncate whitespace-nowrap text-xs text-gray-500">剩余名额</p>
              </div>
              <div className="min-w-0 rounded-xl bg-orange-50 p-3 text-center">
                <p className="truncate whitespace-nowrap text-xl font-bold tabular-nums text-orange-600">{participationRate}%</p>
                <p className="mt-1 truncate whitespace-nowrap text-xs text-gray-500">报名进度</p>
              </div>
            </div>

            <dl className="mt-5 min-w-0 space-y-3 text-sm">
              <div className="flex min-w-0 gap-3">
                <Calendar size={17} className="mt-0.5 shrink-0 text-primary-500" />
                <div className="min-w-0 flex-1"><dt className="font-medium text-gray-900">活动时间</dt><dd className="mt-0.5 text-gray-500 lg:truncate">{formatDate(activity.activityStart)} – {formatDate(activity.activityEnd)}</dd></div>
              </div>
              <div className="flex min-w-0 gap-3">
                <Clock size={17} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1"><dt className="font-medium text-gray-900">报名时间</dt><dd className="mt-0.5 text-gray-500 lg:truncate">{formatDate(activity.registrationStart)} – {formatDate(activity.registrationEnd)}</dd></div>
              </div>
              <div className="flex min-w-0 gap-3">
                <MapPin size={17} className="mt-0.5 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1"><dt className="font-medium text-gray-900">活动地点</dt><dd className="mt-0.5 text-gray-500 lg:truncate" title={activity.location || "待定"}>{activity.location || "待定"}</dd></div>
              </div>
            </dl>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" onPointerEnter={() => void preloadEditRoute()} onFocus={() => void preloadEditRoute()} onClick={() => navigate(`/dashboard/activity/${id}/edit`)} className="flex min-w-0 flex-nowrap items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gray-50 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"><Edit3 size={17} className="shrink-0 text-primary-500" />编辑活动</button>
            <button type="button" onPointerEnter={prefetchEnrollmentData} onFocus={prefetchEnrollmentData} onClick={() => navigate(`/dashboard/activity/${id}/enrollment`, { state: { returnTo: `/dashboard/activity/${id}/detail` } })} className="flex min-w-0 flex-nowrap items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gray-50 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"><Users size={17} className="shrink-0 text-emerald-500" />报名管理</button>
            <button type="button" onPointerEnter={() => void preloadMatchingRoute()} onFocus={() => void preloadMatchingRoute()} onClick={() => navigate(`/dashboard/activity/${id}/matching`, { state: { returnTo: `/dashboard/activity/${id}/detail` } })} className="flex min-w-0 flex-nowrap items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gray-50 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"><Settings size={17} className="shrink-0 text-orange-500" />匹配配置</button>
            <button type="button" onClick={() => setShowQrModal(true)} className="flex min-w-0 flex-nowrap items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gray-50 px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100"><QrCode size={17} className="shrink-0 text-purple-500" />活动二维码</button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-6">
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1" role="tablist" aria-label="活动详情内容">
            <button type="button" role="tab" aria-selected={activeTab === "info"} onClick={() => updateView({ tab: "info" })} className={`flex-1 whitespace-nowrap rounded-lg py-2 text-sm font-medium ${activeTab === "info" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>详细信息</button>
            <button type="button" role="tab" aria-selected={activeTab === "participants"} onClick={() => updateView({ tab: "participants" })} className={`flex-1 whitespace-nowrap rounded-lg py-2 text-sm font-medium ${activeTab === "participants" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>参与者 ({totalApplications})</button>
          </div>

          {activeTab === "info" ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4 lg:col-span-2">
                <h2 className="text-sm font-semibold text-gray-900">活动简介</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-gray-600">{activity.description || "暂无活动简介"}</p>
              </div>
              {requirements.length > 0 && (
                <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                  <h2 className="text-sm font-semibold text-gray-900">参与要求</h2>
                  <ol className="mt-3 space-y-2">
                    {requirements.map((requirement, index) => (
                      <li key={`${requirement}-${index}`} className="flex gap-2 text-sm text-gray-600"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs text-orange-600">{index + 1}</span>{requirement}</li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="rounded-xl bg-gray-50 p-4">
                <h2 className="text-sm font-semibold text-gray-900">管理信息</h2>
                <dl className="mt-3 space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between gap-3"><dt>创建时间</dt><dd>{formatDateTime(activity.createdAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>报名类型</dt><dd>{activity.registrationTypes?.length || 1} 个</dd></div>
                  <div className="flex justify-between gap-3"><dt>活动 ID</dt><dd className="max-w-[65%] truncate font-mono text-xs">{activity.id}</dd></div>
                </dl>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { label: "全部", value: undefined },
                  { label: "已通过", value: "approved" },
                  { label: "待审核", value: "pending" },
                  { label: "已拒绝", value: "rejected" },
                ].map((item) => (
                  <button key={item.label} type="button" onClick={() => updateView({ status: item.value, page: 1 })} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${participantStatus === item.value ? "bg-primary-500 text-white" : "bg-gray-100 text-gray-600"}`}>{item.label}</button>
                ))}
              </div>
              {participantsQuery.isPending ? (
                <div className="py-12 text-center text-sm text-gray-500">正在加载参与者...</div>
              ) : participants.length === 0 ? (
                <div className="py-12 text-center"><Users size={38} className="mx-auto mb-2 text-gray-300" /><p className="text-sm text-gray-500">当前筛选下暂无参与者</p></div>
              ) : (
                <>
                  <div ref={participantListRef} className="grid gap-2 md:grid-cols-2">
                    {participants.map((participant) => (
                      <div key={participant.user_id} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                        <ParticipantAvatar participant={participant} size="medium" showName showStatus className="min-w-0 flex-1" />
                        {participant.registration_time && <span className="shrink-0 text-[10px] text-gray-400">{formatDateTime(participant.registration_time)}</span>}
                      </div>
                    ))}
                  </div>
                  {participantsTotal > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button type="button" aria-label="上一页" disabled={participantPage === 1} onClick={() => updateView({ page: participantPage - 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
                      <span className="text-xs text-gray-500">{participantPage} / {Math.ceil(participantsTotal / PAGE_SIZE)}</span>
                      <button type="button" aria-label="下一页" disabled={participantPage >= Math.ceil(participantsTotal / PAGE_SIZE)} onClick={() => updateView({ page: participantPage + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 disabled:opacity-30"><ChevronRight size={16} /></button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>

      <RegistrationQrModal
        visible={showQrModal}
        activityId={id || ""}
        activityTitle={activity.title}
        registrationTypes={activity.registrationTypes}
        onClose={() => setShowQrModal(false)}
      />
    </MerchantLayout>
  );
};

export default ActivityDetail;
