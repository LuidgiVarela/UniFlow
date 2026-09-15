import { daysUntil } from "@/lib/date";
import type { TopicMasteryLevel } from "@/types/domain";

export const MASTERY_READINESS_POINTS: Record<TopicMasteryLevel, number> = {
  0: 0,
  1: 15,
  2: 50,
  3: 90,
};

export type ReadinessItem = {
  mastery: TopicMasteryLevel;
  nextReviewDate?: string | null;
  unmetPrerequisiteCount?: number;
};

export function calculateReadiness(items: ReadinessItem[]) {
  if (!items.length) return 0;
  const total = items.reduce((sum, item) => {
    let score = MASTERY_READINESS_POINTS[item.mastery];
    if (item.nextReviewDate) {
      const overdueDays = Math.max(0, -daysUntil(item.nextReviewDate));
      if (overdueDays) score *= Math.max(0.62, 1 - Math.min(0.38, overdueDays * 0.035));
    }
    if (item.unmetPrerequisiteCount) score *= 0.65;
    return sum + score;
  }, 0);
  return Math.round(total / items.length);
}
