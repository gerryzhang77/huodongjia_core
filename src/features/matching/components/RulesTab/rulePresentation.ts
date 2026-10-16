import type {
  MatchOperator,
  MatchingRule,
} from "../../types";

export interface RuleFieldOption {
  key: string;
  label: string;
  registrationTypeId?: string | null;
  groupName: string;
  coverage?: number;
  totalEligibleParticipants?: number;
  canMatch?: boolean;
  unavailable?: boolean;
  source?: string;
  sourceFilledCount?: number;
  invalidSourceCount?: number;
  missingSourceCount?: number;
}

export interface IndexedMatchingRule {
  rule: MatchingRule;
  index: number;
}

export const DEFAULT_MATCH_OPERATOR: MatchOperator = "similarity";

export const OPERATOR_OPTIONS: Array<{
  value: MatchOperator;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: "similarity",
    label: "越相似越优先",
    shortLabel: "相似优先",
    description: "字段内容越接近，推荐顺序越靠前",
  },
  {
    value: "complement",
    label: "越互补越优先",
    shortLabel: "互补优先",
    description: "字段内容差异越能形成互补，推荐顺序越靠前",
  },
  {
    value: "exact",
    label: "完全一致优先",
    shortLabel: "一致优先",
    description: "字段内容完全相同时优先推荐",
  },
  {
    value: "opposite",
    label: "必须不同",
    shortLabel: "必须不同",
    description: "字段内容相同的候选人会被排除",
  },
  {
    value: "distance_decay",
    label: "数值越接近越优先",
    shortLabel: "数值接近",
    description: "数值差距越小，推荐顺序越靠前",
  },
];

export const normalizeRuleWeight = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, value));
};

export const getRuleFieldValue = (
  fieldKey: string,
  registrationTypeId?: string | null,
) => JSON.stringify([registrationTypeId || null, fieldKey]);

export const parseRuleFieldValue = (value: string) => {
  try {
    const [registrationTypeId, fieldKey] = JSON.parse(value) as [
      string | null,
      string,
    ];
    return {
      fieldKey: typeof fieldKey === "string" ? fieldKey : "",
      registrationTypeId:
        typeof registrationTypeId === "string"
          ? registrationTypeId
          : undefined,
    };
  } catch {
    return { fieldKey: "", registrationTypeId: undefined };
  }
};

export const getRuleDuplicateKey = (rule: MatchingRule) => {
  if (
    !rule.enabled ||
    !rule.source_field ||
    !rule.target_field ||
    !rule.operator
  ) {
    return null;
  }

  return [
    rule.source_registration_type_id || "",
    rule.source_field,
    rule.target_registration_type_id || "",
    rule.target_field,
    rule.operator,
  ].join("\u0001");
};

export const findDuplicateRuleIndexes = (rules: MatchingRule[]) => {
  const firstIndexByKey = new Map<string, number>();
  const duplicateIndexes = new Set<number>();

  rules.forEach((rule, index) => {
    const key = getRuleDuplicateKey(rule);
    if (!key) return;

    const firstIndex = firstIndexByKey.get(key);
    if (firstIndex === undefined) {
      firstIndexByKey.set(key, index);
      return;
    }

    duplicateIndexes.add(firstIndex);
    duplicateIndexes.add(index);
  });

  return duplicateIndexes;
};

export const groupRulesByEnabled = (rules: MatchingRule[]) =>
  rules.reduce<{
    enabled: IndexedMatchingRule[];
    disabled: IndexedMatchingRule[];
  }>(
    (groups, rule, index) => {
      groups[rule.enabled ? "enabled" : "disabled"].push({ rule, index });
      return groups;
    },
    { enabled: [], disabled: [] },
  );

export const isRuleIncomplete = (rule: MatchingRule) =>
  rule.enabled &&
  (!rule.source_field || !rule.target_field || !rule.operator);

export const hasIncompleteEnabledRules = (rules: MatchingRule[]) =>
  rules.some(isRuleIncomplete);

export const isRuleInvalid = (rule: MatchingRule) =>
  rule.valid === false && rule.invalid_reason !== "INSUFFICIENT_COVERAGE";

export const hasInvalidEnabledRules = (rules: MatchingRule[]) =>
  rules.some((rule) => rule.enabled && isRuleInvalid(rule));

export const getRuleInvalidMessage = (rule: MatchingRule) => {
  switch (rule.invalid_reason) {
    case "FIELD_REMOVED":
      return "报名表字段已删除，请重新选择字段";
    case "TECHNICAL_FALLBACK":
      return "字段缺少可展示名称，请先修正报名表或重新选择";
    case "PRIVATE_FIELD":
      return "该字段不能用于匹配，请重新选择字段";
    case "REGISTRATION_TYPE_UNAVAILABLE":
      return "所属报名类型已停用或不参与匹配，请重新选择字段";
    case "INSUFFICIENT_COVERAGE":
      return "资料不足时自动跳过，不影响其他偏好匹配";
    default:
      return rule.valid === false ? "匹配字段已不可用，请重新选择" : "";
  }
};

export const getRuleInfluencePercent = (
  rule: MatchingRule,
  rules: MatchingRule[],
) => {
  if (!rule.enabled) return 0;

  const totalWeight = rules.reduce(
    (total, item) =>
      item.enabled ? total + normalizeRuleWeight(item.weight) : total,
    0,
  );

  if (totalWeight <= 0) return 0;
  return Math.round((normalizeRuleWeight(rule.weight) / totalWeight) * 100);
};

export const getOperatorMeta = (operator?: MatchOperator) =>
  OPERATOR_OPTIONS.find((item) => item.value === operator) ||
  OPERATOR_OPTIONS[0];

export const getFieldOption = (
  options: RuleFieldOption[],
  fieldKey?: string,
  registrationTypeId?: string | null,
) => {
  if (!fieldKey) return null;

  return (
    options.find(
      (field) =>
        field.key === fieldKey &&
        (field.registrationTypeId || undefined) ===
          (registrationTypeId || undefined),
    ) ||
    options.find((field) => field.key === fieldKey) ||
    null
  );
};

export const getRuleFieldSummary = (
  rule: MatchingRule,
  options: RuleFieldOption[],
) => {
  const source = getFieldOption(
    options,
    rule.source_field,
    rule.source_registration_type_id,
  );
  const target = getFieldOption(
    options,
    rule.target_field,
    rule.target_registration_type_id,
  );

  const getSafeLabel = (
    fieldKey?: string,
    labelSnapshot?: string,
    currentLabel?: string,
  ) => {
    if (currentLabel) return currentLabel;
    if (!fieldKey) return "待选择字段";
    const snapshot = String(labelSnapshot || "").trim();
    if (snapshot && !(fieldKey.startsWith("custom_") && snapshot === fieldKey)) {
      return snapshot;
    }
    return "已删除字段";
  };
  const sourceLabel = getSafeLabel(
    rule.source_field,
    rule.source_label_snapshot,
    source?.label,
  );
  const targetLabel = getSafeLabel(
    rule.target_field,
    rule.target_label_snapshot,
    target?.label,
  );
  const sourceType = source?.groupName;
  const targetType = target?.groupName;
  const isSameField =
    Boolean(rule.source_field) &&
    rule.source_field === rule.target_field &&
    (rule.source_registration_type_id || undefined) ===
      (rule.target_registration_type_id || undefined);

  if (isSameField) {
    return sourceLabel;
  }

  const sourceText = sourceType ? `${sourceType} · ${sourceLabel}` : sourceLabel;
  const targetText = targetType ? `${targetType} · ${targetLabel}` : targetLabel;
  return `${sourceText} → ${targetText}`;
};
