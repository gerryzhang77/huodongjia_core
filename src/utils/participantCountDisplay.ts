// 临时展示规则：中秋公益敬老·青年交友活动隐藏原有 30 个占位名额。
// 恢复真实人数时移除此配置；不得用于报名校验、统计或修改接口数据。
const HIDDEN_PARTICIPANT_COUNTS = new Map<string, number>([
  ["0052ba95-0a98-49b4-aa2b-1785f84c1aee", 30],
]);

interface ActivityParticipantCounts {
  id: string;
  currentParticipants?: number;
  occupiedParticipants?: number;
  capacitySummary?: { occupiedParticipants: number } | null;
}

/** 仅转换展示人数；目标活动优先使用占位人数，避免将累计报名误计为新增报名。 */
export function getDisplayParticipantCount(
  activity: ActivityParticipantCounts,
  originalCount: number,
): number {
  const hiddenCount = HIDDEN_PARTICIPANT_COUNTS.get(activity.id);
  if (hiddenCount === undefined) return originalCount;

  const occupiedCount =
    activity.capacitySummary?.occupiedParticipants ??
    activity.occupiedParticipants ??
    activity.currentParticipants ??
    originalCount;
  return Math.max(0, occupiedCount - hiddenCount);
}
