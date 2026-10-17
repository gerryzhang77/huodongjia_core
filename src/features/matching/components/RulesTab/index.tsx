import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ListChecks,
  LockKeyhole,
  Plus,
  Play,
  Save,
} from "lucide-react";
import { Button, Switch } from "@/components/ui";
import { Toast } from "@/components/ui/Toast";
import { getStandardFieldLabel } from "@/utils/fieldLabels";
import type {
  MatchConstraints,
  MatchFieldCatalogItem,
  MatchingRule,
  MatchingSchemaField,
  MatchingSchemaGroup,
  MatchPreflightResult,
} from "../../types";
import RuleEditorDrawer from "./RuleEditorDrawer";
import { RuleSummaryRow } from "./RuleSummaryRow";
import {
  DEFAULT_MATCH_OPERATOR,
  findDuplicateRuleIndexes,
  groupRulesByEnabled,
  hasInvalidEnabledRules,
  hasIncompleteEnabledRules,
  normalizeRuleWeight,
  isRuleInvalid,
  type RuleFieldOption,
} from "./rulePresentation";
import { isPrivateMatchingRegistrationField } from "../registrationInfo";
import { isTechnicalFallbackRegistrationField } from "@/features/activities/utils/registrationFormFields";

interface RulesTabProps {
  rules: MatchingRule[];
  onRulesChange: (rules: MatchingRule[]) => void;
  constraints: MatchConstraints;
  onConstraintsChange: (constraints: MatchConstraints) => void;
  onSaveRules: (configName: string) => Promise<void>;
  onStartMatching: () => Promise<void>;
  isMatching: boolean;
  matchingProgress: number;
  matchingMessage?: string;
  participantCount: number;
  isRulesLocked?: boolean;
  schemaFields?: MatchingSchemaField[];
  schemaGroups?: MatchingSchemaGroup[];
  fieldCatalog?: MatchFieldCatalogItem[];
  preflightResult?: MatchPreflightResult | null;
  availability?: React.ReactNode;
  schemaLoading?: boolean;
  /** 分步页面由父级统一提供导航操作时隐藏组件自身操作栏。 */
  showFooterActions?: boolean;
}

const createRule = (): MatchingRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "新规则",
  source_field: "",
  target_field: "",
  operator: DEFAULT_MATCH_OPERATOR,
  type: DEFAULT_MATCH_OPERATOR,
  weight: 1,
  enabled: true,
});

