import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSliders,
  ListChecks,
  Loader2,
  PlayCircle,
  Search,
  Users,
} from "lucide-react";
import MerchantLayout from "@/components/layout/MerchantLayout";
import { Button } from "@/components/ui";
import { RulesTab, ResultsTab } from "@/features/matching/components";
import type { NotificationConfig } from "@/features/matching/components/PublishResultDialog";
import {
  findDuplicateRuleIndexes,
  hasInvalidEnabledRules,
  hasIncompleteEnabledRules,
} from "@/features/matching/components/RulesTab/rulePresentation";
import {
  MatchingProgressBanner,
  MatchingProgressOverlay,
} from "@/features/matching/components/MatchingProgressOverlay";
import { useMatchingLogic } from "@/features/matching/hooks/useMatchingLogic";
import type { MatchResultState } from "@/features/matching/types";

type WizardStep =
  | "participants"
  | "rules"
  | "preview"
  | "execute"
  | "results";

const WIZARD_STEPS: Array<{
  key: WizardStep;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
}> = [
  { key: "participants", label: "选择参与人", shortLabel: "参与人", icon: Users },
  { key: "rules", label: "设置规则", shortLabel: "规则", icon: FileSliders },
  { key: "preview", label: "预览与校验", shortLabel: "校验", icon: ClipboardCheck },
  { key: "execute", label: "执行匹配", shortLabel: "执行", icon: PlayCircle },
  { key: "results", label: "查看结果", shortLabel: "结果", icon: ListChecks },
];

const isWizardStep = (value: string | null): value is WizardStep =>
  WIZARD_STEPS.some((step) => step.key === value);

