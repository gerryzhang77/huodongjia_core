import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Trash2 } from "lucide-react";
import { Button, Drawer, Switch } from "@/components/ui";
import type { MatchingRule } from "../../types";
import {
  DEFAULT_MATCH_OPERATOR,
  OPERATOR_OPTIONS,
  getRuleDuplicateKey,
  getFieldOption,
  getRuleFieldValue,
  getRuleInvalidMessage,
  getRuleInfluencePercent,
  normalizeRuleWeight,
  parseRuleFieldValue,
  type RuleFieldOption,
} from "./rulePresentation";

interface RuleEditorDrawerProps {
  open: boolean;
  rule: MatchingRule | null;
  ruleIndex: number;
  rules: MatchingRule[];
  fieldOptions: RuleFieldOption[];
  locked?: boolean;
  onClose: () => void;
  onSave: (rule: MatchingRule) => void;
  onDelete: (ruleId?: string) => void;
}

const useDesktopDrawer = () => {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktop;
};

const RuleEditorDrawer: React.FC<RuleEditorDrawerProps> = ({
  open,
  rule,
  ruleIndex,
  rules,
  fieldOptions,
  locked = false,
  onClose,
  onSave,
  onDelete,
}) => {
  const isDesktop = useDesktopDrawer();
  const [draft, setDraft] = useState<MatchingRule | null>(rule);
  const [compareDifferentFields, setCompareDifferentFields] = useState(false);

  useEffect(() => {
    setDraft(rule);
    setCompareDifferentFields(
      Boolean(
        rule &&
          (rule.source_field !== rule.target_field ||
            (rule.source_registration_type_id || undefined) !==
              (rule.target_registration_type_id || undefined)),
      ),
    );
  }, [rule, open]);

  const availableOptions = useMemo(() => {
    if (!draft) return fieldOptions;

    const nextOptions = [...fieldOptions];
    const ensureCurrentField = (
      key?: string,
      registrationTypeId?: string,
      labelSnapshot?: string,
    ) => {
      if (
        !key ||
        nextOptions.some(
          (option) =>
            option.key === key &&
            (option.registrationTypeId || undefined) ===
              (registrationTypeId || undefined),
        )
      ) {
        return;
      }

      nextOptions.push({
        key,
        label:
          labelSnapshot &&
          !(key.startsWith("custom_") && labelSnapshot === key)
            ? labelSnapshot
            : "已删除字段（需重新选择）",
        registrationTypeId,
        groupName: "不可用的当前字段",
        canMatch: false,
        unavailable: true,
      });
    };

    ensureCurrentField(
      draft.source_field,
      draft.source_registration_type_id,
      draft.source_label_snapshot,
    );
    ensureCurrentField(
      draft.target_field,
      draft.target_registration_type_id,
      draft.target_label_snapshot,
    );
    return nextOptions;
  }, [draft, fieldOptions]);

  const fieldGroups = useMemo(
    () =>
      Array.from(
        availableOptions.reduce<Map<string, RuleFieldOption[]>>(
          (groups, field) => {
            const groupName = field.groupName || "可匹配字段";
            groups.set(groupName, [...(groups.get(groupName) || []), field]);
            return groups;
          },
          new Map(),
        ),
      ),
    [availableOptions],
  );

  if (!draft) return null;

  const sourceValue = draft.source_field
    ? getRuleFieldValue(
        draft.source_field,
        draft.source_registration_type_id,
      )
    : "";
  const targetValue = draft.target_field
    ? getRuleFieldValue(
        draft.target_field,
        draft.target_registration_type_id,
      )
    : "";
  const selectedValues = new Set([sourceValue, targetValue]);
  const sourceOption = getFieldOption(
    availableOptions,
    draft.source_field,
    draft.source_registration_type_id,
  );
  const targetOption = getFieldOption(
    availableOptions,
    draft.target_field,
    draft.target_registration_type_id,
  );
  const invalidSelection =
    sourceOption?.unavailable === true || targetOption?.unavailable === true;
  const incomplete =
    !draft.source_field || !draft.target_field || !draft.operator;
  const duplicateKey = getRuleDuplicateKey(draft);
  const duplicate = Boolean(
    duplicateKey &&
      rules.some(
        (item, index) =>
          index !== ruleIndex && getRuleDuplicateKey(item) === duplicateKey,
      ),
  );
  const previewRules = rules[ruleIndex]
    ? rules.map((item, index) => (index === ruleIndex ? draft : item))
    : [...rules, draft];
  const influence = getRuleInfluencePercent(draft, previewRules);

  const updateDraftField = (
    slot: "source" | "target" | "both",
    value: string,
  ) => {
    const { fieldKey, registrationTypeId } = parseRuleFieldValue(value);
    const selectedOption = getFieldOption(
      fieldOptions,
      fieldKey,
      registrationTypeId,
    );
    const validityReset = {
      valid: undefined,
      invalid_reason: null,
      can_match: undefined,
      source_field_status: undefined,
      target_field_status: undefined,
    } as const;

    if (slot === "both") {
      setDraft((current) =>
        current
          ? {
              ...current,
              source_field: fieldKey,
              target_field: fieldKey,
              source_registration_type_id: registrationTypeId,
              target_registration_type_id: registrationTypeId,
              source_label_snapshot: selectedOption?.label,
              target_label_snapshot: selectedOption?.label,
              ...validityReset,
            }
          : current,
      );
      return;
    }

    setDraft((current) =>
      current
        ? {
            ...current,
            [`${slot}_field`]: fieldKey,
            [`${slot}_registration_type_id`]: registrationTypeId,
            [`${slot}_label_snapshot`]: selectedOption?.label,
            ...validityReset,
          }
        : current,
    );
  };

  const renderFieldSelect = (
    id: string,
    value: string,
    slot: "source" | "target" | "both",
    ariaLabel: string,
  ) => (
    <select
      id={id}
      value={value}
      disabled={locked}
      aria-label={ariaLabel}
      onChange={(event) => updateDraftField(slot, event.target.value)}
      className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50"
    >
      <option value="">请选择</option>
      {fieldGroups.map(([groupName, options]) => (
        <optgroup key={groupName} label={groupName}>
          {options.map((option) => {
            const optionValue = getRuleFieldValue(
              option.key,
              option.registrationTypeId,
            );
            const coverageText =
              typeof option.coverage === "number" &&
              typeof option.totalEligibleParticipants === "number"
                ? ` · ${option.coverage}/${option.totalEligibleParticipants}`
                : "";
            const identitySourceIssueText = [
              typeof option.invalidSourceCount === "number" &&
              option.invalidSourceCount > 0
                ? `${option.invalidSourceCount}人身份证无效`
                : "",
              typeof option.missingSourceCount === "number" &&
              option.missingSourceCount > 0
                ? `${option.missingSourceCount}人未填写`
                : "",
            ]
              .filter(Boolean)
              .join("，");
            const availabilityText = identitySourceIssueText
              ? `（${identitySourceIssueText}）`
              : option.canMatch === false
                ? "（资料不足时跳过）"
                : "";
            return (
              <option
                key={optionValue}
                value={optionValue}
                disabled={
                  option.unavailable === true && !selectedValues.has(optionValue)
                }
              >
                {option.label}
                {coverageText}
                {availabilityText}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );

  const handleModeChange = (nextAdvanced: boolean) => {
    setCompareDifferentFields(nextAdvanced);
    if (!nextAdvanced && draft.source_field) {
      setDraft({
        ...draft,
        target_field: draft.source_field,
        target_registration_type_id: draft.source_registration_type_id,
        target_label_snapshot: draft.source_label_snapshot,
        target_field_status: draft.source_field_status,
        valid: undefined,
        invalid_reason: null,
        can_match: undefined,
      });
    }
  };

  const handleSave = () => {
    if (incomplete || duplicate || invalidSelection) return;
    onSave({
      ...draft,
      type: draft.operator || DEFAULT_MATCH_OPERATOR,
      operator: draft.operator || DEFAULT_MATCH_OPERATOR,
      weight: normalizeRuleWeight(draft.weight),
    });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="编辑规则"
      placement={isDesktop ? "right" : "bottom"}
      size={isDesktop ? "520px" : "88vh"}
      footer={
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Button
            size="small"
            variant="text"
            className="text-error-500"
            icon={<Trash2 size={16} />}
            disabled={locked}
            onClick={() => {
              onDelete(draft.id);
              onClose();
            }}
          >
            删除
          </Button>
          <div className="flex gap-2">
            <Button size="small" variant="light" onClick={onClose}>
              取消
            </Button>
            <Button
              size="small"
              disabled={locked || incomplete || duplicate || invalidSelection}
              onClick={handleSave}
            >
              保存规则
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 p-4 md:p-6">
        <section className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">比较字段</h4>
            <p className="mt-1 text-xs text-gray-500">
              通常比较同一个报名字段；跨报名类型或不同字段时再展开高级设置。
            </p>
          </div>

          {!compareDifferentFields ? (
            renderFieldSelect(
              "matching-rule-field",
              sourceValue,
              "both",
              "比较字段",
            )
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-end gap-2">
              <label className="min-w-0 text-xs font-medium text-gray-600">
                参与者
                <span className="mt-1 block">
                  {renderFieldSelect(
                    "matching-rule-source-field",
                    sourceValue,
                    "source",
                    "参与者字段",
                  )}
                </span>
              </label>
              <ArrowRight
                size={16}
                className="mb-3 text-gray-400"
                aria-hidden="true"
              />
              <label className="min-w-0 text-xs font-medium text-gray-600">
                匹配对象
                <span className="mt-1 block">
                  {renderFieldSelect(
                    "matching-rule-target-field",
                    targetValue,
                    "target",
                    "匹配对象字段",
                  )}
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium text-gray-800">
                比较不同字段或报名类型
              </span>
              <span className="block text-xs text-gray-500">高级设置</span>
            </span>
            <Switch
              checked={compareDifferentFields}
              onChange={handleModeChange}
              disabled={locked}
              size="small"
              aria-label="比较不同字段或报名类型"
            />
          </div>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-5">
          <div>
            <label
              htmlFor="matching-rule-operator"
              className="text-sm font-semibold text-gray-900"
            >
              匹配偏好
            </label>
            <p className="mt-1 text-xs text-gray-500">
              决定这个字段如何影响推荐顺序。
            </p>
          </div>
          <select
            id="matching-rule-operator"
            value={draft.operator || DEFAULT_MATCH_OPERATOR}
            disabled={locked}
            onChange={(event) => {
              const operator = event.target.value as MatchingRule["operator"];
              setDraft({ ...draft, operator, type: operator });
            }}
            className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50"
          >
            {OPERATOR_OPTIONS.map((operator) => (
              <option key={operator.value} value={operator.value}>
                {operator.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            {
              OPERATOR_OPTIONS.find(
                (operator) => operator.value === draft.operator,
              )?.description
            }
          </p>
        </section>

        <section className="space-y-3 border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">重要程度</h4>
              <p className="mt-1 text-xs text-gray-500">
                配置权重约 {influence}%，实际按双方可用资料计算
              </p>
            </div>
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-600">
              {influence}%
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 0.4, label: "辅助" },
              { value: 0.7, label: "重要" },
              { value: 1, label: "最重要" },
            ].map((option) => {
              const selected =
                Math.abs(normalizeRuleWeight(draft.weight) - option.value) <
                0.05;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={locked}
                  aria-pressed={selected}
                  onClick={() => setDraft({ ...draft, weight: option.value })}
                  className={`h-10 rounded-xl border text-sm font-medium transition ${
                    selected
                      ? "border-primary-400 bg-primary-50 text-primary-600"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {(incomplete || duplicate || invalidSelection) && (
          <div className="flex gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>
              {duplicate
                ? "这条规则与已有规则重复，请调整字段或匹配偏好。"
                : invalidSelection
                  ? getRuleInvalidMessage(draft) || "当前字段已不可用，请重新选择字段。"
                : "请先补全比较字段和匹配偏好。"}
            </span>
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default RuleEditorDrawer;
