import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActivityById } from "@/features/activities/services";
import { getEnrollmentsDetailed } from "@/features/enrollment/services/enrollmentApi";
import { matchingQueries } from "@/features/matching/services/matchingQueries";
import { useAuthStore } from "@/features/auth/stores";
import {
  merchantCacheTimes,
  merchantQueryKeys,
} from "@/features/merchant/queryKeys";

const preloadDetailChunk = () => import("@/pages/common/ActivityDetail");
const preloadEnrollmentChunk = () =>
  import("@/pages/merchant/EnrollmentManagementNew");
const preloadMatchingChunk = () => import("@/pages/merchant/MatchingConfig");

/** 商家活动卡片和详情页共享的代码、详情与业务数据预取。 */
export function usePrefetchMerchantActivity() {
  const queryClient = useQueryClient();
  const sessionScope = useAuthStore(state => state.user?.id || "anonymous");

  const prefetchDetail = useCallback(
    (activityId: string) => {
      void preloadDetailChunk();
      void queryClient.prefetchQuery({
        queryKey: merchantQueryKeys.activity(activityId),
        queryFn: () => getActivityById(activityId),
        staleTime: merchantCacheTimes.activityStale,
        gcTime: merchantCacheTimes.activityGc,
      });
    },
    [queryClient],
  );

  const prefetchEnrollment = useCallback(
    (activityId: string) => {
      void preloadEnrollmentChunk();
      void queryClient.prefetchQuery({
        queryKey: merchantQueryKeys.enrollmentList(activityId),
        queryFn: () =>
          getEnrollmentsDetailed(activityId, { page: 1, pageSize: 1000 }),
        staleTime: merchantCacheTimes.enrollmentStale,
        gcTime: merchantCacheTimes.enrollmentGc,
      });
    },
    [queryClient],
  );

  const prefetchMatching = useCallback(
    (activityId: string) => {
      void preloadMatchingChunk();
      // Prefetch only the shared entry data. Scoped catalogs load on the rules step.
      void queryClient.prefetchQuery(matchingQueries.participants(activityId, true, sessionScope));
      void queryClient.prefetchQuery(matchingQueries.results(activityId));
      void queryClient.prefetchQuery(matchingQueries.config(activityId));
      void queryClient.prefetchQuery(matchingQueries.activity(activityId));
    },
    [queryClient, sessionScope],
  );

  return { prefetchDetail, prefetchEnrollment, prefetchMatching };
}
