export interface ActivityCapacityPresentation {
  label: string;
  isFull: boolean;
}

const normalizeCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** 展示人数可临时调整；剩余名额及满员状态始终按真实占位人数计算。 */
export function getActivityCapacityPresentation(
  currentParticipants: number,
  maxParticipants: number,
  displayParticipantCount = currentParticipants,
): ActivityCapacityPresentation {
  const current = normalizeCount(currentParticipants);
  const maximum = normalizeCount(maxParticipants);

  if (maximum === 0) {
    return { label: "名额不限", isFull: false };
  }

  const isFull = current >= maximum;
  const displayed = normalizeCount(displayParticipantCount);
  return {
    label: isFull
      ? `名额 ${displayed}/${maximum} · 已满`
      : `名额 ${displayed}/${maximum} · 剩余 ${maximum - current}`,
    isFull,
  };
}
