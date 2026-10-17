import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MatchingAvailability from "./MatchingAvailability";
import type { MatchPreflightResult } from "../types";

describe("matching availability", () => {
  it("excludes only zero-candidate users and allows restoring the selection", () => {
    const onSelection = vi.fn();
    const participants = [{ id: "empty", name: "无候选用户" }, { id: "short", name: "推荐不足用户" }, { id: "excluded", name: "已排除用户" }];
    const result: MatchPreflightResult = { canExecute: true, totalParticipants: 3, eligibleParticipants: 2, ruleDiagnostics: [], fieldDiagnostics: [], message: "可以继续", hardRuleDiagnostics: [
      { userId: "empty", availableCandidates: 0, requiredCandidates: 2, canMeetMinimum: false, reason: "性别信息缺失" },
      { userId: "short", availableCandidates: 1, requiredCandidates: 2, canMeetMinimum: false, reason: "符合条件的对象仅有 1 人" },
    ] };
    render(<MatchingAvailability result={result} participants={participants} selectedIds={["empty", "short"]} checking={false} onSelection={onSelection} />);
    fireEvent.click(screen.getByRole("button", { name: "排除这 1 人" }));
    expect(onSelection).toHaveBeenCalledWith(["empty"], false);
    expect(screen.getByText(/性别信息缺失/)).toBeInTheDocument();
    expect(screen.getByText("推荐不足用户")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "恢复参与" }));
    expect(onSelection).toHaveBeenCalledWith(["excluded"], true);
  });
});
