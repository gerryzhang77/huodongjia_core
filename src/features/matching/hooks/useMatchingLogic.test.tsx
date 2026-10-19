import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import * as api from "../services/matchingApi";
import { merchantQueryKeys as keys } from "@/features/merchant/queryKeys";
import { useMatchingLogic } from "./useMatchingLogic";
vi.mock("../services/matchingApi");
vi.mock("@/features/activities/services/api", () => ({ getActivityById: vi.fn().mockResolvedValue({ title: "测试活动" }) }));
vi.mock("@/components/ui/Toast", () => ({ Toast: { show: vi.fn() } }));
const config = { countMode: "range" as const, minMatches: 1, maxMatches: 3, hardRules: [], allowManualOverride: false };
const resultData = { results: [{ id: "result", userId: "a", matchId: "run", bestMatchUserIds: ["b"], createdAt: "now" }], stats: null, participantUserIds: ["a", "b"] };
const setup = (step: "results" | "rules" = "results") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useMatchingLogic({ activityId: "event", step, fieldCatalogEnabled: step === "rules" }), { wrapper }) };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getMatchingTaskStatus).mockResolvedValue({ status: "completed", progress: 100, stage: "completed", active: false });
  vi.mocked(api.getParticipants).mockResolvedValue([{ id: "a", name: "甲" }, { id: "b", name: "乙" }]);
  vi.mocked(api.getMatchGroups).mockResolvedValue(resultData);
  vi.mocked(api.getMatchConfig).mockResolvedValue(config);
  vi.mocked(api.getMatchRules).mockResolvedValue([]);
  vi.mocked(api.getMatchingHistory).mockResolvedValue([]);
  vi.mocked(api.getMatchFieldCatalog).mockResolvedValue({ fields: [], totalEligibleParticipants: 2 });
});

describe("matching task lifecycle", () => {
  const rule = { id: "rule", name: "兴趣", source_field: "hobby", target_field: "hobby", operator: "exact" as const, weight: 1, enabled: true };
  const healthy = { canExecute: true, totalParticipants: 2, eligibleParticipants: 2, ruleDiagnostics: [], fieldDiagnostics: [], hardRuleDiagnostics: [], insufficientParticipants: 0, message: "可以匹配" };

  it("shares an automatic preflight with repeated start clicks and submits only once", async () => {
    vi.mocked(api.getMatchRules).mockResolvedValue([rule]);
    let finish!: (value: typeof healthy) => void;
    vi.mocked(api.preflightMatching).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    vi.mocked(api.saveMatchConfig).mockResolvedValue(config);
    vi.mocked(api.submitMatchingTask).mockResolvedValue({ taskId: "task-1" });
    const view = setup("rules");
    await waitFor(() => expect(api.preflightMatching).toHaveBeenCalledTimes(1));
    let first!: Promise<void>; let second!: Promise<void>;
    act(() => { first = view.result.current.handleStartMatching(); second = view.result.current.handleStartMatching(); });
    await act(async () => { finish(healthy); await Promise.all([first, second]); });
    expect(api.preflightMatching).toHaveBeenCalledTimes(1);
    expect(api.submitMatchingTask).toHaveBeenCalledTimes(1);
    expect(api.getMatchingTaskStatus).toHaveBeenCalledWith("event", "task-1");
    view.unmount(); view.client.clear();
  });

  it("restores a running task after reopening and retries a transient polling failure", async () => {
    vi.mocked(api.getMatchingTaskStatus)
      .mockResolvedValueOnce({ taskId: "task-running", active: true, status: "processing", progress: 40, stage: "matching_embed" })
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockResolvedValue({ taskId: "task-running", active: false, status: "completed", progress: 100, stage: "completed" });
    const view = setup();
    await waitFor(() => expect(view.result.current.isMatching).toBe(true));
    await waitFor(() => expect(view.result.current.matchingMessage).toContain("重试"));
    await waitFor(() => expect(view.result.current.isMatching).toBe(false), { timeout: 4500 });
    expect(api.getMatchingTaskStatus).toHaveBeenCalledWith("event", "task-running");
    view.unmount(); view.client.clear();
  });
});
describe("matching step loading and cache", () => {
  it("shows results without waiting for history or fetching the rules catalog", async () => {
    vi.mocked(api.getMatchingHistory).mockReturnValue(new Promise(() => {}));
    const view = setup();
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    await waitFor(() => expect(view.result.current.matchResults).toHaveLength(1));
    expect(api.getMatchRules).not.toHaveBeenCalled();
    expect(api.getMatchFieldCatalog).not.toHaveBeenCalled();
    expect(api.getParticipants).toHaveBeenCalledWith("event", "matching-cards");
    view.unmount(); view.client.clear();
  });
  it("retains previously loaded results when a refresh fails", async () => {
    const view = setup();
    await waitFor(() => expect(view.result.current.matchResults).toHaveLength(1));
    vi.mocked(api.getMatchGroups).mockRejectedValue(new Error("offline"));
    await act(() => view.result.current.handleRefresh());
    expect(view.result.current.matchResults).toHaveLength(1);
    expect(view.client.getQueryData(keys.matchingResults("event"))).toEqual(resultData);
    await waitFor(() => expect(view.result.current.refreshError).toBeTruthy());
    view.unmount(); view.client.clear();
  });
  it("does not overwrite unsaved constraints or rules during background refresh", async () => {
    const view = setup("rules");
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    act(() => {
      view.result.current.setConstraints({ ...config, maxMatches: 7 });
      view.result.current.setRules([]);
    });
    act(() => {
      view.client.setQueryData(keys.matchingConfig("event"), { ...config, maxMatches: 4 });
      view.client.setQueryData(keys.matchingRules("event"), [{ id: "remote", source_field: "x", target_field: "x", operator: "exact", enabled: true }]);
    });
    await waitFor(() => expect(view.result.current.constraints.maxMatches).toBe(7));
    expect(view.result.current.rules).toEqual([]);
    expect(api.getMatchFieldCatalog).toHaveBeenCalledWith("event", ["a", "b"]);
    expect(api.getMatchFieldCatalog).not.toHaveBeenCalledWith("event", []);
    view.unmount(); view.client.clear();
  });
  it("preserves edits made while an earlier save is still in flight", async () => {
    let finishSave!: () => void;
    vi.mocked(api.saveMatchRules).mockImplementation(() => new Promise<void>(resolve => { finishSave = resolve; }));
    vi.mocked(api.saveMatchConfig).mockResolvedValue(undefined);
    const view = setup("rules");
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    let saving!: Promise<void>;
    act(() => { saving = view.result.current.handleSaveRules("配置"); });
    act(() => {
      view.result.current.setRules([]);
      view.result.current.setConstraints({ ...config, maxMatches: 7 });
    });
    await act(async () => { finishSave(); await saving; });
    expect(view.result.current.rules).toEqual([]);
    expect(view.result.current.constraints.maxMatches).toBe(7);
    view.unmount(); view.client.clear();
  });
});

