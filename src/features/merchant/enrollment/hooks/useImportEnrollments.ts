/**
 * useImportEnrollments - 批量导入报名
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importEnrollments } from "../services/enrollmentManageApi";
import { merchantQueryKeys } from "@/features/merchant/queryKeys";

/**
 * 批量导入报名 Hook
 */
export function useImportEnrollments(activityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return importEnrollments(activityId, formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.enrollmentList(activityId),
      });
      queryClient.invalidateQueries({ queryKey: merchantQueryKeys.activity(activityId) });
      queryClient.invalidateQueries({ queryKey: merchantQueryKeys.activities() });
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.matchingParticipants(activityId),
      });
      queryClient.invalidateQueries({ queryKey: merchantQueryKeys.matchingResults(activityId) });
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.matchingCatalog(activityId),
      });
    },
  });
}
