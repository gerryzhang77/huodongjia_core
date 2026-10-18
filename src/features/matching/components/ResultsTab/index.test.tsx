import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import type {
  MatchConstraints,
  ParticipantMatchResult,
} from "../../types";
import { prefetchEnrollmentImages } from "@/features/enrollment/hooks/useEnrollmentImages";
import ResultsTab from "./index";
import type { ResultParticipant } from "./resultViewModel";
import { useAuthStore } from "@/features/auth/stores";
import { getEnrollmentQuestionnaire } from "@/features/enrollment/services/questionnaireApi";

vi.mock("@/features/enrollment/services/questionnaireApi", () => ({
  getEnrollmentQuestionnaire: vi.fn().mockResolvedValue({ enrollmentId: "owner-enrollment", registrationTypeName: "NFC社交匹配问卷", updatedAt: null, answerRevision: 1, fields: [] }),
  revealQuestionnaireField: vi.fn(),
}));

vi.mock("@/features/enrollment/hooks/useEnrollmentImages", () => ({
  prefetchEnrollmentImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/enrollment/PrivateEnrollmentImageGallery", () => ({
  default: ({ participantId }: { participantId: string }) => (
    <div>报名图片预览 {participantId}</div>
  ),
}));

const constraints: MatchConstraints = {
  countMode: "range",
  minMatches: 1,
  maxMatches: 3,
  hardRules: [],
  allowManualOverride: false,
};

const matchResults: ParticipantMatchResult[] = [
  {
    id: "result-owner",
    userId: "owner",
    matchId: "match-1",
    bestMatchUserIds: ["candidate"],
    scores: [{ total_score: 0.8, total_score_percent: 80 }],
    createdAt: "2026-07-28T00:00:00.000Z",
    isLocked: false,
  },
];

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location-path">{location.pathname}</output>;
};

const renderResults = (
  onRematch = vi.fn(),
  exportProps: {
    matchStatusId?: string;
    resultRevision?: number;
    resultVersion?: number;
    matchResults?: ParticipantMatchResult[];
    constraints?: MatchConstraints;
    participants?: ResultParticipant[];
  } = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <>
        <ResultsTab
          activityId="event-1"
          matchResults={matchResults}
          participants={[
            {
              id: "owner",
              enrollmentId: "owner-enrollment",
              imageCount: 2,
              name: "参与者甲",
              occupation: "产品经理",
              city: "上海",
            },
            {
              id: "candidate",
              enrollmentId: "candidate-enrollment",
              imageCount: 3,
              name: "推荐对象乙",
              avatar: "https://example.com/candidate.png",
              occupation: "设计师",
              city: "北京",
            },
          ]}
          eligibleParticipantCount={2}
          rules={[]}
          isPublishing={false}
          onPublish={vi.fn()}
          onRematch={onRematch}
          isRematching={false}
          constraints={constraints}
          onResultsChanged={vi.fn()}
          {...exportProps}
        />
        <LocationProbe />
        </>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, onRematch };
};

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(prefetchEnrollmentImages).mockClear();
  vi.mocked(getEnrollmentQuestionnaire).mockClear();
  useAuthStore.getState().clearAuth();
});

