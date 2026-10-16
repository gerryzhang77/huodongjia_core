import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserRegistration from "./UserRegistration";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), upload: vi.fn(), toast: vi.fn() }));
vi.mock("@/features/auth/stores", () => ({ useAuthStore: () => ({ user: { id: "synthetic-user", user_type: "user", phone: "13800000000" }, isAuthenticated: true, authStatus: "authenticated" }) }));
vi.mock("@/components/layout/UserLayout", () => ({ UserLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/Toast", () => ({ Toast: { show: mocks.toast } }));
vi.mock("@/features/user", () => {
  const data = { title: "测试活动", activityStatus: "published", registrationStart: "2020-01-01", registrationEnd: "2099-01-01", activityEnd: "2099-01-02", maxParticipants: 50, currentParticipants: 0, registrationFormSchema: [
    { key: "name", label: "姓名", type: "text", required: true },
    { key: "phone", label: "手机号", type: "text", required: true },
    { key: "photo", label: "生活照", type: "image", required: true, maxImages: 2 },
  ] };
  return { useActivityDetail: () => ({ data: { data }, isLoading: false }), usePublicActivityDetail: () => ({ data: { data }, isLoading: false }) };
});
vi.mock("@/features/user/enrollment/hooks/useSubmitEnrollment", () => ({ useSubmitEnrollment: () => ({ mutateAsync: mocks.submit, isPending: false }) }));
vi.mock("@/features/user/field-library", () => ({ useProfilePrefill: () => ({ data: undefined }), useUpsertFieldLibrary: () => ({ mutateAsync: vi.fn() }), matchPrefillField: vi.fn(), toFormValue: vi.fn(), mapFieldTypeToStorage: () => "text" }));
vi.mock("@/features/uploads", () => ({ useImageUpload: () => ({ uploadWithPreview: mocks.upload }) }));
vi.mock("@/services/enrollmentApi", () => ({ getEnrollmentEditContext: vi.fn().mockResolvedValue({ data: null }), getOwnEnrollmentImages: vi.fn().mockResolvedValue([]), updateEnrollmentAnswers: vi.fn(), uploadEnrollmentImage: vi.fn(), deletePendingEnrollmentImage: vi.fn(), getOwnEnrollmentImageBlob: vi.fn() }));
const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/u/activities/event/register"]}><Routes><Route path="/u/activities/:id/register" element={<UserRegistration />} /></Routes></MemoryRouter></QueryClientProvider>);
};
beforeEach(() => {
  vi.clearAllMocks();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.submit.mockRejectedValue(new Error("名额已满，请选择其他活动"));
  mocks.upload.mockReturnValue({ tempUrl: "blob:preview", finalUrlPromise: Promise.resolve("asset-1"), releasePreview: vi.fn() });
});
describe("registration submission feedback", () => {
  it("allows an incomplete form to explain the missing field and focus it", async () => {
    show();
    const button = await screen.findByRole("button", { name: "确认报名" });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByText("请填写「姓名」")).toBeVisible();
    expect(screen.getByPlaceholderText("请输入姓名")).toHaveFocus();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("submits completed uploads, keeps answers after a server error and permits retry", async () => {
    const { container } = show();
    await screen.findByRole("button", { name: "确认报名" });
    fireEvent.change(screen.getByPlaceholderText("请输入姓名"), { target: { value: "测试参与者" } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["test"], "photo.jpg", { type: "image/jpeg" })] } });
    await screen.findByText("已上传");
    fireEvent.click(screen.getByRole("button", { name: "确认报名" }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("名额已满");
    expect(screen.getByPlaceholderText("请输入姓名")).toHaveValue("测试参与者");
    expect(screen.getByRole("button", { name: "确认报名" })).toBeEnabled();
  });
  it("unblocks the button after an image failure and explains the required upload", async () => {
    let reject!: (error: Error) => void;
    mocks.upload.mockReturnValue({ tempUrl: "blob:preview", finalUrlPromise: new Promise((_resolve, fail) => { reject = fail; }), releasePreview: vi.fn() });
    const { container } = show();
    await screen.findByRole("button", { name: "确认报名" });
    fireEvent.change(screen.getByPlaceholderText("请输入姓名"), { target: { value: "测试参与者" } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["test"], "photo.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByRole("button", { name: "图片上传中" })).toBeDisabled();
    reject(new Error("图片处理超时"));
    const submit = await screen.findByRole("button", { name: "确认报名" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByText("请完成「生活照」的图片上传")).toBeVisible();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
