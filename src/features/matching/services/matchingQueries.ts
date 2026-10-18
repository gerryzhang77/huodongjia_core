import { queryOptions } from "@tanstack/react-query";
import { getActivityById } from "@/features/activities/services/api";
import { merchantCacheTimes as times, merchantQueryKeys as keys } from "@/features/merchant/queryKeys";
import { getMatchConfig, getMatchFieldCatalog, getMatchGroups, getMatchingHistory, getMatchRules, getParticipants } from "./matchingApi";

const common = { gcTime: times.matchingGc, refetchOnWindowFocus: true };
export const matchingParticipantScope = (ids: string[]) => `selected:${[...ids].sort().join("|") || "none"}`;

// One definition for mounted queries and intent prefetching.
export const matchingQueries = {
  participants: (id: string, cardsOnly = false, sessionScope = "") => queryOptions({ ...common, queryKey: cardsOnly ? [...keys.matchingParticipants(id), "cards", sessionScope] : keys.matchingParticipants(id), queryFn: () => getParticipants(id, cardsOnly ? "matching-cards" : undefined), staleTime: times.matchingParticipantsStale }),
  results: (id: string) => queryOptions({ ...common, queryKey: keys.matchingResults(id), queryFn: () => getMatchGroups(id), staleTime: times.matchingResultStale }),
  rules: (id: string) => queryOptions({ ...common, queryKey: keys.matchingRules(id), queryFn: () => getMatchRules(id), staleTime: 30_000 }),
  config: (id: string) => queryOptions({ ...common, queryKey: keys.matchingConfig(id), queryFn: () => getMatchConfig(id), staleTime: 30_000 }),
  history: (id: string) => queryOptions({ ...common, queryKey: keys.matchingHistory(id), queryFn: () => getMatchingHistory(id), staleTime: 30_000 }),
  activity: (id: string) => queryOptions({ queryKey: keys.activity(id), queryFn: () => getActivityById(id), staleTime: times.activityStale, gcTime: times.activityGc }),
  catalog: (id: string, ids: string[]) => queryOptions({ ...common, queryKey: keys.matchingCatalog(id, matchingParticipantScope(ids)), queryFn: () => getMatchFieldCatalog(id, ids), staleTime: 30_000 }),
};
