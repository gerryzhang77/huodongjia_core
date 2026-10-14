import { ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui";
import type { MatchingRule } from "../../types";
import {
  getFieldOption,
  getOperatorMeta,
  getRuleFieldSummary,
  getRuleInfluencePercent,
  getRuleInvalidMessage,
  isRuleIncomplete,
  isRuleInvalid,
  type RuleFieldOption,
} from "./rulePresentation";

interface RuleSummaryRowProps {
  rule: MatchingRule;
  rules: MatchingRule[];
  fieldOptions: RuleFieldOption[];
  duplicate: boolean;
  locked: boolean;
  onOpen: () => void;
  onEnabledChange: (enabled: boolean) => void;
}

export function RuleSummaryRow({
  rule,
  rules,
  fieldOptions,
  duplicate,
  locked,
  onOpen,
  onEnabledChange,
}: RuleSummaryRowProps) {
  const operator = getOperatorMeta(rule.operator);
  const influence = getRuleInfluencePercent(rule, rules);
  const incomplete = isRuleIncomplete(rule);
  const invalid = isRuleInvalid(rule);
  const invalidMessage = getRuleInvalidMessage(rule);
  const fieldSummary = getRuleFieldSummary(rule, fieldOptions);
  const sourceOption = getFieldOption(
    fieldOptions,
    rule.source_field,
    rule.source_registration_type_id,
  );
  const targetOption = getFieldOption(
    fieldOptions,
    rule.target_field,
    rule.target_registration_type_id,
  );
  const dataUnavailable =
    rule.enabled &&
    !invalid &&
    (rule.invalid_reason === "INSUFFICIENT_COVERAGE" ||
      [sourceOption, targetOption].some((option) =>
        option?.canMatch === false ||
        (typeof option?.coverage === "number" && typeof option.totalEligibleParticipants === "number" &&
          option.coverage < option.totalEligibleParticipants),
      ));

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 md:px-4 ${
        rule.enabled ? "bg-white" : "bg-gray-50/70"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1.5 text-left outline-none transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary-300"
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-medium ${
              rule.enabled ? "text-gray-900" : "text-gray-500"
            }`}
          >
            {fieldSummary}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span>{operator.shortLabel}</span>
            {rule.enabled && <span>配置权重 {influence}%</span>}
            {incomplete && (
              <span className="font-medium text-orange-600">待补全</span>
            )}
            {duplicate && (
              <span className="font-medium text-orange-600">
                与其他规则重复
              </span>
            )}
            {invalid && invalidMessage && (
              <span className="font-medium text-orange-600">
                {invalidMessage}
              </span>
            )}
            {dataUnavailable && (
              <span className="text-gray-500">部分资料缺失，按已有资料匹配</span>
            )}
          </span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-gray-400" />
      </button>
      <Switch
        checked={rule.enabled}
        disabled={locked || (invalid && !rule.enabled)}
        size="small"
        aria-label={`${fieldSummary}规则启用状态`}
        onChange={onEnabledChange}
      />
    </div>
  );
}
