import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMatchFieldCatalog, getMatchRules, saveMatchRules, getMatchGroups } from "./matchingApi";

describe("getMatchFieldCatalog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        data: { fields: [], totalEligibleParticipants: 0 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { token: "test-token" } }),
    );
  });

  it("posts the selected participant scope for coverage calculation", async () => {
    await getMatchFieldCatalog("event-1", ["user-c", "user-a"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/match/event-1/field-catalog",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ participantUserIds: ["user-c", "user-a"] }),
      }),
    );
  });

  it("preserves supplementary recommendations without inventing a score", async () => {
    fetchMock.mockResolvedValueOnce({ json: async () => ({ success: true, groups: [{
      user_id: "a", best_match_users: ["b"], scores: [{ total_score: null, total_score_percent: null, supplementary: true, fields: [] }],
    }] }) });
    const result = await getMatchGroups("event-1");
    expect(result.results[0].scores?.[0]).toMatchObject({ total_score: null, total_score_percent: null, supplementary: true });
  });

  it("keeps the legacy unscoped read available for prefetch callers", async () => {
    await getMatchFieldCatalog("event-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/match/event-1/field-catalog",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps disabled invalid rules in the editable configuration payload", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true }),
    });

    await saveMatchRules("event-1", [
      {
        id: "orphan-rule",
        name: "规则 1",
        source_field: "custom_1785063125127",
        target_field: "custom_1785063125127",
        source_label_snapshot: "custom_1785063125127",
        target_label_snapshot: "custom_1785063125127",
        operator: "similarity",
        type: "similarity",
        weight: 0.7,
        enabled: false,
        valid: false,
        invalid_reason: "FIELD_REMOVED",
      },
    ]);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      rules: [
        expect.objectContaining({
          source_field: "custom_1785063125127",
          enabled: false,
        }),
      ],
    });
  });

  it("preserves rule validity metadata returned by the backend", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        rules: [{
          id: "orphan-rule",
          source_field: "custom_1785063125127",
          target_field: "custom_1785063125127",
          source_label_snapshot: "custom_1785063125127",
          target_label_snapshot: "custom_1785063125127",
          operator: "similarity",
          weight: 0.7,
          enabled: false,
          valid: false,
          invalid_reason: "FIELD_REMOVED",
          source_field_status: "FIELD_REMOVED",
          target_field_status: "FIELD_REMOVED",
        }],
      }),
    });

    const [rule] = await getMatchRules("event-1");
    expect(rule).toMatchObject({
      valid: false,
      invalid_reason: "FIELD_REMOVED",
      source_field_status: "FIELD_REMOVED",
      enabled: false,
    });
  });
});
