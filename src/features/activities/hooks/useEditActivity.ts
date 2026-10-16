/**
 * 编辑活动 Hook
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Toast } from "@/components/ui/Toast";
import { Dialog } from "antd-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { previewRegistrationFormImpact, updateActivity } from "../services";
import { useActivityStore } from "../stores";
import { isOnlineOnlyActivity } from "../utils";
import type { ActivityFormData, UpdateActivityRequest } from "../types";
import { merchantQueryKeys } from "@/features/merchant/queryKeys";

export const useEditActivity = (activityId: string) => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setCurrentActivity } = useActivityStore();

  const invalidateActivityCaches = (id: string) => {
    const options = { refetchType: "none" as const };

    queryClient.invalidateQueries({ queryKey: ["activities"], ...options });
    queryClient.invalidateQueries({ queryKey: merchantQueryKeys.activities(), ...options });
    queryClient.invalidateQueries({ queryKey: merchantQueryKeys.activity(id), ...options });
    queryClient.invalidateQueries({ queryKey: merchantQueryKeys.matchingCatalog(id), ...options });
    queryClient.invalidateQueries({ queryKey: merchantQueryKeys.matchingParticipants(id), ...options });
    queryClient.invalidateQueries({ queryKey: merchantQueryKeys.matchingResults(id), ...options });
    queryClient.invalidateQueries({ queryKey: merchantQueryKeys.matchingRules(id), ...options });
    queryClient.invalidateQueries({ queryKey: ["public", "activity", id], ...options });
    queryClient.invalidateQueries({ queryKey: ["user", "activity", id], ...options });
    queryClient.invalidateQueries({ queryKey: ["user", "activities"], ...options });
  };

  const edit = async (data: ActivityFormData) => {
    setLoading(true);

    try {
      const tags = (data.tags || []).map((tag) => String(tag));
      const location = isOnlineOnlyActivity(tags)
        ? ""
        : String(data.location || "").trim();

      // 转换表单数据为 API 请求格式
      const requestData: UpdateActivityRequest = {
        title: data.title,
        description: data.description,
        registrationStart: data.registration_start.toISOString(),
        registrationEnd: data.registration_end.toISOString(),
        activityStart: data.start_time.toISOString(),
        activityEnd: data.end_time.toISOString(),
        location,
        capacity: data.max_participants,
        category: Array.isArray(data.category) ? data.category[0] || "other" : data.category || "other",
        tags,
        requirements: data.requirements,
        contactInfo: data.contact_info,
        isPublic: data.is_public,
        allowWaitlist: data.allow_waitlist,
        enableNfc: data.enable_nfc === true,
        registrationFormSchema: data.registration_form_schema || undefined,
        registrationTypes: data.registration_types || undefined,
      };

      // 只有当有封面图片时才添加 coverImage 和 images 字段
      if (data.cover_image) {
        requestData.coverImage = data.cover_image;
      }
      if (data.images) {
        requestData.images = data.images;
      }

      const formImpact = await previewRegistrationFormImpact(activityId, {
        registrationFormSchema: requestData.registrationFormSchema,
        registrationTypes: requestData.registrationTypes,
      });
      if (formImpact.hasChanges) {
        const changedTypeCount = formImpact.typeImpacts.length;
        const preservedCount = formImpact.typeImpacts.reduce(
          (total, impact) => total + (impact.preservedHistoricalEnrollments || 0),
          0,
        );
        const impactSummary = formImpact.totalAffectedParticipants > 0
          ? `将通知 ${formImpact.totalAffectedParticipants} 位已报名用户补充或确认资料。`
          : "现有报名资料无需用户补填。";
        const matchedNotificationCount =
          formImpact.totalMatchedNotificationParticipants || 0;
        const optionalNotificationCount =
          formImpact.totalOptionalNotificationParticipants || 0;
        const optionalNotificationSummary = optionalNotificationCount > 0
          ? ` 另有 ${optionalNotificationCount} 位已报名用户将收到“可补充资料”通知，但不会生成强制任务。`
          : "";
        const matchedNotificationSummary = matchedNotificationCount > 0
          ? ` 另有 ${matchedNotificationCount} 位已完成匹配且无需补填的用户将收到报名表变更通知。`
          : "";
        const preservedSummary = preservedCount > 0
          ? ` 已移除报名类型中的 ${preservedCount} 条历史报名仍会保留。`
          : "";
        const quotaImpacts = formImpact.quotaImpacts || [];
        const overLimitOptions = quotaImpacts.flatMap((impact) =>
          impact.options
            .filter((option) => option.overLimit)
            .map((option) =>
              `${impact.registrationTypeName}的“${option.optionValue}”当前 ${option.currentCount} 人，名额 ${option.capacity} 人`,
            ),
        );
        const formChangeSummary = changedTypeCount > 0
          ? `本次修改涉及 ${changedTypeCount} 个报名类型的表单。`
          : "";
        const quotaSummary = quotaImpacts.length > 0
          ? ` 已更新 ${quotaImpacts.length} 个报名类型的名额控制；已报名人员不受影响，新报名按新名额执行。`
          : "";
        const overLimitSummary = overLimitOptions.length > 0
          ? ` 其中${overLimitOptions.join("；")}，相应选项将立即停止接受新报名。`
          : "";
        const affectedMatchingRuleCount =
          formImpact.totalAffectedMatchingRules ||
          formImpact.matchingRuleImpacts?.length ||
          0;
        const matchingRuleSummary = affectedMatchingRuleCount > 0
          ? ` 本次变更会停用 ${affectedMatchingRuleCount} 条当前匹配规则；既有匹配运行记录和历史结果不受影响，请在更新后进入智能匹配重新配置。`
          : "";
        // 影响预检已经结束；确认阶段不应继续显示“更新中”，否则会和
        // 确认弹窗形成两个互相冲突的提交状态。
        setLoading(false);
        Toast.clear();
        const confirmed = await Dialog.confirm({
          title: "确认更新报名表？",
          content: `${formChangeSummary}${impactSummary}${optionalNotificationSummary}${matchedNotificationSummary}${quotaSummary}${overLimitSummary}${preservedSummary}${matchingRuleSummary}`,
          confirmText: "确认更新",
          cancelText: "继续编辑",
        });
        if (!confirmed) return;
        if (affectedMatchingRuleCount > 0) {
          requestData.confirmMatchRuleChanges = true;
        }
        setLoading(true);
      }

      const activity = await updateActivity(activityId, requestData);
      queryClient.setQueryData(
        merchantQueryKeys.activity(activityId),
        activity,
      );

      Toast.clear();
      Toast.show({
        icon: "success",
        content: "活动更新成功",
      });

      invalidateActivityCaches(activityId);

      setCurrentActivity(activity);
      navigate(`/dashboard/activity/${activity.id}/detail`);
    } catch (error) {
      console.error("更新活动失败:", error);
      Toast.clear();
      Toast.show({
        icon: "fail",
        content: error instanceof Error ? error.message : "更新活动失败，请稍后重试",
      });
    } finally {
      setLoading(false);
    }
  };

  return { edit, loading };
};
