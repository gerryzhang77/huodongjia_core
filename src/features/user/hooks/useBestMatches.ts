/**
 * 用户侧匹配结果 Hook
 */

import { useQuery } from "@tanstack/react-query";
import {
  getBestMatches,
  type MatchExplanationField,
  type MatchExplanationPayload,
  normalizeMatchExplanation,
} from "../services/matchApi";

export interface BestMatchUser {
  user_id: string;
  explanation?: MatchExplanationPayload | null;
  /** 兼容前后端滚动发布期间的旧字段。解析时只保留非数值说明。 */
  scores?: unknown;
  participant?: {
    id: string;
    userId: string;
    name?: string;
    avatar?: string | null;
    status?: string;
  } | null;
}

export interface Participant {
  id: string;
  user_id: string;
  name: string;
  avatar?: string;
}

export interface EnrichedBestMatchUser extends Participant {
  matchHighlights: MatchExplanationField[];
  supplementary?: boolean;
}

export async function fetchBestMatchesWithParticipants(
  eventId: string,
): Promise<EnrichedBestMatchUser[]> {
  const matchResponse = await getBestMatches(eventId);
  if (!matchResponse.success) {
    throw new Error(matchResponse.message || "获取最佳匹配失败");
  }

  const bestMatchUsers: BestMatchUser[] = matchResponse.data || [];
  if (bestMatchUsers.length === 0) {
    return [];
  }

  return bestMatchUsers
    .map((match) => {
      const enrollment = match.participant;
      if (!enrollment) {
        return null;
      }

      const explanation = normalizeMatchExplanation(
        match.explanation ?? match.scores,
      );

      return {
        id: enrollment.id,
        user_id: enrollment.userId,
        name: enrollment.name || "未知用户",
        avatar: enrollment.avatar || undefined,
        matchHighlights: explanation.fields,
        supplementary: explanation.supplementary === true,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * 获取用户的最佳匹配列表（包含用户详细信息）
 */
export function useBestMatches(eventId: string | undefined) {
  const query = useQuery<EnrichedBestMatchUser[], Error>({
    queryKey: ["user", "best-matches", eventId],
    queryFn: () => fetchBestMatchesWithParticipants(eventId!),
    enabled: Boolean(eventId),
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
  });

  return {
    data: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
  };
}
