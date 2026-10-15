/**
 * Matching Module - API Service
 * 匹配模块 - API 服务
 */

import type {
  MatchingRule,
  Participant,
  ParticipantMatchResult,
  GenerateRulesRequest,
  GenerateRulesResponse,
  ExecuteMatchRequest,
  ExecuteMatchResponse,
  MatchFieldCatalogResponse,
  MatchPreflightResult,
  MatchConstraints,
  MatchValidationResult,
  MatchResultState,
  MatchingHistory,
} from "../types";
import { api } from "@/services/api";

// 兼容别名
type MatchRule = MatchingRule;

type MatchCandidateScore = {
  total_score: number | null;
  total_score_percent?: number | null;
  supplementary?: boolean;
  fields?: Array<Record<string, unknown>>;
};

type MatchResultRecord = {
  id?: string;
  user_id: string;
  match_id?: string;
  best_match_users?: unknown;
  scores?: unknown;
  created_at?: string;
  is_locked?: boolean;
};

type MatchStatsRecord = {
  averageScore?: unknown;
  average_score?: unknown;
  minScore?: unknown;
  min_score?: unknown;
  maxScore?: unknown;
  max_score?: unknown;
  totalParticipants?: unknown;
  total_participants?: unknown;
  topK?: unknown;
  top_k?: unknown;
};

type MatchResultsApiResponse = {
  success: boolean;
  message?: string;
  groups?: MatchResultRecord[];
  stats?: MatchStatsRecord;
  resultState?: MatchResultState;
  matchStatusId?: string;
  version?: number;
  revision?: number;
  sourceMatchStatusId?: string | null;
  participantUserIds?: string[];
  data?: Omit<MatchResultsApiResponse, "data">;
};

export class MatchingApiError extends Error {
  code?: string;
  diagnostics?: MatchPreflightResult;
  validation?: MatchValidationResult;

  constructor(message: string, options?: {
    code?: string;
    diagnostics?: MatchPreflightResult;
    validation?: MatchValidationResult;
  }) {
    super(message);
    this.name = "MatchingApiError";
    this.code = options?.code;
    this.diagnostics = options?.diagnostics;
    this.validation = options?.validation;
  }
}

const DEFAULT_OPERATOR = "similarity" as const;

const buildRuleName = (rule: Partial<MatchRule>, fallbackIndex?: number) => {
  if (rule.name) return rule.name;
  if (rule.source_field && rule.target_field && rule.operator) {
    return `${rule.source_field} ${rule.operator} ${rule.target_field}`;
  }
  return `规则 ${typeof fallbackIndex === "number" ? fallbackIndex + 1 : ""}`.trim();
};

const normalizeRule = (
  rule: Partial<MatchRule>,
  fallbackIndex?: number,
): MatchRule => ({
  id: rule.id || `rule-${fallbackIndex ?? Date.now()}`,
  name: buildRuleName(rule, fallbackIndex),
  source_field: rule.source_field || rule.field || "",
  target_field: rule.target_field || rule.field || "",
  source_registration_type_id: rule.source_registration_type_id,
  target_registration_type_id: rule.target_registration_type_id,
  source_label_snapshot: rule.source_label_snapshot,
  target_label_snapshot: rule.target_label_snapshot,
  source_field_status: rule.source_field_status,
  target_field_status: rule.target_field_status,
  valid: rule.valid,
  invalid_reason: rule.invalid_reason,
  can_match: rule.can_match,
  operator: rule.operator || (rule.type as MatchRule["operator"]) || DEFAULT_OPERATOR,
  type: rule.type || rule.operator || DEFAULT_OPERATOR,
  field: rule.field,
  weight: typeof rule.weight === "number" ? rule.weight : 1,
  enabled: rule.enabled ?? true,
  description: rule.description,
  config: rule.config,
});

const serializeRulesForBackend = (
  rules: MatchRule[],
  options: { includeDisabled?: boolean } = {},
) =>
  rules
    .filter(
      (rule) =>
        (options.includeDisabled || rule.enabled) &&
        rule.source_field &&
        rule.target_field &&
        rule.operator &&
        typeof rule.weight === "number",
    )
    .map((rule) => ({
      source_field: rule.source_field,
      target_field: rule.target_field,
      source_registration_type_id: rule.source_registration_type_id,
      target_registration_type_id: rule.target_registration_type_id,
      source_label_snapshot: rule.source_label_snapshot,
      target_label_snapshot: rule.target_label_snapshot,
      operator: rule.operator,
      weight: rule.weight,
      enabled: rule.enabled,
    }));