describe("automatic matching preflight", () => {
  it("invalidates an old warning on a toggle and ignores an older in-flight response", async () => {
    const rule = { id: "rule", name: "兴趣", source_field: "hobby", target_field: "hobby", operator: "exact" as const, weight: 1, enabled: true };
    vi.mocked(api.getMatchRules).mockResolvedValue([rule]);
    let finishOld!: (value: any) => void;
    vi.mocked(api.preflightMatching).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const healthy = { canExecute: true, totalParticipants: 2, eligibleParticipants: 2, ruleDiagnostics: [], fieldDiagnostics: [], hardRuleDiagnostics: [], insufficientParticipants: 0, message: "可以匹配" };
    vi.mocked(api.preflightMatching).mockResolvedValue(healthy);
    const view = setup("rules");
    await waitFor(() => expect(api.preflightMatching).toHaveBeenCalledTimes(1));
    act(() => view.result.current.setConstraints({ ...config, allowSupplementaryRecommendations: true }));
    await act(async () => { finishOld({ ...healthy, canExecute: false, insufficientParticipants: 1 }); });
    expect(view.result.current.lastPreflightResult).toBeNull();
    await waitFor(() => expect(view.result.current.lastPreflightResult?.canExecute).toBe(true));
    expect(api.preflightMatching).toHaveBeenLastCalledWith("event", expect.any(Array), expect.objectContaining({ allowSupplementaryRecommendations: true }), ["a", "b"], expect.any(AbortSignal));
    act(() => view.result.current.setParticipantsSelected(["a"], false));
    expect(view.result.current.lastPreflightResult).toBeNull();
    expect(view.result.current.selectedParticipantIds).toEqual(["b"]);
    act(() => view.result.current.setParticipantsSelected(["a"], true));
    expect(view.result.current.selectedParticipantIds).toEqual(["a", "b"]);
    view.unmount(); view.client.clear();
  });
});
