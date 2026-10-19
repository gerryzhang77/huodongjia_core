import { afterEach, describe, expect, it, vi } from "vitest";
import { matchingFetch } from "./matchingRequest";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("matching HTTP failures", () => {
  it("reports a gateway HTML response without leaking it into a JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html><h1>504 Gateway Time-out</h1></html>", { status: 504 })));
    await expect(matchingFetch("/api/match/event/rules")).rejects.toThrow("服务响应超时");
  });
  it("retains structured validation diagnostics", async () => {
    const payload = { success: false, code: "MATCH_PREFLIGHT_FAILED", diagnostics: { canExecute: false } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload, { status: 400 })));
    const result = await matchingFetch("/api/match/event/preflight");
    expect(result.ok).toBe(false);
    expect(await result.json()).toEqual(payload);
  });
  it("bounds even a response body that never finishes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, { signal }) => Promise.resolve({
      status: 200, ok: true,
      text: () => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    })));
    const request = matchingFetch("/api/match/event/preflight", {}, 100);
    const assertion = expect(request).rejects.toThrow("请求超时");
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});
