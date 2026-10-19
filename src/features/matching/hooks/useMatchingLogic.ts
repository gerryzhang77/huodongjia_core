/**
 * 匹配模块状态管理 Hook (重构版)
 * 简化逻辑，整合规则设置和匹配执行
 *
 * 更新:
 * - 从报名数据获取参与者
 * - 支持异步匹配任务和进度轮询
 * - 支持历史记录回溯
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toast } from "@/components/ui/Toast";
import { matchingQueries } from "../services/matchingQueries";
import { useAuthStore } from "@/features/auth/stores";
import type { Activity } from "@/features/activities/types";

// API 服务函数
import {
  saveMatchRules,
  getMatchGroups,
  getMatchingHistory,
  submitMatchingTask,
  getMatchingTaskStatus,
  preflightMatching,
  saveMatchConfig,
  publishMatchingResult,
  createMatchAdjustmentDraft,
  validateMatchResults,
  MatchingApiError,
} from "../services/matchingApi";
import { sendNotification as sendEnrollmentNotification } from "@/services/enrollmentApi";
import type { NotificationConfig } from "../components/PublishResultDialog";

// 使用重构版类型定义
import type {
  MatchingRule as MatchRule,
  MatchingGroup as MatchGroup,
  MatchConstraints,
  MatchingHistory,
  ParticipantMatchResult,
  MatchingSchemaField,
  MatchingSchemaGroup,
  MatchFieldCatalogItem,
  MatchPreflightResult,
  MatchValidationResult,
} from "../types";
import {
  merchantQueryKeys,
} from "@/features/merchant/queryKeys";

// === 本地类型定义 ===
export type MatchingStage =
  | "idle"
  | "configuring"
  | "matching"
  | "completed"
  | "published";
export type TabKey = "rules" | "results";

// 重新导出 MatchConstraints 类型供外部使用
export type { MatchConstraints };

export interface Participant {
  registrationSummary?: import("@/features/enrollment/types/questionnaire").RegistrationSummary;
  id: string;
  name: string;
  gender?: "male" | "female" | "other";
  age?: number;
  occupation?: string;
  industry?: string;
  avatar?: string;
  tags?: string[];
  bio?: string;
  enrollmentId?: string;
  imageCount?: number;
  registrationTypeId?: string | null;
  registrationTypeName?: string;
  formData?: Record<string, unknown>;
}

export interface MatchingStats {
  avgScore: number;
  minScore: number;
  maxScore: number;
  totalGroups?: number;
  totalParticipants?: number;
}

const DEFAULT_SCHEMA_GROUP_ID = '__default__';
const EMPTY_PARTICIPANTS: Participant[] = [];

// 本地 GroupMember 类型 (兼容多种格式)
export interface LocalGroupMember {
  id: string;
  name: string;
  avatar?: string;
  tags?: string[];
}

// === Hook 配置 ===
interface UseMatchingLogicOptions {
  activityId: string;
  fieldCatalogEnabled?: boolean;
  step?: "participants" | "rules" | "preview" | "execute" | "results";
}

const DEFAULT_OPERATOR = "similarity" as const;

const createEmptyRule = (): MatchRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "未配置规则",
  source_field: "",
  target_field: "",
  operator: DEFAULT_OPERATOR,
  type: DEFAULT_OPERATOR,
  weight: 1,
  enabled: true,
});

const normalizeRuleForUi = (rule: MatchRule, index = 0): MatchRule => {
  const operator = rule.operator || DEFAULT_OPERATOR;
  return {
    ...rule,
    name: `${index + 1}-${operator}`,
    type: rule.type || operator,
    operator,
    weight: typeof rule.weight === "number" ? rule.weight : 1,
    enabled: rule.enabled ?? true,
  };
};

const formatPreflightFailureMessage = (result: MatchPreflightResult): string => {
  if (result.message) return result.message;
  const failedRule = result.ruleDiagnostics.find((item) => !item.canExecute);
  if (failedRule?.message) return failedRule.message;
  const failedField = result.fieldDiagnostics.find((item) => !item.canMatch);
  if (failedField) {
    return `${failedField.label} 覆盖 ${failedField.coverage}/${failedField.totalEligibleParticipants}，无法用于当前匹配`;
  }
  return "当前规则字段覆盖不足，无法开始匹配";
};

const buildRegistrationSchemaGroups = (
  activityData: Activity | undefined,
): MatchingSchemaGroup[] => {
  const registrationTypes = activityData?.registrationTypes ?? [];

  if (registrationTypes.length > 0) {
    return registrationTypes
      .map((type, index) => ({
        id: type?.id ? String(type.id) : `${DEFAULT_SCHEMA_GROUP_ID}-${index}`,
        name: String(type?.name || `报名表 ${index + 1}`),
        fields: Array.isArray(type?.formSchema) ? type.formSchema : [],
      }))
      .filter((group: MatchingSchemaGroup) => group.fields.length > 0);
  }

  const fallbackFields = Array.isArray(activityData?.registrationFormSchema)
    ? activityData.registrationFormSchema
    : [];

  return fallbackFields.length > 0
    ? [{ id: DEFAULT_SCHEMA_GROUP_ID, name: "默认报名表", fields: fallbackFields }]
    : [];
};

const flattenRegistrationSchemaGroups = (
  groups: MatchingSchemaGroup[],
): MatchingSchemaField[] => {
  const fieldsByKey = new Map<string, MatchingSchemaField>();

  for (const group of groups) {
    for (const field of group.fields) {
      if (!field.key || fieldsByKey.has(field.key)) continue;
      fieldsByKey.set(field.key, field);
    }
  }

  return Array.from(fieldsByKey.values());
};

export function useMatchingLogic({
  activityId,
  fieldCatalogEnabled = true,
  step = "rules",
}: UseMatchingLogicOptions) {
  const FOREGROUND_POLL_INTERVAL_MS = 3000;
  const BACKGROUND_POLL_INTERVAL_MS = 5000;
  const queryClient = useQueryClient();
  const queryEnabled = Boolean(activityId);
  const sessionScope = useAuthStore(state => state.user?.id || "anonymous");

  const resultsQuery = useQuery({ ...matchingQueries.results(activityId), enabled: queryEnabled });
  const participantsQuery = useQuery({ ...matchingQueries.participants(activityId, step === "results", sessionScope), enabled: queryEnabled });
  const configQuery = useQuery({ ...matchingQueries.config(activityId), enabled: queryEnabled });
  const needsRules = step === "rules" || step === "preview" || step === "execute";
  const rulesQuery = useQuery({ ...matchingQueries.rules(activityId), enabled: queryEnabled && needsRules });
  const historyQuery = useQuery({ ...matchingQueries.history(activityId), enabled: queryEnabled && step === "results" && resultsQuery.isSuccess });
  const activityQuery = useQuery({ ...matchingQueries.activity(activityId), enabled: queryEnabled && (step !== "results" || resultsQuery.isSuccess) });
  const rulesDirty = useRef(false);
  const constraintsDirty = useRef(false);
  const editVersions = useRef({ rules: 0, constraints: 0 });

  // === 状态定义 ===
  const [stage, setStage] = useState<MatchingStage>("idle");
  const [activeTab, setActiveTab] = useState<TabKey>("rules");

  // 规则相关
  const [rules, setRulesState] = useState<MatchRule[]>([]);
  const [constraints, setConstraintsState] = useState<MatchConstraints>({
    countMode: "range",
    minMatches: 1,
    maxMatches: 3,
    hardRules: [],
    allowManualOverride: false,
  });

  const setRules = useCallback((value: React.SetStateAction<MatchRule[]>) => {
    rulesDirty.current = true;
    editVersions.current.rules += 1;
    setRulesState(value);
  }, []);
  const setConstraints = useCallback((value: React.SetStateAction<MatchConstraints>) => {
    constraintsDirty.current = true;
    editVersions.current.constraints += 1;
    setConstraintsState(value);
  }, []);
  useEffect(() => {
    rulesDirty.current = false;
    constraintsDirty.current = false;
  }, [activityId]);

  // 数据
  const participants = (participantsQuery.data || EMPTY_PARTICIPANTS) as Participant[];
  const [excludedParticipantIds, setExcludedParticipantIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [registrationSchema, setRegistrationSchema] = useState<
    MatchingSchemaField[]
  >([]);
  const [registrationSchemaGroups, setRegistrationSchemaGroups] = useState<
    MatchingSchemaGroup[]
  >([]);
  const [fieldCatalog, setFieldCatalog] = useState<MatchFieldCatalogItem[]>([]);
  const [lastPreflightResult, setLastPreflightResult] =
    useState<MatchPreflightResult | null>(null);
  // per-user top5 匹配结果（新模型）
  const [matchResults, setMatchResults] = useState<ParticipantMatchResult[]>([]);
  // 旧分组结果（历史记录回放用，当前匹配流程不再使用）
  const [groups, setGroups] = useState<MatchGroup[]>([]);
  const [history, setHistory] = useState<MatchingHistory[]>([]);

  const [isMatching, setIsMatching] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isCreatingAdjustmentDraft, setIsCreatingAdjustmentDraft] =
    useState(false);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [matchingProgress, setMatchingProgress] = useState(0);
  const [matchingMessage, setMatchingMessage] = useState<string>("");
  const [lastValidationResult, setLastValidationResult] =
    useState<MatchValidationResult | null>(null);

  // 规则锁定状态 - 匹配进行中时锁定规则编辑
  const [isRulesLocked, setIsRulesLocked] = useState(false);

  // 后台执行状态 - 匹配是否在后台执行
  const [isBackgroundMatching, setIsBackgroundMatching] = useState(false);

  // 当前查看的历史记录ID
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // 已保存的规则配置列表
  const [savedConfigs, setSavedConfigs] = useState<
    Array<{
      id: string;
      name: string;
      rules: MatchRule[];
      savedAt: string;
    }>
  >([]);

  // 任务轮询
  const taskPollingRef = useRef<NodeJS.Timeout | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);
  const preflightFingerprintRef = useRef<string | null>(null);
  const preflightRequestRef = useRef<{ key: string; createdAt: number; controller: AbortController; promise: Promise<MatchPreflightResult> } | null>(null);
  const startingRef = useRef(false);
  const pollInFlightRef = useRef(false);
  const pollFailuresRef = useRef(0);

  // 统计
  const [matchingStats, setMatchingStats] = useState<MatchingStats | null>(
    null,
  );

  const selectedParticipantIds = useMemo(
    () =>
      participants
        .map((participant) => participant.id)
        .filter((participantId) => !excludedParticipantIds.has(participantId)),
    [excludedParticipantIds, participants],
  );
  const selectedParticipantFingerprint = useMemo(
    () => [...selectedParticipantIds].sort().join("|"),
    [selectedParticipantIds],
  );
  const eligibleParticipantCount = selectedParticipantIds.length;
  const settingsFingerprint = JSON.stringify({
    rules: rules.map((rule, index) => normalizeRuleForUi(rule, index)),
    constraints,
    participantUserIds: [...selectedParticipantIds].sort(),
  });
  const currentSettingsRef = useRef(settingsFingerprint);
  currentSettingsRef.current = settingsFingerprint;
  const catalogQuery = useQuery({
    ...matchingQueries.catalog(activityId, selectedParticipantIds),
    enabled: queryEnabled && fieldCatalogEnabled && participantsQuery.isSuccess,
    refetchInterval: fieldCatalogEnabled ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  // Only data needed for this step gates the page. History is non-blocking.
  const requiredQueries = step === "results"
    ? [participantsQuery, resultsQuery, configQuery]
    : step === "participants"
      ? [participantsQuery, resultsQuery]
      : [participantsQuery, rulesQuery, configQuery, activityQuery,
          ...(fieldCatalogEnabled ? [catalogQuery] : [])];
  const isLoading = queryEnabled && requiredQueries.some((query) => query.isPending);
  const loadError = requiredQueries.find((query) => query.isError && !query.data)?.error;
  const refreshError = [...requiredQueries, historyQuery].find((query) => query.isError && query.data)?.error;
  const isRevalidating = requiredQueries.some((query) => query.isFetching);

  const clearTaskPolling = useCallback(() => {
    if (taskPollingRef.current) {
      clearTimeout(taskPollingRef.current);
      taskPollingRef.current = null;
    }
  }, []);

  // === 清理轮询 ===
  useEffect(() => clearTaskPolling, [clearTaskPolling]);

  // React Query 负责跨路由缓存；本地状态只承载尚未保存的编辑值和执行进度。
  useEffect(() => {
    if (!rulesQuery.isSuccess || rulesDirty.current) return;
    const rulesData = rulesQuery.data || [];
    setRulesState(
      rulesData.length > 0
        ? rulesData.map((rule, index) => normalizeRuleForUi(rule, index))
        : [createEmptyRule()],
    );
  }, [rulesQuery.data, rulesQuery.isSuccess]);



  useEffect(() => {
    setExcludedParticipantIds(new Set());
  }, [activityId]);

  useEffect(() => {
    const availableIds = new Set(participants.map((participant) => participant.id));
    setExcludedParticipantIds((current) => {
      const next = new Set(
        Array.from(current).filter((participantId) => availableIds.has(participantId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [participants]);

  useEffect(() => {
    if (!historyQuery.isSuccess) return;
    setHistory((historyQuery.data || []) as MatchingHistory[]);
  }, [historyQuery.data, historyQuery.isSuccess]);

  useEffect(() => {
    const schemaGroups = buildRegistrationSchemaGroups(activityQuery.data);
    setRegistrationSchemaGroups(schemaGroups);
    setRegistrationSchema(flattenRegistrationSchemaGroups(schemaGroups));
  }, [activityQuery.data]);

  useEffect(() => {
    setFieldCatalog(catalogQuery.data?.fields || []);
  }, [catalogQuery.data]);

  const setParticipantSelected = useCallback(
    (participantId: string, selected: boolean) => {
      setExcludedParticipantIds((current) => {
        const next = new Set(current);
        if (selected) next.delete(participantId);
        else next.add(participantId);
        return next;
      });
    },
    [],
  );

  const setParticipantsSelected = useCallback((ids: string[], selected: boolean) => {
    setExcludedParticipantIds(current => {
      const next = new Set(current);
      ids.forEach(id => selected ? next.delete(id) : next.add(id));
      return next;
    });
  }, []);

  const selectAllParticipants = useCallback(() => {
    setExcludedParticipantIds(new Set());
  }, []);

  const getPreflight = useCallback((fingerprint: string) => {
    const previous = preflightRequestRef.current;
    if (previous?.key === fingerprint && Date.now() - previous.createdAt < 30_000) return previous.promise;
    previous?.controller.abort();
    const settings = JSON.parse(fingerprint) as { rules: MatchRule[]; constraints: MatchConstraints; participantUserIds: string[] };
    const controller = new AbortController();
    const enabled = settings.rules.filter(rule => rule.enabled && rule.source_field && rule.target_field && rule.operator);
    const promise = preflightMatching(activityId, enabled, settings.constraints, settings.participantUserIds, controller.signal);
    const request = { key: fingerprint, controller, promise, createdAt: Date.now() };
    preflightRequestRef.current = request;
    void promise.catch(() => { if (preflightRequestRef.current === request) preflightRequestRef.current = null; });
    return promise;
  }, [activityId]);

  useEffect(() => {
    setLastPreflightResult(null);
    preflightFingerprintRef.current = null;
    setPreflightError(null);
    return () => { preflightRequestRef.current?.controller.abort(); preflightRequestRef.current = null; };
  }, [activityId, settingsFingerprint]);

  useEffect(() => {
    const settings = JSON.parse(settingsFingerprint) as { rules: MatchRule[]; constraints: MatchConstraints; participantUserIds: string[] };
    const enabled = settings.rules.filter(rule => rule.enabled && rule.source_field && rule.target_field && rule.operator);
    if (!activityId || !rulesQuery.isSuccess || !configQuery.isSuccess || !participantsQuery.isSuccess ||
      !["rules", "preview", "execute"].includes(step) || isMatching || enabled.length === 0 || settings.participantUserIds.length < 2) {
      setIsCheckingAvailability(false);
      return;
    }
    let active = true;
    setIsCheckingAvailability(true);
    const timer = setTimeout(() => {
      void getPreflight(settingsFingerprint)
        .then(result => {
          if (!active || currentSettingsRef.current !== settingsFingerprint) return;
          preflightFingerprintRef.current = settingsFingerprint;
          setLastPreflightResult(result);
          setPreflightError(null);
        }).catch(error => {
          if (active && !preflightRequestRef.current?.controller.signal.aborted) setPreflightError(error instanceof Error ? error.message : "检查暂时失败，开始匹配时将重新检查");
        }).finally(() => { if (active) setIsCheckingAvailability(false); });
    }, 600);
    // Step changes reuse the same request; only a settings change/unmount aborts it.
    return () => { active = false; clearTimeout(timer); };
  }, [activityId, settingsFingerprint, step, isMatching, rulesQuery.isSuccess, configQuery.isSuccess, participantsQuery.isSuccess, getPreflight]);

  useEffect(() => {
    if (configQuery.data && !constraintsDirty.current) setConstraintsState(configQuery.data);
  }, [configQuery.data]);

  useEffect(() => {
    if (!resultsQuery.isSuccess) return;
    const matchData = resultsQuery.data;
    const nextResults = matchData?.results || [];
    setMatchResults(nextResults);
    if (nextResults.length > 0) {
      setStage(
        matchData?.resultState === "published" ? "published" : "completed",
      );
      setActiveTab("results");
      setMatchingStats(
        matchData?.stats
          ? {
              avgScore: matchData.stats.averageScore,
              minScore: matchData.stats.minScore,
              maxScore: matchData.stats.maxScore,
              totalGroups: nextResults.length,
              totalParticipants:
                matchData.stats.totalParticipants ||
                (participantsQuery.data || []).length,
            }
          : null,
      );
    } else {
      setStage("configuring");
      setMatchingStats(null);
    }
  }, [
    participantsQuery.data,
    resultsQuery.data,
    resultsQuery.isSuccess,
  ]);

  // === 保存所有规则配置到后端 ===
  const handleSaveRules = useCallback(
    async (configName: string) => {
      try {
        const savedVersions = { ...editVersions.current };
        const normalizedRules = rules.map((rule, index) =>
          normalizeRuleForUi(rule, index),
        );
        await Promise.all([
          saveMatchRules(activityId, normalizedRules),
          saveMatchConfig(activityId, constraints),
        ]);
        queryClient.setQueryData(
          merchantQueryKeys.matchingRules(activityId),
          normalizedRules,
        );
        queryClient.setQueryData(
          merchantQueryKeys.matchingConfig(activityId),
          constraints,
        );

        const newConfig = {
          id: `config_${Date.now()}`,
          name: configName,
          rules: normalizedRules,
          savedAt: new Date().toISOString(),
        };
        setSavedConfigs((prev) => [newConfig, ...prev]);
        if (editVersions.current.rules === savedVersions.rules) {
          rulesDirty.current = false;
          setRulesState(normalizedRules);
        }
        if (editVersions.current.constraints === savedVersions.constraints) {
          constraintsDirty.current = false;
        }
        Toast.show({ content: `配置"${configName}"已保存`, icon: "success" });
      } catch (error) {
        console.error("Failed to save rules:", error);
        Toast.show({ content: "保存失败", icon: "fail" });
        throw error;
      }
    },
    [activityId, constraints, queryClient, rules],
  );

  // === 加载已保存的配置 ===
  const handleLoadConfig = useCallback(
    (config: {
      id: string;
      name: string;
      rules: MatchRule[];
      savedAt: string;
    }) => {
      // 应用配置中的规则
      setRules(
        config.rules.map((rule, index) => normalizeRuleForUi(rule, index)),
      );
      Toast.show({ content: `已加载配置"${config.name}"`, icon: "success" });
    },
    [],
  );

  // === 删除已保存的配置 ===
  const handleDeleteConfig = useCallback((configId: string) => {
    setSavedConfigs((prev) => prev.filter((c) => c.id !== configId));
    Toast.show({ content: "配置已删除", icon: "success" });
  }, []);

  // === 轮询任务状态（传入 activityId） ===
  const pollTaskStatus = useCallback(
    async (eventId: string) => {
      const taskId = currentTaskIdRef.current;
      if (!taskId || pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const status = await getMatchingTaskStatus(eventId, taskId);
        if (currentTaskIdRef.current !== taskId) return;
        pollFailuresRef.current = 0;
        setMatchingProgress(status.progress);
        setMatchingMessage(status.message || "");
        if (status.status === "completed" || status.status === "failed") {
          clearTaskPolling();
          currentTaskIdRef.current = null;
          setIsMatching(false);
          setIsRulesLocked(false);
          if (status.status === "failed") {
            setStage("configuring");
            Toast.show({ content: status.message || "匹配失败", icon: "fail" });
          } else {
            const [resultRefresh] = await Promise.allSettled([
              queryClient.fetchQuery({ ...matchingQueries.results(activityId), staleTime: 0 }),
              queryClient.fetchQuery({ ...matchingQueries.history(activityId), staleTime: 0 }),
            ]);
            void queryClient.invalidateQueries({ queryKey: merchantQueryKeys.activities() });
            Toast.show({ content: resultRefresh.status === "fulfilled" ? "匹配完成" : "匹配已完成，结果加载失败，请刷新重试", icon: resultRefresh.status === "fulfilled" ? "success" : "fail" });
          }
        }
      } catch (error) {
        if (currentTaskIdRef.current !== taskId) return;
        pollFailuresRef.current += 1;
        setMatchingMessage(`进度连接暂时中断，正在重试（${pollFailuresRef.current}/5）`);
        if (pollFailuresRef.current >= 5) {
          currentTaskIdRef.current = null;
          setIsMatching(false);
          setIsRulesLocked(false);
          clearTaskPolling();
          Toast.show({ content: "暂时无法获取进度，后台任务仍会继续，请刷新页面查看", icon: "fail" });
        }
      } finally {
        pollInFlightRef.current = false;
        if (currentTaskIdRef.current === taskId) {
          clearTaskPolling();
          taskPollingRef.current = setTimeout(() => void pollTaskStatus(eventId),
            pollFailuresRef.current ? Math.min(15_000, 3000 * pollFailuresRef.current) : isBackgroundMatching ? BACKGROUND_POLL_INTERVAL_MS : FOREGROUND_POLL_INTERVAL_MS);
        }
      }
    },
    [activityId, clearTaskPolling, isBackgroundMatching, queryClient],
  );

  useEffect(() => {
    if (!isMatching || !currentTaskIdRef.current) return;
    void pollTaskStatus(activityId);
    return clearTaskPolling;
  }, [activityId, clearTaskPolling, isBackgroundMatching, isMatching, pollTaskStatus]);

  useEffect(() => {
    if (!queryEnabled) return;
    let active = true;
    void (async () => {
      try {
        const status = await getMatchingTaskStatus(activityId);
        if (!active || !status?.active || !status.taskId || currentTaskIdRef.current) return;
        currentTaskIdRef.current = status.taskId;
        pollFailuresRef.current = 0;
        setIsMatching(true);
        setIsRulesLocked(true);
        setStage("matching");
        setMatchingProgress(status.progress);
        setMatchingMessage(status.message || "正在恢复匹配进度...");
      } catch { /* A page with no previous run can still configure matching. */ }
    })();
    return () => { active = false; currentTaskIdRef.current = null; clearTaskPolling(); };
  }, [activityId, queryEnabled, clearTaskPolling]);

  const handleRunPreflight = useCallback(async () => {
    const normalizedRules = rules.map((rule, index) =>
      normalizeRuleForUi(rule, index),
    );
    const enabledRules = normalizedRules.filter(
      (rule) =>
        rule.enabled &&
        rule.source_field &&
        rule.target_field &&
        rule.operator,
    );
    if (enabledRules.length === 0) {
      Toast.show({ content: "请至少启用一条匹配规则", icon: "fail" });
      return null;
    }

    if (eligibleParticipantCount < 2) {
      Toast.show({ content: "至少选择 2 位参与人", icon: "fail" });
      return null;
    }

    setIsPreflighting(true);
    const requestedFingerprint = currentSettingsRef.current;
    try {
      const preflightResult = await getPreflight(requestedFingerprint);
      if (requestedFingerprint !== currentSettingsRef.current) return null;
      preflightFingerprintRef.current = requestedFingerprint;
      setLastPreflightResult(preflightResult);
      if (!preflightResult.canExecute) {
        Toast.show({
          content: formatPreflightFailureMessage(preflightResult),
          icon: "fail",
        });
        return null;
      }
      preflightFingerprintRef.current = JSON.stringify({
        rules: normalizedRules,
        constraints,
        participantUserIds: [...selectedParticipantIds].sort(),
      });
      return { normalizedRules, enabledRules, preflightResult };
    } catch (error) {
      console.error("Matching preflight failed:", error);
      if (requestedFingerprint === currentSettingsRef.current) Toast.show({ content: error instanceof Error ? error.message : "匹配预检失败", icon: "fail" });
      return null;
    } finally {
      setIsPreflighting(false);
    }
  }, [
    activityId,
    constraints,
    eligibleParticipantCount,
    rules,
    selectedParticipantIds,
    getPreflight,
  ]);

  // === 开始匹配 (异步任务) ===
  const runStartMatching = useCallback(async () => {
    const currentNormalizedRules = rules.map((rule, index) =>
      normalizeRuleForUi(rule, index),
    );
    const fingerprint = JSON.stringify({
      rules: currentNormalizedRules,
      constraints,
      participantUserIds: [...selectedParticipantIds].sort(),
    });
    const cachedPreflightIsCurrent =
      lastPreflightResult?.canExecute === true &&
      preflightFingerprintRef.current === fingerprint &&
      Date.now() - (preflightRequestRef.current?.createdAt || 0) < 30_000;
    const preflight = cachedPreflightIsCurrent
      ? {
          normalizedRules: currentNormalizedRules,
          enabledRules: currentNormalizedRules.filter(
            (rule) =>
              rule.enabled &&
              rule.source_field &&
              rule.target_field &&
              rule.operator,
          ),
          preflightResult: lastPreflightResult,
        }
      : await handleRunPreflight();
    if (!preflight) return;
    const { normalizedRules, enabledRules } = preflight;

    setIsMatching(true);
    setMatchingProgress(0);
    setMatchingMessage("正在提交匹配任务...");
    setStage("matching");
    setIsRulesLocked(true);

    try {
      setRules(normalizedRules);
      // 开始匹配即固化本次硬约束，确保刷新页面、人工调整与运行快照保持一致。
      await saveMatchConfig(activityId, constraints);
      const { taskId } = await submitMatchingTask(
        activityId,
        enabledRules,
        constraints,
        selectedParticipantIds,
      );
      currentTaskIdRef.current = taskId;
      pollFailuresRef.current = 0;
      clearTaskPolling();
      void pollTaskStatus(activityId);
    } catch (error) {
      console.error("Failed to start matching:", error);
      const diagnostics =
        error instanceof MatchingApiError ? error.diagnostics : undefined;
      Toast.show({
        content: diagnostics
          ? formatPreflightFailureMessage(diagnostics)
          : error instanceof Error
            ? error.message
            : "提交匹配任务失败",
        icon: "fail",
      });
      setIsMatching(false);
      setIsRulesLocked(false);
      setStage("configuring");
      clearTaskPolling();
    }
  }, [
    activityId,
    clearTaskPolling,
    constraints,
    handleRunPreflight,
    lastPreflightResult,
    pollTaskStatus,
    rules,
    selectedParticipantIds,
  ]);

  const handleStartMatching = useCallback(async () => {
    if (startingRef.current || currentTaskIdRef.current) return;
    startingRef.current = true;
    try { await runStartMatching(); } finally { startingRef.current = false; }
  }, [runStartMatching]);

  // === 最小化匹配进度到后台 ===
  const handleMinimizeMatching = useCallback(() => {
    setIsBackgroundMatching(true);
  }, []);

  // === 展开匹配进度 ===
  const handleExpandMatching = useCallback(() => {
    setIsBackgroundMatching(false);
  }, []);

  // === 重新匹配（等同于再跑一次 execute） ===
  // 切回规则 Tab 让用户调整规则后再开始
  const handleEnterRematchMode = useCallback(() => {
    setActiveTab("rules");
    Toast.show({ content: "请调整规则后点击开始匹配", icon: "success" });
  }, []);

  // === 发布结果 ===
  const handlePublish = useCallback(
    async (
      sendResultNotification = true,
      notificationConfig?: NotificationConfig,
    ) => {
      if (matchResults.length === 0) {
        Toast.show({ content: "暂无匹配结果", icon: "fail" });
        return;
      }

      setIsPublishing(true);
      try {
        const published = await publishMatchingResult(activityId);
        let notificationFailed = false;
        let notifiedCount = 0;
        const publishedEnrollmentIdSet = new Set(published.enrollmentIds);
        const requestedEnrollmentIds =
          notificationConfig?.recipientEnrollmentIds ?? published.enrollmentIds;
        const notificationEnrollmentIds = Array.from(
          new Set(
            requestedEnrollmentIds.filter((enrollmentId) =>
              publishedEnrollmentIdSet.has(enrollmentId),
            ),
          ),
        );
        if (sendResultNotification && notificationEnrollmentIds.length > 0) {
          try {
            const notificationResult = await sendEnrollmentNotification(activityId, {
              enrollmentIds: notificationEnrollmentIds,
              title: "匹配结果已发布",
              type: "matching",
              message:
                notificationConfig?.content.trim() ||
                `「${activityQuery.data?.title || "本次活动"}」的匹配结果已发布，查看为你推荐的伙伴`,
            });
            notifiedCount =
              notificationResult.sentCount ?? notificationEnrollmentIds.length;
          } catch (notificationError) {
            notificationFailed = true;
            console.error("Match result published but notification failed:", notificationError);
          }
        }
        setStage("published");
        if (resultsQuery.data) {
          queryClient.setQueryData(
            merchantQueryKeys.matchingResults(activityId),
            { ...resultsQuery.data, resultState: "published" as const },
          );
        }
        Toast.show({
          content: notificationFailed
            ? "结果已发布，但通知发送失败，可在报名管理中重新通知"
            : sendResultNotification && notifiedCount === 0
            ? "结果已发布，但没有通知送达，请检查账号绑定或通知偏好"
            : sendResultNotification
            ? `结果发布成功，已通知 ${notifiedCount} 位参与者`
            : "结果发布成功",
          icon: "success",
        });
        void queryClient.invalidateQueries({ queryKey: merchantQueryKeys.matchingHistory(activityId) });
        void queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.activities(),
        });
      } catch (error) {
        console.error("Publish failed:", error);
        if (error instanceof MatchingApiError && error.validation) {
          setLastValidationResult(error.validation);
        }
        Toast.show({
          content: error instanceof Error ? error.message : "发布失败，请重试",
          icon: "fail"
        });
        throw error;
      } finally {
        setIsPublishing(false);
      }
    },
    [
      activityId,
      activityQuery.data?.title,
      matchResults.length,
      queryClient,
      resultsQuery.data,
    ],
  );

  const handleValidateResults = useCallback(async () => {
    setIsValidating(true);
    try {
      const validation = await validateMatchResults(activityId);
      setLastValidationResult(validation);
      queryClient.setQueryData(
        merchantQueryKeys.matchingValidation(activityId),
        validation,
      );
      Toast.show({
        content: validation.valid
          ? "校验通过，可以发布"
          : validation.issues[0]?.message || "结果仍有冲突",
        icon: validation.valid ? "success" : "fail",
      });
      return validation;
    } catch (error) {
      Toast.show({
        content: error instanceof Error ? error.message : "校验失败",
        icon: "fail",
      });
      throw error;
    } finally {
      setIsValidating(false);
    }
  }, [activityId, queryClient]);

  const handleCreateAdjustmentDraft = useCallback(async () => {
    setIsCreatingAdjustmentDraft(true);
    try {
      const draft = await createMatchAdjustmentDraft(activityId);
      const [matchData, historyData] = await Promise.all([
        getMatchGroups(activityId),
        getMatchingHistory(activityId),
      ]);
      queryClient.setQueryData(
        merchantQueryKeys.matchingResults(activityId),
        matchData,
      );
      queryClient.setQueryData(
        merchantQueryKeys.matchingHistory(activityId),
        historyData,
      );
      setMatchResults(matchData.results);
      setHistory(historyData);
      setStage("completed");
      setActiveTab("results");
      setLastValidationResult(null);
      Toast.show({
        content: draft.reused
          ? `已进入未发布的第 ${draft.version} 版调整草稿`
          : `已从已发布结果创建第 ${draft.version} 版调整草稿`,
        icon: "success",
      });
      return draft;
    } catch (error) {
      Toast.show({
        content: error instanceof Error ? error.message : "创建调整草稿失败",
        icon: "fail",
      });
      throw error;
    } finally {
      setIsCreatingAdjustmentDraft(false);
    }
  }, [activityId, queryClient]);

  // === 查看历史记录 ===
  const handleViewHistory = useCallback((historyItem: MatchingHistory) => {
    if (historyItem.groups && historyItem.groups.length > 0) {
      const convertedGroups = convertHistoryGroups(historyItem.groups);
      setGroups(convertedGroups);
      setMatchingStats({
        avgScore: historyItem.statistics.avgScore,
        minScore: historyItem.statistics.minScore,
        maxScore: historyItem.statistics.maxScore,
        totalGroups: historyItem.statistics.totalGroups,
        totalParticipants: historyItem.statistics.totalParticipants,
      });
      setCurrentHistoryId(historyItem.id); // 设置当前查看的历史记录ID
      setActiveTab("results");
    }
  }, []);

  // === 恢复历史记录（作为当前结果） ===
  const handleRestoreHistory = useCallback(
    (historyItem: MatchingHistory) => {
      handleViewHistory(historyItem);
      setCurrentHistoryId(null); // 清除历史ID，表示这是当前结果
      Toast.show({ content: "已恢复该历史记录作为当前结果", icon: "success" });
    },
    [handleViewHistory],
  );

  // === 刷新数据 ===
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Query failures retain existing data. Never replace a failed read with [].
      const queries = [
        matchingQueries.participants(activityId, step === "results", sessionScope), matchingQueries.results(activityId),
        matchingQueries.config(activityId), matchingQueries.activity(activityId),
        ...(needsRules ? [matchingQueries.rules(activityId)] : []),
        ...(step === "results" ? [matchingQueries.history(activityId)] : []),
        ...(fieldCatalogEnabled ? [matchingQueries.catalog(activityId, selectedParticipantIds)] : []),
      ];
      await Promise.all(queries.map(async (options) => {
        await queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
        await queryClient.fetchQuery({ ...options, staleTime: 0 } as Parameters<typeof queryClient.fetchQuery>[0]);
      }));

      Toast.show({ content: "数据已刷新", icon: "success" });
    } catch (error) {
      console.error("Refresh failed:", error);
      Toast.show({ content: "刷新失败", icon: "fail" });
    } finally {
      setIsRefreshing(false);
    }
  }, [
    activityId,
    fieldCatalogEnabled,
    needsRules,
    step,
    sessionScope,
    queryClient,
    selectedParticipantIds,
  ]);

  // === 返回状态和方法 ===
  return {
    // 状态
    stage,
    activeTab,
    isLoading,
    loadError,
    refreshError,
    isRevalidating,
    isMatching,
    isPublishing,
    isCreatingAdjustmentDraft,
    isPreflighting,
    isCheckingAvailability,
    preflightError,
    isValidating,
    isRefreshing,
    isParticipantsRefreshing:
      participantsQuery.isFetching || catalogQuery.isFetching,
    isRulesLocked,
    matchingProgress,
    matchingMessage,

    isBackgroundMatching,
    currentHistoryId,

    // 数据
    rules,
    constraints,
    participants,
    selectedParticipantIds,
    resultParticipantUserIds: resultsQuery.data?.participantUserIds || [],
    matchResults,
    groups, // 历史记录回放保留
    history,
    matchingStats,
    savedConfigs,
    registrationSchema,
    registrationSchemaGroups,
    fieldCatalog,
    eligibleParticipantCount,
    lastPreflightResult: preflightFingerprintRef.current === settingsFingerprint ? lastPreflightResult : null,
    lastValidationResult,
    resultConstraints: resultsQuery.data?.config || constraints,
    resultState: resultsQuery.data?.resultState,
    matchStatusId: resultsQuery.data?.matchStatusId,
    resultVersion: resultsQuery.data?.version,
    resultRevision: resultsQuery.data?.revision,

    // 设置方法
    setActiveTab,
    setRules,
    setConstraints,
    setGroups,
    setParticipantSelected,
    setParticipantsSelected,
    selectAllParticipants,

    // 规则操作
    handleSaveRules,
    handleLoadConfig,
    handleDeleteConfig,

    // 匹配操作
    handleStartMatching,
    handleRunPreflight,
    handlePublish,
    handleValidateResults,
    handleCreateAdjustmentDraft,
    handleViewHistory,
    handleRestoreHistory,
    handleRefresh,

    // 重新匹配入口（仅切回规则 Tab）
    handleEnterRematchMode,

    // 后台匹配操作
    handleMinimizeMatching,
    handleExpandMatching,
  };
}

