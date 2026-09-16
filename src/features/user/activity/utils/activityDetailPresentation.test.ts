import { describe, expect, it } from "vitest";
import { getActivityCapacityPresentation } from "./activityDetailPresentation";
import { getDisplayParticipantCount, getDisplayRemainingParticipants } from "@/utils/participantCountDisplay";

describe("getActivityCapacityPresentation", () => {
  it("formats a finite capacity as a compact quota label", () => {
    expect(getActivityCapacityPresentation(45, 60)).toEqual({
      label: "名额 45/60 · 剩余 15",
      isFull: false,
    });
  });

  it("marks a capacity as full when enrollment reaches the limit", () => {
    expect(getActivityCapacityPresentation(60, 60)).toEqual({
      label: "名额 60/60 · 已满",
      isFull: true,
    });
  });

  it("uses an unlimited label when no maximum is configured", () => {
    expect(getActivityCapacityPresentation(18, 0)).toEqual({
      label: "名额不限",
      isFull: false,
    });
  });

  it("preserves actual remaining capacity when the displayed count is adjusted", () => {
    expect(getActivityCapacityPresentation(31, 50, 1)).toEqual({
      label: "名额 1/50 · 剩余 19",
      isFull: false,
    });
  });

  it("still marks the event as full when the displayed count is below capacity", () => {
    expect(getActivityCapacityPresentation(50, 50, 20)).toEqual({
      label: "名额 20/50 · 已满",
      isFull: true,
    });
  });
});

describe("restored event capacity display", () => {
  const eventId = "0052ba95-0a98-49b4-aa2b-1785f84c1aee";

  it.each([
    [30, 30, 20],
    [31, 31, 19],
    [32, 32, 18],
    [20, 20, 30],
    [50, 50, 0],
    [80, 80, 0],
  ])("shows %i actual attendees as %i with %i remaining", (actual, displayed, remaining) => {
    const activity = Object.freeze({ id: eventId, currentParticipants: actual });
    const displayedCount = getDisplayParticipantCount(activity, actual);
    const displayedRemaining = getDisplayRemainingParticipants(activity, actual, 50);
    expect(getActivityCapacityPresentation(actual, 50, displayedCount, displayedRemaining)).toEqual({
      label: remaining === 0
        ? `名额 ${displayed}/50 · 已满`
        : `名额 ${displayed}/50 · 剩余 ${remaining}`,
      isFull: actual >= 50,
    });
    expect(activity.currentParticipants).toBe(actual);
  });

  it("preserves the server's real remaining count for the restored event and other events", () => {
    const target = { id: eventId, occupiedParticipants: 30 };
    const other = { id: "another-event", occupiedParticipants: 30 };
    expect(getDisplayRemainingParticipants(target, 30, 50, 20)).toBe(20);
    expect(getDisplayRemainingParticipants(other, 30, 50, 20)).toBe(20);
  });

  it("preserves separate application totals and real remaining capacity", () => {
    const activity = { id: eventId, occupiedParticipants: 30 };
    expect(getDisplayParticipantCount(activity, 31)).toBe(31);
    expect(getDisplayRemainingParticipants(activity, 31, 50, 20)).toBe(20);
  });

  it("keeps unlimited events unlimited even when display overrides are provided", () => {
    expect(getActivityCapacityPresentation(30, 0, 0, 0)).toEqual({
      label: "名额不限",
      isFull: false,
    });
  });
});
