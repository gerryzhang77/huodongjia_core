import { describe, expect, it } from "vitest";
import type { ParticipantMatchResult } from "../../types";
import {
  buildParticipantResultRows,
  getCollapsedMatchPreview,
  shouldShowMatchListToggle,
  sortParticipantResultRows,
  toScorePercent,
  type ResultParticipant,
} from "./resultViewModel";

const makeRecord = (
  userId: string,
  bestMatchUserIds: string[],
  scores: ParticipantMatchResult["scores"],
  isLocked = false,
): ParticipantMatchResult => ({
  id: `result-${userId}`,
  userId,
  matchId: "match-1",
  bestMatchUserIds,
  scores,
  createdAt: "2026-07-22T00:00:00.000Z",
  isLocked,
});

describe("buildParticipantResultRows", () => {
  it("keeps one owner row, preserves ranking, and identifies reciprocal recommendations", () => {
    const participants: ResultParticipant[] = [
      { id: "a", name: "参与者 A" },
      { id: "b", name: "参与者 B" },
      { id: "c", name: "候选人 C" },
      { id: "d", name: "缺少结果 D" },
    ];
    const matchResults = [
      makeRecord(
        "a",
        ["b", "c"],
        [
          { total_score: 0.8 },
          { total_score: 0.35, total_score_percent: 35 },
        ],
      ),
      makeRecord("b", ["a"], [{ total_score: 0.7 }], true),
    ];
    const rows = buildParticipantResultRows({
      matchResults,
      participantMap: new Map(participants.map((item) => [item.id, item])),
      validationIssueMap: new Map([["d", ["缺少推荐对象"]]]),
      lowMatchThreshold: 40,
    });

    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row.ownerId === "c")).toBe(false);

    const rowA = rows.find((row) => row.ownerId === "a");
    expect(rowA?.matches.map((match) => match.candidateId)).toEqual(["b", "c"]);
    expect(rowA?.matches[0].reciprocalRank).toBe(1);
    expect(rowA?.matches[1].reciprocalRank).toBeNull();
    expect(rowA?.bestScore).toBe(80);
    expect(rowA?.averageScore).toBe(58);

    const rowB = rows.find((row) => row.ownerId === "b");
    expect(rowB?.isLocked).toBe(true);

    const rowD = rows.find((row) => row.ownerId === "d");
    expect(rowD).toMatchObject({
      hasConflict: true,
      hasNoMatches: true,
      isLowMatch: false,
      issues: ["缺少推荐对象"],
    });
  });
});

describe("toScorePercent", () => {
  it("keeps supplementary recommendations unscored instead of showing zero percent", () => {
    expect(toScorePercent({ total_score: null, supplementary: true })).toBeNull();
    expect(toScorePercent({ total_score: 0 })).toBe(0);
  });
  it("normalizes fractional scores and clamps invalid ranges", () => {
    expect(toScorePercent({ total_score: 0.5 })).toBe(50);
    expect(toScorePercent({ total_score: 0, total_score_percent: 130 })).toBe(100);
    expect(toScorePercent(null)).toBeNull();
  });
});

describe("collapsed recommendation preview", () => {
  it("shows at most three items and only enables expansion above three", () => {
    expect(getCollapsedMatchPreview([1, 2])).toEqual([1, 2]);
    expect(getCollapsedMatchPreview([1, 2, 3, 4, 5])).toEqual([1, 2, 3]);
    expect(shouldShowMatchListToggle(3)).toBe(false);
    expect(shouldShowMatchListToggle(4)).toBe(true);
  });
});

describe("sortParticipantResultRows", () => {
  it("sorts objectively by score or name and puts missing results first in ascending order", () => {
    const participants: ResultParticipant[] = [
      { id: "a", name: "A 用户" },
      { id: "b", name: "B 用户" },
      { id: "c", name: "C 用户" },
      { id: "target", name: "推荐对象" },
    ];
    const rows = buildParticipantResultRows({
      matchResults: [
        makeRecord("a", ["target"], [
          { total_score: 0.8, total_score_percent: 80 },
        ]),
        makeRecord("b", ["target"], [
          { total_score: 0.3, total_score_percent: 30 },
        ]),
        makeRecord("c", [], []),
      ],
      participantMap: new Map(participants.map((item) => [item.id, item])),
      validationIssueMap: new Map(),
      lowMatchThreshold: 40,
    });

    expect(
      sortParticipantResultRows(rows, "score-asc").map((row) => row.ownerId),
    ).toEqual(["c", "b", "a"]);
    expect(
      sortParticipantResultRows(rows, "score-desc").map((row) => row.ownerId),
    ).toEqual(["a", "b", "c"]);
    expect(
      sortParticipantResultRows([...rows].reverse(), "name").map(
        (row) => row.ownerId,
      ),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("supplementary result status", () => {
  it("keeps an unscored supplementary recommendation out of low-score warnings", () => {
    const [row] = buildParticipantResultRows({
      matchResults: [makeRecord("a", ["b"], [{ total_score: null, supplementary: true }])],
      participantMap: new Map(), validationIssueMap: new Map(), lowMatchThreshold: 40,
    });
    expect(row.hasNoMatches).toBe(false);
    expect(row.bestScore).toBeNull();
    expect(row.isLowMatch).toBe(false);
  });
});
