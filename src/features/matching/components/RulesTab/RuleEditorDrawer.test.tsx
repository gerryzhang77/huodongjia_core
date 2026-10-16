import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RuleEditorDrawer from "./RuleEditorDrawer";
import type { MatchingRule } from "../../types";

describe("optional matching field editor", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const rule: MatchingRule = {
    id: "optional", name: "兴趣", source_field: "interests", target_field: "interests",
    operator: "similarity", enabled: true, weight: 1,
  };

  it("allows selecting and saving a real field with zero filled answers", () => {
    const onSave = vi.fn();
    render(<RuleEditorDrawer open rule={rule} ruleIndex={0} rules={[rule]} onClose={vi.fn()} onSave={onSave} onDelete={vi.fn()}
      fieldOptions={[
        { key: "interests", label: "兴趣", groupName: "报名表", coverage: 0, totalEligibleParticipants: 10, canMatch: false },
        { key: "skills", label: "技能", groupName: "报名表", coverage: 1, totalEligibleParticipants: 10, canMatch: false },
      ]} />);
    expect((screen.getByRole("option", { name: /技能/ }) as HTMLOptionElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("比较字段"), { target: { value: JSON.stringify([null, "skills"]) } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ source_field: "skills", target_field: "skills" }));
  });

  it("still blocks a field that no longer exists", () => {
    render(<RuleEditorDrawer open rule={rule} ruleIndex={0} rules={[rule]} fieldOptions={[]} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
