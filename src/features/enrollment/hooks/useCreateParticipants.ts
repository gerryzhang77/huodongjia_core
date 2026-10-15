/**
 * Create Participants Hook
 * 参与者导入自定义 Hook
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Toast } from "@/components/ui/Toast";
import { participantsApi } from "../services";
import { merchantQueryKeys } from "@/features/merchant/queryKeys";
import type {
  CreateParticipantsRequest,
  CreateParticipantsResponse,
} from "../types";

/**
 * 参与者导入 Hook
 * @param eventId - 活动 ID
 * @returns useMutation 实例
 */
export const useCreateParticipants = (eventId: string) => {
  const queryClient = useQueryClient();

  return useMutation<
    CreateParticipantsResponse,
    Error,
    CreateParticipantsRequest
  >({
    mutationFn: (payload: CreateParticipantsRequest) =>
      participantsApi.createParticipants(eventId, payload),
    onSuccess: (response) => {
      const { imported, failed } = response.data;

      // 显示成功提示
      if (failed > 0) {
        Toast.show({
          icon: "success",
          content: `导入完成：成功 ${imported} 条，失败 ${failed} 条`,
          duration: 3000,
        });
      } else {
        Toast.show({
          icon: "success",
          content: `成功导入 ${imported} 条记录`,
          duration: 2000,
        });
      }

      // 刷新报名列表缓存
      queryClient.invalidateQueries({
        queryKey: ["enrollments", eventId],
      });
      void queryClient.invalidateQueries({ queryKey: merchantQueryKeys.matchingRoot(eventId) });
    },
    onError: (error) => {
      console.error("导入失败:", error);
      Toast.show({
        icon: "fail",
        content: error.message || "导入失败，请重试",
      });
    },
  });
};
