import { describe, expect, it } from "vitest";
import { getActivityCapacityPresentation } from "./activityDetailPresentation";

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
