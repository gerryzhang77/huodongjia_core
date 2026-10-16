import { describe, expect, it } from "vitest";
import { normalizeMatchExplanation } from "./matchApi";

describe("normalizeMatchExplanation", () => {
  it("preserves the supplementary label without inventing explanation fields", () => {
    expect(normalizeMatchExplanation({ supplementary: true, fields: [] }))
      .toEqual({ supplementary: true, fields: [] });
  });
  it("keeps qualitative fields while dropping legacy score metadata", () => {
    const explanation = normalizeMatchExplanation({
      total_score: 0.87,
      total_score_percent: 87,
      fields: [
        {
          rule_index: 1,
          source_field: "interests",
          target_field: "interests",
          source_label: "兴趣爱好",
          target_label: "兴趣爱好",
          operator: "similarity",
          operator_label: "相似",
          weight: 0.8,
          score: 0.9,
          weighted_score: 0.72,
          score_percent: 90,
          current_user_value: "徒步",
          target_user_value: "露营",
        },
      ],
    });

    expect(explanation).toEqual({
      fields: [
        {
          rule_index: 1,
          source_field: "interests",
          target_field: "interests",
          source_label: "兴趣爱好",
          target_label: "兴趣爱好",
          operator: "similarity",
          operator_label: "相似",
          current_user_value: "徒步",
          target_user_value: "露营",
        },
      ],
    });
    expect(JSON.stringify(explanation)).not.toMatch(
      /total_score|score_percent|weighted_score|weight/,
    );
  });

  it("infers birthday semantics from legacy field labels", () => {
    const explanation = normalizeMatchExplanation({
      fields: [
        {
          rule_index: 0,
          source_field: "custom_birth_date",
          target_field: "custom_birth_date",
          source_label: "生日",
          target_label: "生日",
          operator: "similarity",
          current_user_value: "1996.09.17",
          target_user_value: "2004.1.1",
        },
      ],
    });

    expect(explanation.fields[0]?.semantic_type).toBe("birthday");
  });
});