// === 辅助函数：转换历史记录中的分组格式 ===
function convertHistoryGroups(historyGroups: unknown[]): MatchGroup[] {
  return historyGroups.map((rawGroup, index) => {
    const group =
      rawGroup && typeof rawGroup === "object"
        ? (rawGroup as Record<string, unknown>)
        : {};
    const rawMembers = Array.isArray(group.members) ? group.members : [];
    const rawReasons = Array.isArray(group.match_reasons)
      ? group.match_reasons
      : Array.isArray(group.reasons)
        ? group.reasons
        : [];
    const rawScore = Number(group.similarity_score ?? group.score ?? 0);

    return {
      id: String(group.group_id || group.id || `group_${index}`),
      name: String(group.group_name || group.name || `第${index + 1}组`),
      members: rawMembers
        .map((rawMember) => {
          if (typeof rawMember === "string") return rawMember;
          if (!rawMember || typeof rawMember !== "object") return "";
          const member = rawMember as Record<string, unknown>;
          return String(member.user_id || member.id || "");
        })
        .filter(Boolean),
      score: Math.round((Number.isFinite(rawScore) ? rawScore : 0) * 100),
      reasons: rawReasons.filter(
        (reason): reason is string => typeof reason === "string",
      ),
      isLocked: Boolean(group.is_locked ?? group.isLocked),
    };
  });
}

export default useMatchingLogic;
