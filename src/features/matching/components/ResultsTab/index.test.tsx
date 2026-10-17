import { act, fireEvent, render, screen } from "@testing-library/react";
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
});

describe("ResultsTab interactions", () => {
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