describe("ResultsTab interactions", () => {
  it.each(["关闭", "关闭并返回卡片", "Escape", "遮罩"])("returns to the exact recommendation occurrence after %s", async (closeMethod) => {
    vi.useFakeTimers();
    renderResults(vi.fn(), {
      participants: [
        { id: "owner", name: "参与者甲", enrollmentId: "owner-enrollment" },
        { id: "other-owner", name: "参与者丙", enrollmentId: "other-enrollment" },
        { id: "candidate", name: "推荐对象乙", enrollmentId: "candidate-enrollment" },
      ],
      matchResults: [
        matchResults[0],
        { ...matchResults[0], id: "other-result", userId: "other-owner" },
        { ...matchResults[0], id: "candidate-result", userId: "candidate", bestMatchUserIds: ["owner"] },
      ],
    });
    const sourceRow = document.getElementById("matching-result-other-owner")!;
    const source = within(sourceRow).getByRole("group", { name: "推荐对象乙的匹配卡片" });
    const scroll = vi.fn();
    source.scrollIntoView = scroll;
    fireEvent.keyDown(within(source).getByRole("button"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "查看报名问卷" }));
    const drawer = screen.getByRole("dialog", { name: "推荐对象乙的报名问卷" });
    expect(screen.queryByText("刚刚查看")).toBeNull();
    if (closeMethod === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else if (closeMethod === "遮罩") fireEvent.click(drawer.previousElementSibling!);
    else fireEvent.click(within(drawer).getByRole("button", { name: closeMethod }));
    await act(async () => { vi.advanceTimersByTime(20); });
    expect(source).toHaveFocus();
    expect(within(source).getByRole("status")).toHaveTextContent("刚刚查看");
    expect(screen.getAllByText("刚刚查看")).toHaveLength(1);
    expect(scroll).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText("刚刚查看")).toBeNull();
  });

  it("keeps the expanded list and search while returning an offscreen source card into view", async () => {
    vi.useFakeTimers();
    const candidateIds = ["candidate", "second", "third", "fourth"];
    renderResults(vi.fn(), {
      participants: [
        { id: "owner", name: "参与者甲", enrollmentId: "owner-enrollment" },
        ...candidateIds.map((id) => ({ id, name: `推荐${id}`, enrollmentId: `${id}-enrollment` })),
      ],
      matchResults: [{ ...matchResults[0], bestMatchUserIds: candidateIds, scores: candidateIds.map(() => ({ total_score: 0.8, total_score_percent: 80 })) }],
    });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "参与者甲" } });
    fireEvent.click(screen.getByRole("button", { name: "展开参与者甲其余 1 位推荐对象" }));
    const source = within(screen.getByRole("region", { name: "参与者甲的推荐对象" })).getByRole("group", { name: "推荐fourth的匹配卡片" });
    source.getBoundingClientRect = () => ({ top: -90, bottom: -10, left: 0, right: 240, width: 240, height: 80, x: 0, y: -90, toJSON: () => ({}) });
    const scroll = vi.fn();
    source.scrollIntoView = scroll;
    fireEvent.keyDown(within(source).getByRole("button"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "查看报名问卷" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭并返回卡片" }));
    await act(async () => { vi.advanceTimersByTime(20); });
    expect(source).toHaveFocus();
    expect(within(source).getByText("刚刚查看")).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "instant" });
    expect(screen.getByRole("searchbox")).toHaveValue("参与者甲");
    expect(screen.getByRole("button", { name: "收起参与者甲的推荐名单" })).toHaveAttribute("aria-expanded", "true");
  });

  it("removes the shared questionnaire subtitle and opens the protected questionnaire from the summary", async () => {
    useAuthStore.setState({ user: { id: "organizer", name: "测试主办方", user_type: "organizer", tags: [] } });
    renderResults(vi.fn(), { participants: [
      { id: "owner", enrollmentId: "owner-enrollment", name: "参与者甲", registrationTypeId: "type-1", registrationTypeName: "NFC社交匹配问卷", registrationSummary: { formName: "报名姓名甲", meta: "产品经理 · 上海", updatedAt: null, items: [{ key: "goal", label: "参会目标", value: "寻找合作伙伴", tags: null }] } },
      { id: "candidate", name: "推荐对象乙", registrationTypeId: "type-1", registrationTypeName: "NFC社交匹配问卷" },
    ] });
    expect(screen.queryByText("NFC社交匹配问卷")).toBeNull();
    expect(screen.getByText("产品经理 · 上海")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "查看参与者甲的资料" }), { key: "Enter" });
    expect(screen.getByText("活动报名资料")).toBeInTheDocument();
    expect(screen.getByText("寻找合作伙伴")).toBeInTheDocument();
    expect(getEnrollmentQuestionnaire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "查看报名问卷" }));
    expect(screen.getByRole("dialog", { name: "参与者甲的报名问卷" })).toBeInTheDocument();
    expect(await screen.findByText("暂无可展示的报名资料")).toBeInTheDocument();
    expect(getEnrollmentQuestionnaire).toHaveBeenCalledWith("event-1", "owner-enrollment", expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "参与者甲的报名问卷" })).toBeNull();
    expect(screen.getByText("产品经理 · 上海")).toBeInTheDocument();
  });

  it("distinguishes different registration types with badges", () => {
    renderResults(vi.fn(), { participants: [
      { id: "owner", name: "参与者甲", registrationTypeId: "type-1", registrationTypeName: "普通参与者" },
      { id: "candidate", name: "推荐对象乙", registrationTypeId: "type-2", registrationTypeName: "分享嘉宾" },
    ] });
    expect(screen.getByText("普通参与者")).toBeInTheDocument();
    expect(screen.getByText("分享嘉宾")).toBeInTheDocument();
  });

  it("shows explicit zero/partial counts, filters their names, and does not flag supplements as low matches", () => {
    renderResults(vi.fn(), {
      constraints: { ...constraints, minMatches: 2 },
      matchResults: [
        { ...matchResults[0], scores: [{ total_score: null, supplementary: true }] },
        { ...matchResults[0], id: "empty", userId: "candidate", bestMatchUserIds: [], scores: [], unmatchedReason: "没有满足年龄限制的对象" },
      ],
    });
    expect(screen.getByText("2 人参与，1 人已获得推荐")).toBeInTheDocument();
    expect(screen.queryByText(/需关注/)).toBeNull();
    expect(screen.queryByText("低匹配")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1 人暂无推荐 · 查看名单" }));
    expect(screen.getByText("没有满足年龄限制的对象")).toBeInTheDocument();
    expect(screen.queryByText("参与者甲")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "1 人推荐不足 · 查看名单" }));
    expect(screen.getByText("参与者甲")).toBeInTheDocument();
    expect(screen.queryByText("没有满足年龄限制的对象")).toBeNull();
  });

  it("opens the dedicated relation-based Excel export workspace", () => {
    renderResults(vi.fn(), {
      matchStatusId: "match-1",
      resultRevision: 3,
      resultVersion: 2,
    });

    fireEvent.click(screen.getByRole("button", { name: "导出结果" }));

    expect(screen.getByTestId("location-path").textContent).toBe(
      "/dashboard/activity/event-1/matching/export",
    );
  });

  it("uses the whole participant item to preview profile and enrollment images", () => {
    vi.useFakeTimers();
    renderResults();

    expect(screen.getByLabelText("2 张报名图片")).not.toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "查看参与者甲的 2 张报名图片",
      }),
    ).toBeNull();

    fireEvent.mouseEnter(
      screen.getByRole("button", {
        name: "查看参与者甲的资料和 2 张报名图片",
      }),
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(
      screen.getByRole("dialog", { name: "参与者甲的用户资料" }),
    ).not.toBeNull();
    expect(
      screen.getByText("报名图片预览 owner-enrollment"),
    ).not.toBeNull();
    expect(prefetchEnrollmentImages).toHaveBeenCalledTimes(1);
    expect(prefetchEnrollmentImages).toHaveBeenCalledWith(
      expect.any(QueryClient),
      "anonymous",
      "event-1",
      "owner-enrollment",
      { contentLimit: 4 },
    );
  });

  it("keeps recommendation cards concise while exposing profile and enrollment images on hover", () => {
    vi.useFakeTimers();
    renderResults();

    expect(screen.getByAltText("推荐对象乙")).not.toBeNull();
    expect(screen.getByText("设计师 · 北京")).not.toBeNull();
    expect(screen.getByLabelText("3 张报名图片")).not.toBeNull();

    fireEvent.mouseEnter(
      screen.getByRole("button", {
        name: "查看推荐对象乙的资料和 3 张报名图片",
      }),
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(
      screen.getByRole("button", { name: "查看个人主页" }),
    ).not.toBeNull();
    expect(
      screen.getByText("报名图片预览 candidate-enrollment"),
    ).not.toBeNull();
    expect(prefetchEnrollmentImages).toHaveBeenCalledTimes(1);
    expect(prefetchEnrollmentImages).toHaveBeenCalledWith(
      expect.any(QueryClient),
      "anonymous",
      "event-1",
      "candidate-enrollment",
      { contentLimit: 4 },
    );
  });

  it("navigates from the hover card action and keeps internal scrolling usable", () => {
    vi.useFakeTimers();
    renderResults();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "查看推荐对象乙的资料和 3 张报名图片" }));
    act(() => { vi.advanceTimersByTime(300); });
    const dialog = screen.getByRole("dialog", { name: "推荐对象乙的用户资料" });
    fireEvent.scroll(dialog.firstElementChild!);
    expect(screen.getByRole("button", { name: "查看个人主页" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看个人主页" }));
    expect(screen.getByTestId("location-path").textContent).toBe("/u/profile/candidate");
    expect(screen.queryByRole("dialog", { name: "推荐对象乙的用户资料" })).toBeNull();
  });

  it("does not prefetch images when the pointer only passes over an item", () => {
    vi.useFakeTimers();
    renderResults();

    const item = screen.getByRole("button", {
      name: "查看推荐对象乙的资料和 3 张报名图片",
    });
    fireEvent.mouseEnter(item);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(item);
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(prefetchEnrollmentImages).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "推荐对象乙的用户资料" }),
    ).toBeNull();
  });

  it("uses concise sorting labels without the redundant filter toolbar", () => {
    renderResults();

    expect(
      (screen.getByRole("combobox", { name: "排序方式" }) as HTMLSelectElement)
        .value,
    ).toBe("score-desc");
    expect(
      screen.getByRole("option", { name: "低匹配优先" }),
    ).not.toBeNull();
    expect(
      screen.getByRole("option", { name: "高匹配优先" }),
    ).not.toBeNull();
    expect(screen.getByRole("option", { name: "按姓名" })).not.toBeNull();
    expect(
      screen.queryByRole("option", { name: "需处理优先" }),
    ).toBeNull();
    expect(
      screen.queryByRole("group", { name: "筛选匹配结果" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "全部" })).toBeNull();
  });

  it("does not expose exact match scores in the result cards", () => {
    renderResults();

    expect(screen.queryByText("80%")).toBeNull();
    expect(screen.queryByText("暂无得分")).toBeNull();
  });

  it("moves the rematch entry into the result header", () => {
    const { onRematch } = renderResults();

    fireEvent.click(
      screen.getByRole("button", { name: "修改匹配设置" }),
    );

    expect(onRematch).toHaveBeenCalledTimes(1);
  });
});