const mapSchemaFieldsToRules = (
  fields: Array<{ key?: string; label?: string }>,
): MatchRule[] =>
  fields.map((field, index) =>
    normalizeRule(
      {
        id: `rule-${index}`,
        name: field.label || field.key || `规则 ${index + 1}`,
        source_field: field.key || "",
        target_field: field.key || "",
        operator: DEFAULT_OPERATOR,
        weight: 1,
        enabled: true,
      },
      index,
    ),
  );

const parseMatchCandidateScores = (
  rawScores: unknown,
): Array<MatchCandidateScore | null> | null => {
  if (!rawScores) return null;

  const parsed =
    typeof rawScores === "string"
      ? (() => {
          try {
            return JSON.parse(rawScores);
          } catch {
            return null;
          }
        })()
      : rawScores;

  if (!Array.isArray(parsed)) {
    return null;
  }

  const normalized = parsed.map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const supplementary = (item as MatchCandidateScore).supplementary === true;
      const totalScore = Number((item as MatchCandidateScore).total_score);
      const totalScorePercent = Number(
        (item as MatchCandidateScore).total_score_percent,
      );

      return {
        supplementary,
        total_score: supplementary ? null : Number.isFinite(totalScore) ? totalScore : 0,
        total_score_percent: supplementary ? null : Number.isFinite(totalScorePercent)
          ? totalScorePercent
          : Math.round((Number.isFinite(totalScore) ? totalScore : 0) * 100),
        fields: Array.isArray((item as MatchCandidateScore).fields)
          ? (item as MatchCandidateScore).fields
          : [],
      };
    });

  return normalized;
};

/**
 * 获取 token
 */
const getToken = (): string | null => {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (!raw) return null;
    return JSON.parse(raw)?.state?.token ?? null;
  } catch {
    return null;
  }
};

/**
 * 获取活动的匹配规则列表
 * 后端返回 match_rules_detail.rules，是 string[] 或 MatchingRule[]
 * 统一转换为 MatchingRule[]
 */
export const getMatchRules = async (
  activityId: string,
): Promise<MatchRule[]> => {
  const token = getToken();

  const response = await fetch(`/api/match/${activityId}/rules`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || "获取匹配规则失败");
  }

  // 后端返回 { success: true, rules: { rules: MatchingRule[] } }
  const rawRules = data.rules?.rules ?? data.rules ?? [];

  if (!Array.isArray(rawRules) || rawRules.length === 0) return [];

  if (typeof rawRules[0] === "string") {
    return (rawRules as string[]).map((name, i) =>
      normalizeRule(
        {
          name,
          source_field: name,
          target_field: name,
          operator: DEFAULT_OPERATOR,
          weight: 1,
          enabled: true,
        },
        i,
      ),
    );
  }

  return (rawRules as Partial<MatchRule>[]).map((rule, index) =>
    normalizeRule(rule, index),
  );
};

/**
 * 保存匹配规则到后端
 * 后端期望: { rules: MatchingRule[], weights?: number[] }
 */
export const saveMatchRules = async (
  activityId: string,
  rules: MatchRule[],
): Promise<void> => {
  const token = getToken();
  const payloadRules = serializeRulesForBackend(rules, { includeDisabled: true });

  const response = await fetch(`/api/match/${activityId}/rules`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rules: payloadRules }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new MatchingApiError(data.message || "保存匹配规则失败", {
      code: data.code,
    });
  }
};

export const getMatchFieldCatalog = async (
  activityId: string,
  participantUserIds?: string[],
): Promise<MatchFieldCatalogResponse> => {
  const token = getToken();

  const response = await fetch(`/api/match/${activityId}/field-catalog`, {
    method: participantUserIds ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(participantUserIds
      ? { body: JSON.stringify({ participantUserIds }) }
      : {}),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || "获取匹配字段目录失败");
  }

  return {
    fields: Array.isArray(data.data?.fields) ? data.data.fields : [],
    totalEligibleParticipants: Number(data.data?.totalEligibleParticipants) || 0,
  };
};

export const getMatchConfig = async (
  activityId: string,
): Promise<MatchConstraints> => {
  const token = getToken();
  const response = await fetch(`/api/match/${activityId}/config`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "获取匹配约束失败");
  return data.data as MatchConstraints;
};

export const saveMatchConfig = async (
  activityId: string,
  config: MatchConstraints,
): Promise<MatchConstraints> => {
  const token = getToken();
  const response = await fetch(`/api/match/${activityId}/config`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "保存匹配约束失败");
  return data.data as MatchConstraints;
};

