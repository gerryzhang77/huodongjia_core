import { describe, expect, it } from "vitest";
import type { MatchingRule } from "../../types";
import {
  findDuplicateRuleIndexes,
  groupRulesByEnabled,
  getOperatorMeta,
  getRuleFieldSummary,
  getRuleInfluencePercent,
  getRuleInvalidMessage,
  hasInvalidEnabledRules,
  hasIncompleteEnabledRules,
  type RuleFieldOption,
} from "./rulePresentation";

const makeRule = (
  id: string,
  patch: Partial<MatchingRule> = {},
): MatchingRule => ({
  id,
  name: id,
  source_field: "skills",
  target_field: "skills",
  operator: "similarity",
  type: "similarity",
  weight: 1,
  enabled: true,
  ...patch,
});

describe("matching rule validation", () => {
  it("allows optional-field coverage warnings, including cached legacy invalid flags", () => {
    const sparse = makeRule("optional", {
      valid: false,
      invalid_reason: "INSUFFICIENT_COVERAGE",
      can_match: false,
    });
    expect(hasInvalidEnabledRules([sparse])).toBe(false);
    expect(getRuleInvalidMessage(sparse)).toContain("自动跳过");
  });
  it("marks both enabled copies of the same directional rule", () => {
    const rules = [
      makeRule("one"),
      makeRule("two"),
      makeRule("other-type", {
        source_registration_type_id: "guest",
        target_registration_type_id: "guest",
      }),
      makeRule("disabled-copy", { enabled: false }),
    ];

    expect([...findDuplicateRuleIndexes(rules)]).toEqual([0, 1]);
  });

  it("only blocks incomplete rules when they are enabled", () => {
    expect(
      hasIncompleteEnabledRules([
        makeRule("disabled", { enabled: false, target_field: "" }),
      ]),
    ).toBe(false);
    expect(
      hasIncompleteEnabledRules([makeRule("enabled", { target_field: "" })]),
    ).toBe(true);
  });

  it("groups disabled rules without losing their original indexes", () => {
    const rules = [
      makeRule("one"),
      makeRule("two", { enabled: false }),
      makeRule("three"),
    ];

    expect(groupRulesByEnabled(rules)).toMatchObject({
      enabled: [
        { rule: { id: "one" }, index: 0 },
        { rule: { id: "three" }, index: 2 },
      ],
      disabled: [{ rule: { id: "two" }, index: 1 }],
    });
  });

  it("blocks enabled invalid rules but allows an invalid rule to remain disabled", () => {
    expect(
      hasInvalidEnabledRules([
        makeRule("orphan", { valid: false, invalid_reason: "FIELD_REMOVED" }),
      ]),
    ).toBe(true);
    expect(
      hasInvalidEnabledRules([
        makeRule("orphan", {
          enabled: false,
          valid: false,
          invalid_reason: "FIELD_REMOVED",
        }),
      ]),
    ).toBe(false);
  });
});

describe("matching rule presentation", () => {
  const fields: RuleFieldOption[] = [
    {
      key: "skills",
      label: "技能",
      registrationTypeId: "student",
      groupName: "学生",
    },
    {
      key: "expertise",
      label: "擅长领域",
      registrationTypeId: "mentor",
      groupName: "导师",
    },
  ];

  it("removes repeated direction labels for the common same-field case", () => {
    expect(
      getRuleFieldSummary(
        makeRule("same", {
          source_registration_type_id: "student",
          target_registration_type_id: "student",
        }),
        fields,
      ),
    ).toBe("技能");
  });

  it("keeps direction explicit for cross-type or cross-field matching", () => {
    expect(
      getRuleFieldSummary(
        makeRule("cross", {
          source_registration_type_id: "student",
          target_field: "expertise",
          target_registration_type_id: "mentor",
        }),
        fields,
      ),
    ).toBe("学生 · 技能 → 导师 · 擅长领域");
  });

  it("shows relative influence and names hard-difference semantics clearly", () => {
    const primary = makeRule("primary", { weight: 1 });
    const supporting = makeRule("supporting", {
      source_field: "city",
      target_field: "city",
      weight: 0.4,
    });

    expect(getRuleInfluencePercent(primary, [primary, supporting])).toBe(71);
    expect(getOperatorMeta("opposite").label).toBe("必须不同");
  });

  it("never exposes a custom technical key as a field title", () => {
    expect(
      getRuleFieldSummary(
        makeRule("orphan", {
          source_field: "custom_1785063125127",
          target_field: "custom_1785063125127",
          source_label_snapshot: "custom_1785063125127",
          target_label_snapshot: "custom_1785063125127",
          valid: false,
          invalid_reason: "FIELD_REMOVED",
        }),
        [],
      ),
    ).toBe("已删除字段");
    expect(
      getRuleInvalidMessage(
        makeRule("orphan", { valid: false, invalid_reason: "FIELD_REMOVED" }),
      ),
    ).toBe("报名表字段已删除，请重新选择字段");
  });

  it("uses a product label snapshot when the current field is unavailable", () => {
    expect(
      getRuleFieldSummary(
        makeRule("renamed-or-removed", {
          source_field: "custom_diet",
          target_field: "custom_diet",
          source_label_snapshot: "饮食菜系偏好",
          target_label_snapshot: "饮食菜系偏好",
        }),
        [],
      ),
    ).toBe("饮食菜系偏好");
  });
});
