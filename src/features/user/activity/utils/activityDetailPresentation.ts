export interface ActivityCapacityPresentation {
  label: string;
  isFull: boolean;
}

const normalizeCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** 人数及剩余名额可临时调整展示；isFull 始终反映真实占位人数。 */
export function getActivityCapacityPresentation(
  currentParticipants: number,
  maxParticipants: number,
  displayParticipantCount = currentParticipants,
  displayRemainingParticipants?: number,
): ActivityCapacityPresentation {
  const current = normalizeCount(currentParticipants);
  const maximum = normalizeCount(maxParticipants);

  if (maximum === 0) {
    return { label: "名额不限", isFull: false };
  }

  const isFull = current >= maximum;
  const displayed = normalizeCount(displayParticipantCount);
  const remaining = displayRemainingParticipants === undefined
    ? Math.max(0, maximum - current)
    : normalizeCount(displayRemainingParticipants);
  return {
    label: remaining === 0
      ? `名额 ${displayed}/${maximum} · 已满`
      : `名额 ${displayed}/${maximum} · 剩余 ${remaining}`,
    isFull,
  };
}