export const preflightMatching = async (
  activityId: string,
  rules: MatchRule[],
  config?: MatchConstraints,
  participantUserIds?: string[],
): Promise<MatchPreflightResult> => {
  const token = getToken();
  const payloadRules = serializeRulesForBackend(rules);

  const response = await fetch(`/api/match/${activityId}/preflight`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rules: payloadRules, config, participantUserIds }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new MatchingApiError(data.message || "匹配预检失败", {
      code: data.code,
      diagnostics: data.diagnostics,
    });
  }

  return data.data as MatchPreflightResult;
};

/**
 * 更新匹配规则
 */
export const updateMatchRule = async (
  ruleId: string,
  updates: Partial<MatchRule>,
): Promise<MatchRule> => {
  const token = getToken();

  const response = await fetch(`/api/match-rules/${ruleId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || "更新匹配规则失败");
  }

  return data.rule;
};

/**
 * 删除匹配规则
 */
export const deleteMatchRule = async (ruleId: string): Promise<void> => {
  const token = getToken();

  const response = await fetch(`/api/match-rules/${ruleId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || "删除匹配规则失败");
  }
};

/**
 * 从活动 schema 派生默认规则
 * 保留兼容导出，但不再调用旧的 /generate 接口
 */
export const generateMatchRules = async (
  request: GenerateRulesRequest,
): Promise<GenerateRulesResponse> => {
  const token = getToken();

  const response = await fetch(`/api/events/organizer/${request.activityId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || "获取报名表字段失败");
  }

  const schema =
    data.event?.registrationFormSchema ||
    data.event?.registration_form_schema ||
    [];

  return {
    rules: mapSchemaFieldsToRules(schema),
  };
};

/**
 * 执行智能匹配
 * 后端期望: { rules: [{ source_field, target_field, operator, weight }] }
 */
export const executeMatching = async (
  request: ExecuteMatchRequest,
): Promise<ExecuteMatchResponse> => {
  const token = getToken();
  const payloadRules = serializeRulesForBackend(request.rules);

  const response = await fetch(`/api/match/${request.activityId}/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rules: payloadRules,
      config: request.config,
      participantUserIds: request.participantUserIds,
    }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    try {
      const errorData = rawText ? JSON.parse(rawText) : null;
      throw new MatchingApiError(
        errorData?.message || `HTTP ${response.status}`,
        {
          code: errorData?.code,
          diagnostics: errorData?.diagnostics,
        },
      );
    } catch (error) {
      if (error instanceof MatchingApiError) throw error;
      throw new Error(rawText || `HTTP ${response.status}`);
    }
  }
  const data = await response.json();

  if (!data.success) {
    throw new MatchingApiError(data.message || "执行匹配失败", {
      code: data.code,
      diagnostics: data.diagnostics,
    });
  }

  return {
    groups: data.groups || [],
    totalParticipants: data.total_participants || 0,
    groupedParticipants: data.grouped_participants || 0,
    averageScore: data.average_score || 0,
  };
};

/**
 * 获取匹配结果（商家视图）
 *
 * 后端返回：
 *   { success, message, groups: [{ id, event_id, user_id, match_id, best_match_users, scores }],
 *     stats?: { totalParticipants, averageScore, minScore, maxScore, topK } }
 * 后端从有向推荐边聚合为每个参与者的 Top-K 结果。参与者详情由 participants
 * 查询统一提供，避免结果请求再次拉取整份报名列表。
 */
export interface MatchStatsResponse {
  /** 参与者（= 收到推荐的独立用户）数量 */
  totalParticipants: number;
  /** 平均匹配分（0-1 的 cosine 相似度） */
  averageScore: number;
  minScore: number;
  maxScore: number;
  /** 每人推荐候选数（通常为 5） */
  topK: number;
}

