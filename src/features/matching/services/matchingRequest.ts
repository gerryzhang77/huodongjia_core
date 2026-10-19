/** Match APIs include slow computations; bound the entire response, including its body. */
export async function matchingFetch(url: string, init: RequestInit = {}, timeoutMs = 25_000) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let data: unknown;
    try { data = JSON.parse(raw); } catch {
      throw new Error(response.status === 504
        ? "服务响应超时，请稍后重试"
        : response.status === 502 || response.status === 503
          ? "匹配服务暂时不可用，请稍后重试"
          : `匹配接口返回异常（HTTP ${response.status}），请稍后重试`);
    }
    // Preserve structured business diagnostics for the API layer.
    return { ok: response.ok, status: response.status, json: async () => data as any, text: async () => raw };
  } catch (error) {
    if (timedOut) throw new Error("请求超时，请稍后重试；已提交的匹配可刷新页面查看进度");
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
