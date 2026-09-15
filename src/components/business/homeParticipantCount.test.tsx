import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { UserActivity } from "@/mocks/data/user-activities";
import { ActivityCard } from "./ActivityCard";
import { ActivityListItem } from "./ActivityListItem";
import { HotActivityCarousel } from "./HotActivityCarousel";

const EVENT_ID = "0052ba95-0a98-49b4-aa2b-1785f84c1aee";
const makeActivity = (currentParticipants: number, id = EVENT_ID): UserActivity =>
  Object.freeze({
    id,
    title: "中秋公益敬老·青年交友活动",
    coverImage: "/activity-test.png",
    eventStartTime: "2099-09-19T05:30:00Z",
    eventEndTime: "2099-09-19T09:00:00Z",
    location: "上海",
    maxParticipants: 50,
    currentParticipants,
    tags: [],
    userStatus: "recruiting",
    activityStatus: "recruiting",
    organizer: { id: "organizer", name: "主办方", avatar: "" },
  });

const cards = {
  grid: (activity: UserActivity) => (
    <ActivityCard activity={activity} enableQuickFavorite={false} />
  ),
  list: (activity: UserActivity) => <ActivityListItem activity={activity} />,
  carousel: (activity: UserActivity) => (
    <HotActivityCarousel activities={[activity]} autoplay={false} />
  ),
};

afterEach(cleanup);

describe.each(Object.entries(cards))("home attendance: %s", (_name, card) => {
  const renderCard = (activity: UserActivity) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(card(activity), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
  };

  it("hides the original attendees and updates when a new attendee joins", () => {
    const original = makeActivity(30);
    const view = renderCard(original);
    expect(screen.getAllByText(/^0\/50(?:\s*人)?$/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^30\/50(?:\s*人)?$/)).toBeNull();
    const next = makeActivity(31);
    view.rerender(card(next));
    expect(screen.getAllByText(/^1\/50(?:\s*人)?$/).length).toBeGreaterThan(0);
    expect(original.currentParticipants).toBe(30);
    expect(next.currentParticipants).toBe(31);
  });

  it("keeps the real count for a different event with the same title", () => {
    renderCard(makeActivity(30, "another-event"));
    expect(screen.getAllByText(/^30\/50(?:\s*人)?$/).length).toBeGreaterThan(0);
  });

  it("never displays a negative count when attendance drops below 30", () => {
    renderCard(makeActivity(20));
    expect(screen.getAllByText(/^0\/50(?:\s*人)?$/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^-10\/50(?:\s*人)?$/)).toBeNull();
  });
});
