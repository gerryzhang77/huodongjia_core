import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./withTimeout";
afterEach(() => vi.useRealTimers());
describe("image processing timeout", () => {
  it("settles stalled work and disposes a bitmap that finishes after timeout", async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const dispose = vi.fn();
    const result = withTimeout(new Promise<string>(resolve => { finish = resolve; }), 100, "图片处理超时", dispose);
    const failure = expect(result).rejects.toThrow("图片处理超时");
    await vi.advanceTimersByTimeAsync(100);
    await failure;
    finish("late-bitmap");
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledWith("late-bitmap");
  });
  it("returns successful work and clears its timer", async () => {
    vi.useFakeTimers();
    expect(await withTimeout(Promise.resolve("image"), 100, "timeout")).toBe("image");
    expect(vi.getTimerCount()).toBe(0);
  });
});
