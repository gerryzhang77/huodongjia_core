import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import UserPoolPage from "./UserPoolPage";
import { getMerchantUserPool } from "@/features/merchant/user-pool/services/userPoolApi";

vi.mock("@/components/layout", () => ({ MerchantLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/merchant/activity-manage/services/activityManageApi", () => ({ getMerchantActivities: vi.fn().mockResolvedValue({ success: true, data: { activities: [] } }) }));
vi.mock("@/features/merchant/user-pool/services/userPoolApi", () => ({
  getMerchantUserPool: vi.fn(), listCustomTags: vi.fn().mockResolvedValue({ success: true, data: { tags: [] } }),
}));

it("uses the full total, pages beyond 50, and searches the entire pool from page one", async () => {
  const row = (id: string, name: string) => ({ id, name, participationCount: 1, participatedActivityIds: [], participatedActivityNames: [], autoTags: [], customTags: [] });
  vi.mocked(getMerchantUserPool).mockImplementation(async (page, _size, options) => ({
    success: true,
    data: {
      users: [row(options?.keyword ? "found" : `page-${page}`, options?.keyword ? "全库命中用户" : `第${page}页用户`)],
      total: 474, filteredTotal: options?.keyword ? 1 : 474, scopeTotal: 474, page: page!, pageSize: 50,
      stats: { totalUsers: 474, activeUsers: 20, newUsersThisMonth: 30, avgParticipation: "1.1" },
      activityCounts: {}, filterOptions: { gender: [], city: [], industry: [], occupation: [], ageGroup: [], activityLevel: [], autoTags: [], customTags: [] },
    },
  } as any));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><UserPoolPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText("第1页用户")).toBeInTheDocument();
  expect(screen.getByText("第 1 / 10 页 · 共 474 人")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  expect(await screen.findByText("第2页用户")).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("搜索姓名、行业、城市、标签..."), { target: { value: "全库" } });
  await waitFor(() => expect(getMerchantUserPool).toHaveBeenLastCalledWith(1, 50, expect.objectContaining({ keyword: "全库" })));
  expect(await screen.findByText("全库命中用户")).toBeInTheDocument();
  expect(screen.getByText("全选本页")).toBeInTheDocument();
  expect(screen.getAllByText("474").length).toBeGreaterThan(0);
});