export const getMatchGroups = async (
  activityId: string,
): Promise<{
  results: ParticipantMatchResult[];
  stats: MatchStatsResponse | null;
  resultState?: MatchResultState;
  matchStatusId?: string;
  version?: number;
  revision?: number;
  sourceMatchStatusId?: string | null;
  participantUserIds: string[];
}> => {
  const token = getToken();

  const resultsResp = await fetch(`/api/match/${activityId}/results?view=summary`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = (await resultsResp.json()) as MatchResultsApiResponse;
  if (!data.success) {
    throw new Error(data.message || "获取匹配结果失败");
  }

  // 后端将有向推荐边按 source_user_id 聚合成兼容的 per-user top5 数组。
  const rawRecords = data.groups || data.data?.groups || [];

  const results: ParticipantMatchResult[] = rawRecords.map((r) => ({
    id: r.id,
    userId: r.user_id,
    matchId: r.match_id,
    bestMatchUserIds: Array.isArray(r.best_match_users) ? r.best_match_users : [],
    scores: parseMatchCandidateScores(r.scores),
    createdAt: r.created_at,
    isLocked: r.is_locked === true,
  }));

  // 解析后端返回的 stats（可选字段，老版本后端不返回时为 null）
  let stats: MatchStatsResponse | null = null;
  const rawStats = data.stats || data.data?.stats;
  if (rawStats && typeof rawStats === "object") {
    const avg = Number(rawStats.averageScore ?? rawStats.average_score);
    const min = Number(rawStats.minScore ?? rawStats.min_score);
    const max = Number(rawStats.maxScore ?? rawStats.max_score);
    const total = Number(
      rawStats.totalParticipants ?? rawStats.total_participants,
    );
    const topK = Number(rawStats.topK ?? rawStats.top_k);
    // 至少有一项分数有效才认为 stats 可用
    if (Number.isFinite(avg) || Number.isFinite(min) || Number.isFinite(max)) {
      stats = {
        totalParticipants: Number.isFinite(total) ? total : results.length,
        averageScore: Number.isFinite(avg) ? avg : 0,
        minScore: Number.isFinite(min) ? min : 0,
        maxScore: Number.isFinite(max) ? max : 0,
        topK: Number.isFinite(topK) && topK > 0 ? topK : 5,
      };
    }
  }

  return {
    results,
    stats,
    resultState: data.resultState || data.data?.resultState,
    matchStatusId: data.matchStatusId || data.data?.matchStatusId,
    version: Number(data.version || data.data?.version) || undefined,
    revision: Number(data.revision || data.data?.revision) || undefined,
    sourceMatchStatusId:
      data.sourceMatchStatusId ?? data.data?.sourceMatchStatusId ?? null,
    participantUserIds: Array.isArray(
      data.participantUserIds ?? data.data?.participantUserIds,
    )
      ? (data.participantUserIds ?? data.data?.participantUserIds ?? []).map(String)
      : [],
  };
};

/**
 * 锁定/解锁匹配组
 */
export const toggleGroupLock = async (
  groupId: string,
  isLocked: boolean,
): Promise<void> => {
  const token = getToken();

  const response = await fetch(`/api/match/groups/${groupId}/lock`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ is_locked: isLocked }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || "操作失败");
  }
};

/**
 * 获取活动参与者列表 (从报名数据)
 */