const RulesTab: React.FC<RulesTabProps> = ({
  rules,
  onRulesChange,
  constraints,
  onConstraintsChange,
  onSaveRules,
  onStartMatching,
  isMatching,
  matchingProgress,
  matchingMessage,
  participantCount,
  isRulesLocked = false,
  schemaFields = [],
  schemaGroups = [],
  fieldCatalog = [],
  availability,
  schemaLoading = false,
  showFooterActions = true,
}) => {
  const [constraintsExpanded, setConstraintsExpanded] = useState(false);
  const [disabledRulesExpanded, setDisabledRulesExpanded] = useState(false);
  const [activeRuleIndex, setActiveRuleIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const ageHardRule = constraints.hardRules.find(
    (rule) => rule.field === "age" && rule.enabled,
  );
  const genderHardRule = constraints.hardRules.find(
    (rule) => rule.field === "gender" && rule.enabled,
  );

  const fieldOptions = useMemo(() => {
    const catalogOptions = fieldCatalog.map(
      (field): RuleFieldOption => ({
        key: field.key,
        label: getStandardFieldLabel(field.key, field.label || field.key),
        registrationTypeId: field.registrationTypeId,
        groupName:
          field.source === "derived_private"
            ? `商家派生字段${field.registrationTypeName ? ` · ${field.registrationTypeName}` : ""}`
            : field.registrationTypeName ||
            (field.source === "import_extra"
              ? "导入额外字段"
              : "可匹配字段"),
        coverage: field.coverage,
        totalEligibleParticipants: field.totalEligibleParticipants,
        canMatch: field.canMatch,
        source: field.source,
        sourceFilledCount: field.sourceFilledCount,
        invalidSourceCount: field.invalidSourceCount,
        missingSourceCount: field.missingSourceCount,
      }),
    );
    const visibleSchemaGroups =
      schemaGroups.length > 0
        ? schemaGroups
        : schemaFields.length > 0
          ? [{ name: "默认报名表", fields: schemaFields }]
          : [];
    const schemaOptions = visibleSchemaGroups.flatMap((group, groupIndex) =>
      group.fields
        .filter(
          (field) =>
            field.key &&
            field.type !== "image" &&
            !isTechnicalFallbackRegistrationField(field) &&
            !isPrivateMatchingRegistrationField(field.key, field.label),
        )
        .map(
          (field): RuleFieldOption => ({
            key: field.key,
            label: getStandardFieldLabel(field.key, field.label || field.key),
            registrationTypeId: group.id,
            groupName: group.name || `报名表 ${groupIndex + 1}`,
          }),
        ),
    );

    const optionByIdentity = new Map<string, RuleFieldOption>();
    [...schemaOptions, ...catalogOptions].forEach((option) => {
      optionByIdentity.set(
        `${option.registrationTypeId || ""}\u0001${option.key}`,
        option,
      );
    });
    return Array.from(optionByIdentity.values());
  }, [fieldCatalog, schemaFields, schemaGroups]);

  const hasMerchantDerivedFields = useMemo(
    () => fieldCatalog.some((field) => field.source === "derived_private"),
    [fieldCatalog],
  );

  const duplicateRuleIndexes = useMemo(
    () => findDuplicateRuleIndexes(rules),
    [rules],
  );
  const groupedRules = useMemo(() => groupRulesByEnabled(rules), [rules]);
  const enabledRules = groupedRules.enabled.map(({ rule }) => rule);
  const hasIncompleteRules = hasIncompleteEnabledRules(rules);
  const hasInvalidRules = hasInvalidEnabledRules(rules);
  const hasDuplicateRules = duplicateRuleIndexes.size > 0;
  const canSubmitRules =
    enabledRules.length > 0 &&
    !hasIncompleteRules &&
    !hasInvalidRules &&
    !hasDuplicateRules;

  const replaceHardRule = (
    field: "age" | "gender",
    nextRule: MatchConstraints["hardRules"][number] | null,
  ) => {
    const remaining = constraints.hardRules.filter(
      (rule) => rule.field !== field,
    );
    onConstraintsChange({
      ...constraints,
      hardRules: nextRule ? [...remaining, nextRule] : remaining,
    });
  };

  const updateRules = (nextRules: MatchingRule[]) => {
    onRulesChange(
      nextRules.map((rule, index) => ({
        ...rule,
        name: `规则 ${index + 1}`,
        type: rule.operator || DEFAULT_MATCH_OPERATOR,
        operator: rule.operator || DEFAULT_MATCH_OPERATOR,
        weight: normalizeRuleWeight(rule.weight),
      })),
    );
  };

  const updateRuleAtIndex = (
    index: number,
    nextRule: MatchingRule,
  ) => {
    updateRules(
      rules.map((rule, ruleIndex) =>
        ruleIndex === index ? nextRule : rule,
      ),
    );
  };

  const handleRuleEnabledChange = (
    index: number,
    rule: MatchingRule,
    enabled: boolean,
  ) => {
    if (enabled && isRuleInvalid(rule)) {
      Toast.show({ content: "请先重新选择已失效规则的字段", icon: "fail" });
      return;
    }
    updateRuleAtIndex(index, { ...rule, enabled });
    if (!enabled) setDisabledRulesExpanded(true);
  };

  const deleteRuleAtIndex = (index: number) => {
    updateRules(rules.filter((_, ruleIndex) => ruleIndex !== index));
  };

  const addRule = () => {
    if (isRulesLocked) return;
    const nextRules = [...rules, createRule()];
    updateRules(nextRules);
    setActiveRuleIndex(nextRules.length - 1);
  };

  const validateRules = () => {
    if (enabledRules.length === 0) {
      Toast.show({ content: "请至少启用一条匹配规则", icon: "fail" });
      return false;
    }
    if (hasIncompleteRules) {
      Toast.show({ content: "请先补全未完成的匹配规则", icon: "fail" });
      return false;
    }
    if (hasInvalidRules) {
      Toast.show({ content: "请先修复已失效的匹配规则", icon: "fail" });
      return false;
    }
    if (hasDuplicateRules) {
      Toast.show({ content: "请先合并或修改重复规则", icon: "fail" });
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateRules()) return;
    setIsSaving(true);
    try {
      await onSaveRules("默认配置");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStart = async () => {
    if (!validateRules()) return;
    if (participantCount === 0) {
      Toast.show({ content: "暂无审核通过且参与匹配的用户", icon: "fail" });
      return;
    }
    await onStartMatching();
  };

  const countSummary =
    constraints.countMode === "fixed"
      ? `每人 ${constraints.maxMatches} 位`
      : constraints.countMode === "range"
        ? `每人 ${constraints.minMatches}–${constraints.maxMatches} 位`
        : `每人最多 ${constraints.maxMatches} 位`;
  const hardRuleCount = [ageHardRule, genderHardRule].filter(Boolean).length;
  const constraintSummary =
    hardRuleCount > 0
      ? `${hardRuleCount} 项限制已启用`
      : "年龄、性别不限";

  return (
    <div className={showFooterActions ? "pb-28" : ""}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 md:px-5">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">
                  匹配偏好
                </h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  {enabledRules.length} 条启用
                </span>
                {isRulesLocked && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <LockKeyhole size={13} />
                    只读
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                设置推荐人数，再按重要程度排列匹配偏好。
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 font-medium text-gray-700">推荐数量</span>
              <select
                value={constraints.countMode}
                disabled={isRulesLocked}
                aria-label="推荐数量模式"
                onChange={(event) => {
                  const countMode = event.target
                    .value as MatchConstraints["countMode"];
                  onConstraintsChange({
                    ...constraints,
                    countMode,
                    minMatches:
                      countMode === "fixed"
                        ? constraints.maxMatches
                        : countMode === "max"
                          ? 0
                          : Math.max(
                              1,
                              Math.min(
                                constraints.minMatches,
                                constraints.maxMatches,
                              ),
                            ),
                  });
                }}
                className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm outline-none focus:border-primary-400"
              >
                <option value="fixed">固定人数</option>
                <option value="range">人数范围</option>
                <option value="max">仅限制最多</option>
              </select>

              {constraints.countMode === "range" && (
                <>
                  <span className="text-gray-500">最少</span>
                  <input
                    type="number"
                    min={1}
                    max={constraints.maxMatches}
                    value={constraints.minMatches}
                    disabled={isRulesLocked}
                    aria-label="最少匹配人数"
                    onChange={(event) =>
                      onConstraintsChange({
                        ...constraints,
                        minMatches: Math.max(
                          1,
                          Math.min(
                            constraints.maxMatches,
                            Number(event.target.value) || 1,
                          ),
                        ),
                      })
                    }
                    className="h-9 w-16 rounded-lg border border-gray-200 px-2 text-center text-sm outline-none focus:border-primary-400"
                  />
                </>
              )}
              <span className="text-gray-500">
                {constraints.countMode === "fixed" ? "每人" : "最多"}
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={constraints.maxMatches}
                disabled={isRulesLocked}
                aria-label="最多匹配人数"
                onChange={(event) => {
                  const maxMatches = Math.max(
                    1,
                    Math.min(20, Number(event.target.value) || 1),
                  );
                  onConstraintsChange({
                    ...constraints,
                    maxMatches,
                    minMatches:
                      constraints.countMode === "fixed"
                        ? maxMatches
                        : Math.min(constraints.minMatches, maxMatches),
                  });
                }}
                className="h-9 w-16 rounded-lg border border-gray-200 px-2 text-center text-sm outline-none focus:border-primary-400"
              />
              <span className="text-gray-500">位</span>
            </div>
          </div>

          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setConstraintsExpanded((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left md:px-5"
              aria-expanded={constraintsExpanded}
            >
              <span className="min-w-0">
                <span className="text-sm font-medium text-gray-700">
                  限制条件
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  {constraintSummary}
                </span>
              </span>
              {constraintsExpanded ? (
                <ChevronUp size={17} className="shrink-0 text-gray-400" />
              ) : (
                <ChevronDown size={17} className="shrink-0 text-gray-400" />
              )}
            </button>

            {constraintsExpanded && (
              <div className="grid gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-4 md:grid-cols-3 md:px-5">
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        年龄差
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        缺失年龄者不参与
                      </div>
                    </div>
                    <Switch
                      checked={Boolean(ageHardRule)}
                      disabled={isRulesLocked}
                      size="small"
                      aria-label="启用年龄差限制"
                      onChange={(enabled) =>
                        replaceHardRule(
                          "age",
                          enabled
                            ? {
                                id: "hard-age-difference",
                                field: "age",
                                operator: "difference_lte",
                                value: 5,
                                missingPolicy: "exclude",
                                enabled: true,
                              }
                            : null,
                        )
                      }
                    />
                  </div>
                  {ageHardRule && (
                    <label className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                      不超过
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={ageHardRule.value ?? 5}
                        disabled={isRulesLocked}
                        aria-label="最大年龄差"
                        onChange={(event) =>
                          replaceHardRule("age", {
                            ...ageHardRule,
                            value: Math.max(
                              0,
                              Math.min(
                                100,
                                Number(event.target.value) || 0,
                              ),
                            ),
                          })
                        }
                        className="h-8 w-16 rounded-lg border border-gray-200 px-2 text-center text-sm"
                      />
                      岁
                    </label>
                  )}
                </div>

                <label className="rounded-xl border border-gray-200 bg-white p-3">
                  <span className="text-sm font-medium text-gray-800">
                    性别要求
                  </span>
                  <select
                    value={genderHardRule?.operator || "none"}
                    disabled={isRulesLocked}
                    aria-label="性别要求"
                    onChange={(event) => {
                      const operator = event.target.value;
                      replaceHardRule(
                        "gender",
                        operator === "none"
                          ? null
                          : {
                              id: "hard-gender",
                              field: "gender",
                              operator: operator as "same" | "different",
                              missingPolicy: "exclude",
                              enabled: true,
                            },
                      );
                    }}
                    className="mt-3 h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm"
                  >
                    <option value="none">不限</option>
                    <option value="same">仅同性</option>
                    <option value="different">仅异性</option>
                  </select>
                </label>

                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        允许人工例外
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        例外调整需填写原因
                      </div>
                    </div>
                    <Switch
                      checked={constraints.allowManualOverride}
                      disabled={isRulesLocked}
                      size="small"
                      aria-label="允许人工例外"
                      onChange={(allowManualOverride) =>
                        onConstraintsChange({
                          ...constraints,
                          allowManualOverride,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-800">推荐不足时自动补充</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              优先按资料匹配，不足时补充符合限制条件的对象；补充对象不显示匹配分数。
            </p>
          </div>
          <Switch
            checked={constraints.allowSupplementaryRecommendations === true}
            disabled={isRulesLocked}
            size="small"
            aria-label="推荐不足时自动补充"
            onChange={(allowSupplementaryRecommendations) =>
              onConstraintsChange({ ...constraints, allowSupplementaryRecommendations })
            }
          />
        </div>

        {availability}

        {hasMerchantDerivedFields && (
          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
            <LockKeyhole size={15} className="mt-0.5 shrink-0 text-slate-500" />
            <span>
              商家派生字段由系统在服务端根据身份证号计算，仅主办方可见；身份证原文不会进入匹配规则，也不会出现在用户的匹配解释中。
            </span>
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5">
            <div className="flex items-center gap-2">
              <ListChecks size={17} className="text-primary-500" />
              <h3 className="text-sm font-semibold text-gray-900">偏好规则</h3>
            </div>
            <span className="text-xs text-gray-500">
              点击规则可编辑
            </span>
          </div>

          {schemaLoading && fieldOptions.length === 0 ? (
            <div className="border-t border-gray-100 px-4 py-10 text-center text-sm text-gray-500">
              正在加载报名字段…
            </div>
          ) : rules.length === 0 ? (
            <div className="border-t border-gray-100 px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                还没有匹配偏好
              </p>
              <p className="mt-1 text-xs text-gray-500">
                添加一条规则，告诉系统什么样的人更适合彼此。
              </p>
              <Button
                size="small"
                className="mt-4"
                icon={<Plus size={15} />}
                disabled={isRulesLocked || fieldOptions.length === 0}
                onClick={addRule}
              >
                添加规则
              </Button>
            </div>
          ) : (
            <div className="border-t border-gray-100">
              {groupedRules.enabled.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {groupedRules.enabled.map(({ rule, index }) => (
                    <RuleSummaryRow
                      key={rule.id || `${rule.source_field}-${index}`}
                      rule={rule}
                      rules={rules}
                      fieldOptions={fieldOptions}
                      duplicate={duplicateRuleIndexes.has(index)}
                      locked={isRulesLocked}
                      onOpen={() => setActiveRuleIndex(index)}
                      onEnabledChange={(enabled) =>
                        handleRuleEnabledChange(index, rule, enabled)
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm font-medium text-gray-700">
                    当前没有启用规则
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    可从下方已停用规则中重新启用。
                  </p>
                </div>
              )}

              {groupedRules.disabled.length > 0 && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  <button
                    type="button"
                    aria-expanded={disabledRulesExpanded}
                    aria-controls="disabled-matching-rules"
                    onClick={() =>
                      setDisabledRulesExpanded((current) => !current)
                    }
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-300"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600">
                        已停用规则
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-gray-500">
                        {groupedRules.disabled.length}
                      </span>
                    </span>
                    {disabledRulesExpanded ? (
                      <ChevronUp size={17} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={17} className="text-gray-400" />
                    )}
                  </button>

                  {disabledRulesExpanded && (
                    <div
                      id="disabled-matching-rules"
                      className="divide-y divide-gray-100 border-t border-gray-100"
                    >
                      {groupedRules.disabled.map(({ rule, index }) => (
                        <RuleSummaryRow
                          key={rule.id || `${rule.source_field}-${index}`}
                          rule={rule}
                          rules={rules}
                          fieldOptions={fieldOptions}
                          duplicate={duplicateRuleIndexes.has(index)}
                          locked={isRulesLocked}
                          onOpen={() => setActiveRuleIndex(index)}
                          onEnabledChange={(enabled) =>
                            handleRuleEnabledChange(index, rule, enabled)
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {rules.length > 0 && (
            <div className="border-t border-gray-100 p-3 md:px-4">
              <button
                type="button"
                onClick={addRule}
                disabled={isRulesLocked || fieldOptions.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-primary-600 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={16} />
                添加规则
              </button>
            </div>
          )}
        </section>

        {(hasIncompleteRules || hasInvalidRules || hasDuplicateRules) && (
          <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-orange-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>
              {hasDuplicateRules
                ? "存在重复规则，请打开标记项修改或删除后继续。"
                : hasInvalidRules
                  ? "存在已失效规则，请重新选择字段或停用该规则后继续。"
                : "存在未完成的规则，请补全后继续。"}
            </span>
          </div>
        )}

        {isMatching && (
          <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm md:p-5">
            <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-500 transition-all duration-300"
                style={{ width: `${matchingProgress}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-gray-500">
                {matchingMessage || "正在生成匹配结果…"}
              </span>
              <span className="font-medium text-primary-500">
                {matchingProgress}%
              </span>
            </div>
          </div>
        )}
      </div>

      <RuleEditorDrawer
        open={
          activeRuleIndex !== null &&
          Boolean(rules[activeRuleIndex])
        }
        rule={activeRuleIndex !== null ? rules[activeRuleIndex] || null : null}
        ruleIndex={activeRuleIndex ?? -1}
        rules={rules}
        fieldOptions={fieldOptions}
        locked={isRulesLocked}
        onClose={() => setActiveRuleIndex(null)}
        onSave={(nextRule) => {
          if (activeRuleIndex === null) return;
          updateRuleAtIndex(activeRuleIndex, nextRule);
        }}
        onDelete={() => {
          if (activeRuleIndex === null) return;
          deleteRuleAtIndex(activeRuleIndex);
        }}
      />

      {showFooterActions && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-100 bg-white shadow-lg">
          <div className="mx-auto max-w-4xl px-4 py-3 md:px-6">
            <div className="mb-2 flex items-center justify-center gap-3 text-xs text-gray-500">
              <span>{participantCount} 位参与者</span>
              <span className="text-gray-300">·</span>
              <span>{countSummary}</span>
              <span className="text-gray-300">·</span>
              <span>{enabledRules.length} 条偏好</span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="large"
                onClick={handleSave}
                disabled={isSaving || isMatching || !canSubmitRules}
                className="flex-1"
                icon={<Save size={18} />}
              >
                保存规则
              </Button>
              <Button
                size="large"
                onClick={handleStart}
                disabled={
                  isMatching || participantCount === 0 || !canSubmitRules
                }
                className="flex-1"
                icon={<Play size={18} />}
              >
                {isMatching ? "匹配中…" : "开始匹配"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RulesTab;