const MatchingConfigPage: React.FC = () => {
  const { id: activityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSavingRules, setIsSavingRules] = useState(false);
  const [participantSearch, setParticipantSearch] = useState("");
  const hasExplicitStep = isWizardStep(searchParams.get("step"));
  const [wizardStep, setWizardStepState] = useState<WizardStep>(() =>
    isWizardStep(searchParams.get("step"))
      ? searchParams.get("step") as WizardStep
      : "participants",
  );

  const locationState = location.state as {
    returnTo?: string;
    enrollmentReturnTo?: string;
  } | null;
  const returnTo =
    locationState?.returnTo ||
    (activityId ? `/dashboard/activity/${activityId}/detail` : "/dashboard");

  const matching = useMatchingLogic({
    activityId: activityId || "",
    fieldCatalogEnabled: wizardStep === "rules",
    step: wizardStep,
  });
  const {
    stage,
    isLoading,
    loadError,
    refreshError,
    isRevalidating,
    isMatching,
    isPublishing,
    isCreatingAdjustmentDraft,
    isPreflighting,
    isValidating,
    isParticipantsRefreshing,
    isRulesLocked,
    matchingProgress,
    matchingMessage,
    isBackgroundMatching,
    currentHistoryId,
    rules,
    constraints,
    participants,
    selectedParticipantIds,
    resultParticipantUserIds,
    matchResults,
    history,
    registrationSchema,
    registrationSchemaGroups,
    fieldCatalog,
    eligibleParticipantCount,
    lastPreflightResult,
    lastValidationResult,
    resultState,
    matchStatusId,
    resultVersion,
    resultRevision,
    setRules,
    setConstraints,
    setParticipantSelected,
    selectAllParticipants,
    handleSaveRules,
    handleRunPreflight,
    handleStartMatching,
    handlePublish,
    handleValidateResults,
    handleCreateAdjustmentDraft,
    handleRefresh,
    handleEnterRematchMode,
    handleMinimizeMatching,
    handleExpandMatching,
  } = matching;

  const setWizardStep = useCallback(
    (step: WizardStep) => {
      setWizardStepState(step);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("step", step);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    if (isLoading || hasExplicitStep) return;
    if (stage === "completed" || stage === "published") {
      setWizardStep("results");
    }
  }, [hasExplicitStep, isLoading, setWizardStep, stage]);

  useEffect(() => {
    if (isMatching && wizardStep !== "execute") setWizardStep("execute");
  }, [isMatching, setWizardStep, wizardStep]);

  const selectedParticipantIdSet = useMemo(
    () => new Set(selectedParticipantIds),
    [selectedParticipantIds],
  );
  const filteredParticipants = useMemo(() => {
    const keyword = participantSearch.trim().toLowerCase();
    if (!keyword) return participants;
    return participants.filter((participant) =>
      participant.name.toLowerCase().includes(keyword),
    );
  }, [participantSearch, participants]);
  const showRegistrationType = useMemo(
    () =>
      new Set(
        participants.map(
          (participant) =>
            participant.registrationTypeId ||
            participant.registrationTypeName ||
            "__default__",
        ),
      ).size > 1,
    [participants],
  );
  const resultParticipantIdSet = useMemo(
    () => new Set(resultParticipantUserIds),
    [resultParticipantUserIds],
  );
  const resultParticipants = useMemo(
    () =>
      resultParticipantIdSet.size > 0
        ? participants.filter((participant) =>
            resultParticipantIdSet.has(participant.id),
          )
        : participants,
    [participants, resultParticipantIdSet],
  );
  const resultEligibleParticipantCount =
    resultParticipantIdSet.size || eligibleParticipantCount;

  const enabledRules = useMemo(
    () =>
      rules.filter(
        (rule) =>
          rule.enabled &&
          rule.source_field &&
          rule.target_field &&
          rule.operator,
      ),
    [rules],
  );
  const rulesReadyToContinue =
    enabledRules.length > 0 &&
    !hasIncompleteEnabledRules(rules) &&
    !hasInvalidEnabledRules(rules) &&
    findDuplicateRuleIndexes(rules).size === 0;
  const currentStepIndex = WIZARD_STEPS.findIndex(
    (step) => step.key === wizardStep,
  );
  const effectiveResultState: MatchResultState | undefined =
    resultState ||
    (stage === "published"
      ? "published"
      : matchResults.length
        ? "draft"
        : undefined);

  const handleBack = () => {
    navigate(
      returnTo,
      locationState?.enrollmentReturnTo
        ? { state: { returnTo: locationState.enrollmentReturnTo } }
        : undefined,
    );
  };

  const saveRulesAndContinue = async () => {
    if (!rulesReadyToContinue) return;
    setIsSavingRules(true);
    try {
      await handleSaveRules("默认配置");
      setWizardStep("preview");
    } finally {
      setIsSavingRules(false);
    }
  };

  const runPreflight = async () => {
    const result = await handleRunPreflight();
    if (result?.preflightResult.canExecute) setWizardStep("execute");
  };

  const publishAdapter = async (
    sendNotification?: boolean,
    notificationConfig?: NotificationConfig,
  ): Promise<void | { success: boolean; error?: string }> => {
    try {
      await handlePublish(sendNotification ?? true, notificationConfig);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "发布失败",
      };
    }
  };

  if (loadError) {
    return (
      <MerchantLayout title="智能匹配" showBack onBack={handleBack}>
        <div role="alert" className="flex flex-col items-center gap-4 py-20">
          <AlertCircle className="text-red-400" size={36} />
          <p>{loadError instanceof Error ? loadError.message : "匹配数据加载失败"}</p>
          <Button onClick={() => void handleRefresh()}>重新加载</Button>
        </div>
      </MerchantLayout>
    );
  }

  if (isLoading) {
    return (
      <MerchantLayout title="智能匹配" showBack onBack={handleBack}>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={40} className="mb-4 animate-spin text-primary-400" />
          <p className="text-gray-500">{wizardStep === "results" ? "正在加载匹配结果..." : "正在加载匹配数据..."}</p>
        </div>
      </MerchantLayout>
    );
  }

  if (!activityId) {
    return (
      <MerchantLayout title="智能匹配" showBack onBack={() => navigate("/dashboard")}>
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle size={40} className="mb-4 text-red-400" />
          <p className="mb-2 font-medium text-gray-900">活动不存在</p>
          <Button onClick={() => navigate("/dashboard")}>返回活动列表</Button>
        </div>
      </MerchantLayout>
    );
  }

  return (
    <MerchantLayout title="智能匹配" showBack onBack={handleBack}>
      <MatchingProgressBanner
        visible={isBackgroundMatching}
        progress={matchingProgress}
        message={matchingMessage}
        onExpand={handleExpandMatching}
      />

      <div className="mx-auto max-w-6xl space-y-5 px-1 py-3 md:px-5 md:py-6">
        {refreshError ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <span>最新数据读取失败，当前显示上次加载的内容。请刷新后再操作。</span>
            <Button size="small" onClick={() => void handleRefresh()}>重试</Button>
          </div>
        ) : isRevalidating && !isMatching ? (
          <p role="status" className="text-sm text-gray-500">正在核对最新数据...</p>
        ) : null}
        {wizardStep !== "results" && (
          <nav aria-label="匹配配置步骤">
            <ol className="flex min-w-0 items-center rounded-2xl border border-gray-100 bg-white p-2 shadow-sm md:min-w-[650px]">
              {WIZARD_STEPS.map((step, index) => {
                const Icon = step.icon;
                const active = step.key === wizardStep;
                const complete = index < currentStepIndex;
                const reachable =
                  index <= currentStepIndex ||
                  (step.key === "results" && matchResults.length > 0);
                return (
                  <React.Fragment key={step.key}>
                    <li className="min-w-0 flex-1">
                      <button
                        type="button"
                        disabled={!reachable}
                        onClick={() => setWizardStep(step.key)}
                        aria-current={active ? "step" : undefined}
                        className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 md:flex-row md:gap-2 md:px-2 md:py-2.5 md:text-sm ${
                          active
                            ? "bg-primary-50 text-primary-700"
                            : complete
                              ? "text-emerald-600 hover:bg-emerald-50"
                              : "text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            active
                              ? "bg-primary-500 text-white"
                              : complete
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {complete ? <Check size={14} /> : <Icon size={14} />}
                        </span>
                        <span className="hidden lg:inline">{step.label}</span>
                        <span className="lg:hidden">{step.shortLabel}</span>
                      </button>
                    </li>
                    {index < WIZARD_STEPS.length - 1 && (
                      <ChevronRight
                        size={15}
                        className="hidden shrink-0 text-gray-300 sm:block"
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </ol>
          </nav>
        )}

        {wizardStep === "participants" && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">
                      本次参与匹配 {eligibleParticipantCount} 人
                    </h2>
                    {isParticipantsRefreshing && (
                      <Loader2
                        size={16}
                        aria-label="正在更新参与人"
                        className="animate-spin text-gray-400"
                      />
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate(`/dashboard/activity/${activityId}/enrollment`, {
                      state: { returnTo: `${location.pathname}?step=participants` },
                    })
                  }
                >
                  管理报名
                </Button>
              </div>

              {participants.length > 0 ? (
                <div className="mt-5 overflow-hidden rounded-xl border border-gray-100">
                  <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <label className="relative block w-full sm:max-w-sm">
                      <Search
                        size={16}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="search"
                        value={participantSearch}
                        onChange={(event) => setParticipantSearch(event.target.value)}
                        placeholder="搜索姓名"
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                      />
                    </label>
                    {eligibleParticipantCount < participants.length && (
                      <button
                        type="button"
                        onClick={selectAllParticipants}
                        className="shrink-0 text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        全选
                      </button>
                    )}
                  </div>

                  <div className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
                    {filteredParticipants.map((participant) => {
                      const selected = selectedParticipantIdSet.has(participant.id);
                      return (
                        <label
                          key={participant.id}
                          className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              setParticipantSelected(
                                participant.id,
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4 shrink-0 accent-primary-500"
                            aria-label={`${selected ? "取消选择" : "选择"}${participant.name}`}
                          />
                          {participant.avatar ? (
                            <img
                              src={participant.avatar}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-full bg-gray-100 object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-medium text-primary-600">
                              {participant.name.slice(0, 1)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                            {participant.name}
                          </span>
                          {showRegistrationType && (
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
                              {participant.registrationTypeName || "默认报名"}
                            </span>
                          )}
                        </label>
                      );
                    })}
                    {filteredParticipants.length === 0 && (
                      <div className="py-10 text-center text-sm text-gray-500">
                        没有找到相关参与人
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
                  暂无可匹配参与人，请先在报名管理中审核报名。
                </div>
              )}
              {participants.length > 0 && eligibleParticipantCount < 2 && (
                <p className="mt-3 text-sm text-orange-600">至少选择 2 人才能继续</p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                disabled={eligibleParticipantCount < 2}
                onClick={() => setWizardStep("rules")}
                iconRight={<ChevronRight size={16} />}
              >
                使用已选 {eligibleParticipantCount} 人，下一步
              </Button>
            </div>
          </section>
        )}

        {wizardStep === "rules" && (
          <section className="space-y-4">
            <RulesTab
              rules={rules}
              onRulesChange={setRules}
              constraints={constraints}
              onConstraintsChange={setConstraints}
              onSaveRules={handleSaveRules}
              onStartMatching={handleStartMatching}
              isMatching={isMatching}
              isRulesLocked={isRulesLocked}
              matchingProgress={matchingProgress}
              matchingMessage={matchingMessage}
              participantCount={eligibleParticipantCount}
              schemaFields={registrationSchema}
              schemaGroups={registrationSchemaGroups}
              fieldCatalog={fieldCatalog}
              preflightResult={lastPreflightResult}
              showFooterActions={false}
            />
            <div className="flex flex-col-reverse gap-3 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setWizardStep("participants")}
                icon={<ChevronLeft size={16} />}
              >
                返回参与人
              </Button>
              <Button
                loading={isSavingRules}
                disabled={!rulesReadyToContinue}
                onClick={() => void saveRulesAndContinue()}
                iconRight={<ChevronRight size={16} />}
              >
                保存并进入校验
              </Button>
            </div>
          </section>
        )}

        {wizardStep === "preview" && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">执行前预览与校验</h2>
              <p className="mt-1 text-sm text-gray-500">
                按已有资料匹配，选填项缺失会自动跳过；校验推荐人数和限制条件。
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">参与人数</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{eligibleParticipantCount}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">启用规则</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{enabledRules.length}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">每人匹配</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">
                    {constraints.minMatches}–{constraints.maxMatches} 人
                  </p>
                </div>
              </div>
              {lastPreflightResult && (
                <div
                  className={`mt-4 rounded-xl border p-4 ${
                    lastPreflightResult.canExecute
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {lastPreflightResult.canExecute ? "校验通过" : "校验未通过"}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{lastPreflightResult.message}</p>
                  {!!lastPreflightResult.warnings?.length && (
                    <ul className="mt-3 space-y-1 text-xs text-gray-600">
                      {lastPreflightResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                  {!lastPreflightResult.canExecute && (
                    <ul className="mt-3 space-y-1 text-xs text-red-700">
                      {lastPreflightResult.ruleDiagnostics
                        .filter((item) => !item.canExecute)
                        .slice(0, 5)
                        .map((item) => <li key={item.groupKey}>• {item.message}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setWizardStep("rules")}
                icon={<ChevronLeft size={16} />}
              >
                返回规则
              </Button>
              <Button
                loading={isPreflighting}
                onClick={() => void runPreflight()}
                iconRight={<ClipboardCheck size={16} />}
              >
                {lastPreflightResult?.canExecute ? "重新校验" : "运行校验"}
              </Button>
            </div>
          </section>
        )}

        {wizardStep === "execute" && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
              <PlayCircle size={44} className="mx-auto text-primary-500" />
              <h2 className="mt-3 text-lg font-semibold text-gray-900">
                {isMatching ? "正在生成匹配草稿" : "执行智能匹配"}
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
                执行会生成一个新的未发布草稿。首次匹配直接编辑该草稿；只有已发布版本需要修改时，才会创建调整草稿。
              </p>
              {isMatching ? (
                <div className="mx-auto mt-6 max-w-xl">
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all"
                      style={{ width: `${matchingProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {matchingMessage || "正在计算..."} · {Math.round(matchingProgress)}%
                  </p>
                </div>
              ) : (
                <Button className="mt-6" onClick={() => void handleStartMatching()}>
                  开始执行匹配
                </Button>
              )}
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                disabled={isMatching}
                onClick={() => setWizardStep("preview")}
                icon={<ChevronLeft size={16} />}
              >
                返回校验
              </Button>
              {matchResults.length > 0 && !isMatching && (
                <Button
                  onClick={() => setWizardStep("results")}
                  iconRight={<ChevronRight size={16} />}
                >
                  查看草稿结果
                </Button>
              )}
            </div>
          </section>
        )}

        {wizardStep === "results" && (
          <ResultsTab
            activityId={activityId}
            matchResults={matchResults}
            participants={resultParticipants}
            eligibleParticipantCount={resultEligibleParticipantCount}
            rules={rules}
            isPublishing={isPublishing}
            onPublish={publishAdapter}
            onRematch={() => {
              handleEnterRematchMode();
              setWizardStep("participants");
            }}
            isRematching={isMatching}
            history={history}
            currentHistoryId={currentHistoryId}
            constraints={constraints}
            onResultsChanged={handleRefresh}
            readOnly={effectiveResultState === "published"}
            actionsDisabled={isRevalidating || Boolean(refreshError)}
            resultState={effectiveResultState}
            resultVersion={resultVersion}
            matchStatusId={matchStatusId}
            validationResult={lastValidationResult}
            isValidating={isValidating}
            isCreatingAdjustmentDraft={isCreatingAdjustmentDraft}
            onValidate={handleValidateResults}
            onCreateAdjustmentDraft={handleCreateAdjustmentDraft}
          />
        )}
      </div>

      {isMatching && !isBackgroundMatching && (
        <MatchingProgressOverlay
          visible
          progress={matchingProgress}
          message={matchingMessage}
          onMinimize={handleMinimizeMatching}
        />
      )}
    </MerchantLayout>
  );
};

export default MatchingConfigPage;
