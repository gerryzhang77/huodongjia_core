/**
 * ActivityManage Page - 活动管理页面 (新版)
 * 包含报名管理、匹配管理等功能
 * 使用 MerchantLayout 布局
 */

import { FC, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Users, GitMerge, ChevronRight, Loader2, CheckSquare, Images } from "lucide-react";
import { Dialog } from "antd-mobile";
import { Toast } from "@/components/ui/Toast";
import { MerchantLayout } from "@/components/layout";
import { useActivityDetail } from "@/features/activities/hooks/useActivityDetail";
import { EnrollmentManageTab } from "@/features/enrollment/components/EnrollmentManageTab";
import { finishActivity } from "@/features/merchant/activity-manage/services/activityManageApi";
import { getDisplayParticipantCount } from "@/utils/participantCountDisplay";

/**
 * Tab 类型定义
 */
type TabKey = "enroll" | "match";

/**
 * ActivityManage 页面组件
 */
export const ActivityManageNew: FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("enroll");
  const [finishing, setFinishing] = useState(false);

  // 获取活动详情
  const { activity, loading } = useActivityDetail(id!);

  // 返回上一页
  const handleBack = () => {
    navigate("/dashboard");
  };

  // 「结束活动」（仅在活动未结束 / 未取消时展示）
  const ACTIVE_STATUSES = ["published", "registration", "ongoing", "recruiting", "recruiting_ended"];
  const canFinish =
    !!activity?.status && ACTIVE_STATUSES.includes(activity.status as string);
  // 已结束活动允许编辑回顾（兼容后端 'completed' 与前端类型 'ended'）
  const isCompleted = ["completed", "ended"].includes(
    (activity?.status ?? "") as string,
  );

  const handleFinish = async () => {
    if (!id) return;
    const ok = await Dialog.confirm({
      title: "结束活动",
      content: "结束后用户将不能继续报名，且会通知所有已通过的参与者。是否继续？",
      confirmText: "确认结束",
      cancelText: "取消",
    });
    if (!ok) return;

    setFinishing(true);
    try {
      const res = await finishActivity(id);
      if (!res.success) {
        Toast.show({ icon: "fail", content: res.message || "结束失败" });
        return;
      }
      Toast.show({ icon: "success", content: "活动已结束" });
      queryClient.invalidateQueries({ queryKey: ["activity", id] });
      queryClient.invalidateQueries({ queryKey: ["merchant", "activities"] });
      navigate("/dashboard");
    } catch (err: any) {
      Toast.show({ icon: "fail", content: err?.message || "结束失败，请稍后重试" });
    } finally {
      setFinishing(false);
    }
  };

  // 加载态
  if (loading) {
    return (
      <MerchantLayout title="活动管理" showBack onBack={handleBack}>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          <p className="text-gray-500 mt-4">正在加载活动信息...</p>
        </div>
      </MerchantLayout>
    );
  }

  // 错误态
  if (!activity && !loading) {
    return (
      <MerchantLayout title="活动管理" showBack onBack={handleBack}>
        <div className="bg-white rounded-xl p-8 text-center">
          <p className="text-gray-500">活动不存在或已被删除</p>
          <button
            className="mt-4 px-4 py-2 bg-primary-400 text-white rounded-full text-sm font-medium hover:bg-primary-500 transition-colors"
            onClick={() => navigate("/dashboard")}
          >
            返回首页
          </button>
        </div>
      </MerchantLayout>
    );
  }

  if (!activity) {
    return null;
  }

  return (
    <MerchantLayout title="活动管理" showBack onBack={handleBack}>
      <div className="space-y-4 px-3 pt-3 pb-4 sm:px-4 lg:p-0">
        {/* 活动信息卡片 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-start gap-4">
            {/* 封面图 */}
            <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 flex-shrink-0 overflow-hidden">
              {activity.coverImage ? (
                <img
                  src={activity.coverImage}
                  alt={activity.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl opacity-60">🎉</span>
                </div>
              )}
            </div>

            {/* 活动信息 */}
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 mb-2 line-clamp-2">
                {activity.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  📅 {new Date(activity.activityStart).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  👥 {getDisplayParticipantCount(activity, activity.enrolledCount)}/{activity.capacity}
                </span>
              </div>
            </div>
          </div>

          {/* 操作区：结束活动 / 管理回顾 */}
          {(canFinish || isCompleted) && (
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-2">
              {isCompleted && (
                <button
                  onClick={() => navigate(`/dashboard/activity/${id}/recap/edit`)}
          className="inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm text-primary-600 transition-colors hover:bg-primary-100 [&>svg]:shrink-0"
                >
                  <Images size={14} />
                  管理回顾
                </button>
              )}
              {canFinish && (
                <button
                  onClick={handleFinish}
                  disabled={finishing}
          className="inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 [&>svg]:shrink-0"
                >
                  {finishing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckSquare size={14} />
                  )}
                  结束活动
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab 导航 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex border-b border-gray-100">
            <button
              className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                activeTab === "enroll"
                  ? "text-primary-500"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab("enroll")}
            >
              <div className="flex items-center justify-center gap-2">
                <Users size={16} />
                <span>报名管理</span>
              </div>
              {activeTab === "enroll" && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-primary-400 rounded-full" />
              )}
            </button>
            <button
              className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
                activeTab === "match"
                  ? "text-primary-500"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => {
                // 跳转到完整的匹配配置页面
                navigate(`/dashboard/activity/${id}/matching`);
              }}
            >
              <div className="flex items-center justify-center gap-2">
                <GitMerge size={16} />
                <span>智能匹配</span>
                <ChevronRight size={14} className="text-gray-400" />
              </div>
            </button>
          </div>

          {/* Tab 内容区 */}
          <div className="p-4">
            {activeTab === "enroll" && <EnrollmentManageTab activityId={id!} />}
          </div>
        </div>
      </div>
    </MerchantLayout>
  );
};

export default ActivityManageNew;
