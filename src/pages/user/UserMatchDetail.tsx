import { FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toast } from "antd-mobile";
import {
  AlertCircle,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { UserLayout } from "@/components/layout/UserLayout";
import { Button } from "@/components/ui";
import { useActivityDetail } from "@/features/user";
import {
  getBestMatchDetail,
  getExistingMatchMessage,
  getMatchMessage,
} from "@/features/user/services/matchApi";
import { MatchExplanationCard } from "@/features/user/matching/components/MatchExplanationCard";
import { generateDefaultAvatar } from "@/utils/avatar";

const UserMatchDetail: FC = () => {
  const { id: activityId, userId } = useParams<{
    id: string;
    userId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: activityData } = useActivityDetail(activityId);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["user", "match-detail", activityId, userId],
    queryFn: () => getBestMatchDetail(activityId!, userId!),
    enabled: Boolean(activityId && userId),
  });
  const matchMessageQuery = useQuery({
    queryKey: ["user", "match-message", activityId, userId],
    queryFn: () => getExistingMatchMessage(activityId!, userId!),
    enabled: Boolean(activityId && userId),
  });

  const detail = data?.data;
  const message =
    typeof matchMessageQuery.data?.data === "string" &&
    matchMessageQuery.data.success
      ? matchMessageQuery.data.data
      : "";

  const viewMessageMutation = useMutation({
    mutationFn: async () => {
      if (!activityId || !userId) {
        throw new Error("缺少活动或用户信息");
      }
      return getMatchMessage(activityId, userId);
    },
    onSuccess: (response) => {
      queryClient.setQueryData(
        ["user", "match-message", activityId, userId],
        response,
      );
      queryClient.invalidateQueries({
        queryKey: ["user", "match-detail", activityId, userId],
      });
    },
    onError: () => {
      Toast.show({
        icon: "fail",
        content: "匹配寄语暂时无法查看，请稍后重试",
      });
    },
  });

  const handleViewMessage = async () => {
    if (message) return;
    try {
      await viewMessageMutation.mutateAsync();
    } catch {
      // 错误提示统一由 mutation.onError 展示。
    }
  };

  if (isLoading) {
    return (
      <UserLayout showTabBar={false} showTopBar={false}>
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          加载中...
        </div>
      </UserLayout>
    );
  }

  if (error || !detail) {
    return (
      <UserLayout showTabBar={false} showTopBar={false}>
        <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <AlertCircle size={40} className="text-orange-400 mb-3" />
          <p className="text-sm text-gray-600 mb-4">
            {error instanceof Error ? error.message : "匹配详情加载失败"}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              返回
            </Button>
            <Button variant="primary" onClick={() => refetch()}>
              重试
            </Button>
          </div>
        </div>
      </UserLayout>
    );
  }

  return (
    <UserLayout
      showTabBar={false}
      showTopBar={false}
      showBreadcrumb={true}
      breadcrumbItems={[
        { label: "首页", path: "/u/home" },
        { label: activityData?.data?.title || "活动", path: `/u/activities/${activityId}` },
        { label: "匹配结果", path: `/u/activities/${activityId}/match-result` },
        { label: detail.targetUserEnrollment.name || "匹配详情" },
      ]}
      bgColor="bg-gray-50"
    >
      <div className="min-h-screen pb-36">
        <div className="bg-gradient-to-br from-primary-400 to-accent-500 px-4 pt-12 pb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-5 inline-flex flex-nowrap items-center gap-1 whitespace-nowrap text-sm text-white/90 [&>svg]:shrink-0"
          >
            <ArrowLeft size={16} />
            返回匹配列表
          </button>
          <div className="flex items-center gap-4 rounded-3xl bg-white/12 p-5 text-white backdrop-blur-sm">
            <img
              src={
                detail.targetUserEnrollment.avatar ||
                generateDefaultAvatar(detail.targetUserEnrollment.user_id)
              }
              alt={`${detail.targetUserEnrollment.name || "匹配对象"}的头像`}
              className="h-16 w-16 shrink-0 rounded-2xl border border-white/20 object-cover"
            />
            <div className="min-w-0">
              <p className="mb-1 text-sm text-white/80">当前匹配对象</p>
              <h1 className="truncate text-2xl font-bold">
                {detail.targetUserEnrollment.name || "未命名用户"}
              </h1>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {detail.explanation.supplementary && (
            <p className="rounded-xl bg-white p-4 text-sm text-gray-500">
              补充推荐：你们暂无可比较的资料，可以先认识一下。
            </p>
          )}
          {detail.explanation.fields.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-accent-500" />
                <h3 className="text-base font-semibold text-gray-900">
                  你们的匹配亮点
                </h3>
              </div>

              {detail.explanation.fields.map((field) => (
                <MatchExplanationCard
                  key={`${field.rule_index}-${field.source_field}-${field.target_field}-${field.operator}`}
                  field={field}
                />
              ))}
            </section>
          ) : null}

          {message ? (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                匹配寄语
              </h3>
              <p className="text-sm text-gray-700 leading-7">{message}</p>
            </section>
          ) : null}
        </div>

        {!message ? (
          <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white px-4 py-3">
            <div className="max-w-lg mx-auto">
              <Button
                variant="primary"
                className="w-full"
                loading={
                  matchMessageQuery.isLoading || viewMessageMutation.isPending
                }
                disabled={matchMessageQuery.isLoading}
                onClick={handleViewMessage}
              >
                {viewMessageMutation.isPending
                  ? "正在准备匹配寄语"
                  : "查看匹配寄语"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </UserLayout>
  );
};

export default UserMatchDetail;
