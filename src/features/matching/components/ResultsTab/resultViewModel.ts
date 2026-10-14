import type { ParticipantMatchResult } from "../../types";

export const COLLAPSED_MATCH_PREVIEW_COUNT = 3;

export const getCollapsedMatchPreview = <T>(items: T[]): T[] =>
  items.slice(0, COLLAPSED_MATCH_PREVIEW_COUNT);

export const shouldShowMatchListToggle = (matchCount: number): boolean =>
  matchCount > COLLAPSED_MATCH_PREVIEW_COUNT;

/** 结果页需要的参与者字段（来自报名参与者接口）。 */
export interface ResultParticipant {
  id: string;
  enrollmentId?: string;
  imageCount?: number;
  name: string;
  registrationTypeId?: string | null;
  registrationTypeName?: string;
  avatar?: string;
  gender?: string;
  age?: number;
  occupation?: string;
  company?: string;
  industry?: string;
  city?: string;
  bio?: string;
  interests?: string | string[];
  department?: string;
  skills?: string;
  expertise?: string;
  tags?: string[];
  phone?: string;
  email?: string;
  status?: string;
  formData?: Record<string, unknown>;
}

export interface CandidateMatchView {
  id: string;
  candidateId: string;
  candidate?: ResultParticipant;
  rank: number;
  scorePercent: number | null;
  supplementary?: boolean;
  scoreFields: Array<Record<string, unknown>>;
  reciprocalRank: number | null;
}

export interface ParticipantResultView {
  id: string;
  ownerId: string;
  owner?: ResultParticipant;
  record?: ParticipantMatchResult;
  matches: CandidateMatchView[];
  bestScore: number | null;
  averageScore: number | null;
  issues: string[];
  hasConflict: boolean;
  hasNoMatches: boolean;
  isLowMatch: boolean;
  isLocked: boolean;
}

export type ParticipantResultSort = "score-asc" | "score-desc" | "name";

export const sortParticipantResultRows = (
  rows: ParticipantResultView[],
  sort: ParticipantResultSort,
): ParticipantResultView[] => {
  return [...rows].sort((a, b) => {
    const nameCompare = (a.owner?.name || a.ownerId).localeCompare(
      b.owner?.name || b.ownerId,
      "zh-CN",
    );
    if (sort === "name") return nameCompare;

    const aScore = a.bestScore ?? -1;
    const bScore = b.bestScore ?? -1;
    return sort === "score-asc"
      ? aScore - bScore || nameCompare
      : bScore - aScore || nameCompare;
  });
};

export const toScorePercent = (
  score?: {
    total_score?: number | null;
    total_score_percent?: number | null;
    supplementary?: boolean;
  } | null,
): number | null => {
  if (!score || score.supplementary || score.total_score === null) return null;

  const percent = Number(score.total_score_percent);
  if (Number.isFinite(percent)) {
    return Math.max(0, Math.min(100, percent));
  }

  const totalScore = Number(score.total_score);
  if (!Number.isFinite(totalScore)) return null;

  const normalized = totalScore <= 1 ? totalScore * 100 : totalScore;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

interface BuildParticipantResultRowsOptions {
  matchResults: ParticipantMatchResult[];
  participantMap: Map<string, ResultParticipant>;
  validationIssueMap: Map<string, string[]>;
  lowMatchThreshold: number;
}

/**
 * 将后端的有向 Top-K 记录转换成“一位参与者一行”的视图模型。
 * 候选人不会被提升为额外的主人行；只有其拥有自己的结果记录时才会单独出现。
 */
export const buildParticipantResultRows = ({
  matchResults,
  participantMap,
  validationIssueMap,
  lowMatchThreshold,
}: BuildParticipantResultRowsOptions): ParticipantResultView[] => {
  const resultRecordMap = new Map(
    matchResults.map((record) => [record.userId, record]),
  );
  const ownerIds = new Set(matchResults.map((record) => record.userId));
  for (const userId of validationIssueMap.keys()) ownerIds.add(userId);

  return Array.from(ownerIds).map((ownerId) => {
    const record = resultRecordMap.get(ownerId);
    const matches = (record?.bestMatchUserIds || []).map(
      (candidateId, index): CandidateMatchView => {
        const reverseRecord = resultRecordMap.get(candidateId);
        const reverseIndex =
          reverseRecord?.bestMatchUserIds.indexOf(ownerId) ?? -1;
        return {
          id: `${record?.id || ownerId}-${candidateId}-${index}`,
          candidateId,
          candidate: participantMap.get(candidateId),
          rank: index + 1,
          scorePercent: toScorePercent(record?.scores?.[index] || null),
          scoreFields: record?.scores?.[index]?.fields || [],
          supplementary: record?.scores?.[index]?.supplementary === true,
          reciprocalRank: reverseIndex >= 0 ? reverseIndex + 1 : null,
        };
      },
    );
    const validScores = matches
      .map((match) => match.scorePercent)
      .filter((score): score is number => score != null);
    const bestScore = validScores.length > 0 ? Math.max(...validScores) : null;
    const averageScore =
      validScores.length > 0
        ? Math.round(
            validScores.reduce((sum, score) => sum + score, 0) /
              validScores.length,
          )
        : null;
    const issues = validationIssueMap.get(ownerId) || [];
    const hasNoMatches = matches.length === 0;

    return {
      id: record?.id || `missing-${ownerId}`,
      ownerId,
      owner: participantMap.get(ownerId),
      record,
      matches,
      bestScore,
      averageScore,
      issues,
      hasConflict: issues.length > 0,
      hasNoMatches,
      isLowMatch:
        !hasNoMatches &&
        (bestScore == null || bestScore < lowMatchThreshold),
      isLocked: record?.isLocked === true,
    };
  });
};