export const getParticipants = async (
  activityId: string,
): Promise<Participant[]> => {
  const token = getToken();

  const response = await fetch(`/api/enrollments/${activityId}/participants`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = (await response.json()) as {
    success: boolean;
    message?: string;
    data?: { participants?: Participant[] };
  };

  if (!data.success) {
    throw new Error(data.message || "获取参与者列表失败");
  }

  return data.data?.participants || [];
};

/**
 * 获取匹配历史记录
 */
export const getMatchingHistory = async (
  activityId: string,
): Promise<MatchingHistory[]> => {
  const token = getToken();

  const response = await fetch(`/api/match/${activityId}/history`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = (await response.json()) as {
    success: boolean;
    message?: string;
    data?: { history?: MatchingHistory[] };
  };

  if (!data.success) {
    throw new Error(data.message || "获取历史记录失败");
  }

  return data.data?.history || [];
};

/**
 * 发布匹配结果
 */
export const publishMatchingResult = async (
  activityId: string,
  historyId?: string,
): Promise<{ matchStatusId: string; enrollmentIds: string[] }> => {
  const token = getToken();

  const response = await fetch(`/api/match/${activityId}/publish`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(historyId ? { historyId } : {}),
  });

  const data = await response.json();

  if (!data.success) {
    throw new MatchingApiError(data.message || "发布失败", {
      code: data.code,
      validation: data.data,
    });
  }
  return data.data;
};

export interface MatchCandidate {
  id: string;
  enrollmentId: string;
  name: string;
  account?: string;
  phone?: string;
  avatar?: string | null;
  gender?: string | null;
  age?: number | null;
  occupation?: string;
  industry?: string;
  city?: string;
  registrationTypeId?: string | null;
  registrationTypeName?: string;
  hardRulePassed: boolean;
  hardRuleViolations: string[];
  selected: boolean;
}

export const searchMatchCandidates = async (
  activityId: string,
  sourceUserId: string,
  filters: {
    q?: string;
    gender?: string;
    minAge?: number;
    maxAge?: number;
    registrationTypeId?: string;
    page?: number;
    pageSize?: number;
  } = {},
  options: { signal?: AbortSignal } = {},
): Promise<{
  candidates: MatchCandidate[];
  total: number;
  selectedIds: string[];
  isLocked: boolean;
  config?: MatchConstraints;
}> => {
  const data = await api.get<{
    success: boolean;
    message?: string;
    data: {
      candidates: MatchCandidate[];
      total: number;
      selectedIds: string[];
      isLocked: boolean;
      config?: MatchConstraints;
    };
  }>(
    `/api/match/${activityId}/results/${sourceUserId}/candidates`,
    {
      params: filters,
      signal: options.signal,
    },
  );
  if (!data.success) throw new Error(data.message || "搜索候选人失败");
  return data.data;
};

export const updateParticipantMatches = async (
  activityId: string,
  sourceUserId: string,
  candidateUserIds: string[],
  override?: { allowOverride: boolean; reason: string },
): Promise<{ warning?: string | null }> => {
  const token = getToken();
  const response = await fetch(`/api/match/${activityId}/results/${sourceUserId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ candidateUserIds, ...override }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "保存人工调整失败");
  return data.data || {};
};

export const setParticipantMatchesLock = async (
  activityId: string,
  sourceUserId: string,
  isLocked: boolean,
): Promise<{ isLocked: boolean }> => {
  const token = getToken();
  const response = await fetch(
    `/api/match/${activityId}/results/${sourceUserId}/lock`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ isLocked }),
    },
  );
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "锁定状态更新失败");
  return data.data;
};

export const validateMatchResults = async (
  activityId: string,
): Promise<MatchValidationResult> => {
  const token = getToken();
  const response = await fetch(`/api/match/${activityId}/validation`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "校验匹配结果失败");
  return data.data;
};

export const createMatchAdjustmentDraft = async (
  activityId: string,
): Promise<{
  matchStatusId: string;
  sourceMatchStatusId: string;
  version: number;
  revision: number;
  reused?: boolean;
}> => {
  const token = getToken();
  const response = await fetch(`/api/match/${activityId}/adjustment-drafts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.message || "创建调整草稿失败");
  return data.data;
};

/**
 * 提交匹配任务（调用 execute 接口，后端异步执行）
 * 返回 activityId 作为 taskId，用于后续轮询进度
 */
export const submitMatchingTask = async (
  activityId: string,
  rules: MatchingRule[],
  config?: MatchConstraints,
  participantUserIds?: string[],
): Promise<{ taskId: string }> => {
  await executeMatching({ activityId, rules, config, participantUserIds });
  // 后端立即返回 success，异步执行匹配；用 activityId 作为轮询 key
  return { taskId: activityId };
};

/**
 * 查询匹配任务状态（轮询 /api/match/:eventId/progress）
 */
export const getMatchingTaskStatus = async (
  eventId: string,
): Promise<{
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  message?: string;
}> => {
  const token = getToken();

  const response = await fetch(`/api/match/${eventId}/progress`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || "获取匹配进度失败");
  }

  // 后端返回 status 字段，映射到前端期望的格式
  const statusMap: Record<string, "pending" | "processing" | "completed" | "failed"> = {
    pending: "pending",
    matching_extract: "processing",
    matching_embed: "processing",
    matching_cal_similarity: "processing",
    matching_totalScore: "processing",
    matching_calBestMatch: "processing",
    completed: "completed",
    failed: "failed",
  };

  const progressMap: Record<string, number> = {
    pending: 5,
    matching_extract: 15,
    matching_embed: 40,
    matching_cal_similarity: 70,
    matching_totalScore: 85,
    matching_calBestMatch: 95,
    completed: 100,
    failed: 0,
  };

  const stageMessageMap: Record<string, string> = {
    pending: "匹配任务排队中",
    matching_extract: "正在整理报名信息",
    matching_embed: "正在生成 Embedding",
    matching_cal_similarity: "正在计算匹配相似度",
    matching_totalScore: "正在汇总规则分数",
    matching_calBestMatch: "正在生成最佳匹配结果",
    completed: "匹配完成",
    failed: "匹配失败",
  };

  const backendStatus = data.status || "pending";
  const stageMessage = stageMessageMap[backendStatus] || "正在处理匹配任务";
  const message =
    typeof data.message === "string" &&
    data.message.trim() &&
    data.message !== "查询匹配状态成功"
      ? data.message
      : stageMessage;

  return {
    status: statusMap[backendStatus] ?? "processing",
    progress: progressMap[backendStatus] ?? 50,
    stage: backendStatus,
    message,
  };
};
