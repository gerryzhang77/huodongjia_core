import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EnrollmentQuestionnaireDrawer from "./EnrollmentQuestionnaireDrawer";
import {
  getEnrollmentQuestionnaire,
  revealQuestionnaireField,
} from "../services/questionnaireApi";

vi.mock("../services/questionnaireApi");
vi.mock("@/features/auth/stores", () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) =>
    select({ user: { id: "organizer" } }),
}));
vi.mock("@/components/enrollment/PrivateEnrollmentImageGallery", () => ({
  default: () => <div>受保护的报名图片</div>,
}));

const clients: QueryClient[] = [];
const data = {
  enrollmentId: "enrollment-1",
  registrationTypeName: "嘉宾问卷",
  updatedAt: "2026-10-18T00:00:00Z",
  answerRevision: 2,
  fields: [
    {
      key: "goal",
      label: "参会目标",
      type: "text",
      value: "寻找技术伙伴",
      tags: null,
      sensitive: false,
      historical: false,
    },
    {
      key: "phone",
      label: "手机号",
      type: "text",
      value: "",
      tags: null,
      sensitive: true,
      historical: false,
    },
    {
      key: "past",
      label: "已移除的问题",
      type: "text",
      value: "保留的答案",
      tags: null,
      sensitive: false,
      historical: true,
    },
  ],
};
const setup = (onClose = vi.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return {
    onClose,
    ...render(
      <QueryClientProvider client={client}>
        <EnrollmentQuestionnaireDrawer
          activityId="event-1"
          enrollmentId="enrollment-1"
          name="测试参与者"
          onClose={onClose}
        />
      </QueryClientProvider>,
    ),
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getEnrollmentQuestionnaire).mockResolvedValue(data);
  vi.mocked(revealQuestionnaireField).mockResolvedValue({
    ...data.fields[1],
    value: "synthetic-contact",
  });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe("protected questionnaire drawer", () => {
  it("shows current and historical answers, revealing sensitive answers only on explicit click", async () => {
    const view = setup();
    expect(await screen.findByText("寻找技术伙伴")).toBeInTheDocument();
    expect(screen.getByText("历史填写内容")).toBeInTheDocument();
    expect(screen.getByText("敏感信息已隐藏")).toBeInTheDocument();
    expect(revealQuestionnaireField).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "查看手机号" }));
    expect(await screen.findByText("synthetic-contact")).toBeInTheDocument();
    expect(revealQuestionnaireField).toHaveBeenCalledWith(
      "event-1",
      "enrollment-1",
      "phone",
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "隐藏手机号" }));
    expect(screen.queryByText("synthetic-contact")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(view.onClose).toHaveBeenCalledOnce();
  });

  it("retries a failed read and gives one empty state instead of empty field rows", async () => {
    vi.mocked(getEnrollmentQuestionnaire)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...data, fields: [] });
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "报名问卷加载失败",
    );
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("暂无可展示的报名资料")).toBeInTheDocument();
  });

  it("aborts a pending sensitive read when closed and keeps sensitive answers out of shared cache", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(revealQuestionnaireField).mockImplementation(
      (_event, _enrollment, _key, requestSignal) => {
        signal = requestSignal;
        return new Promise(() => {});
      },
    );
    const view = setup();
    await screen.findByText("寻找技术伙伴");
    fireEvent.click(screen.getByRole("button", { name: "查看手机号" }));
    await waitFor(() => expect(signal).toBeDefined());
    act(() => view.unmount());
    expect(signal?.aborted).toBe(true);
    expect(
      JSON.stringify(
        clients[0]
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain("synthetic-contact");
  });
});
