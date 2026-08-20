import type { Demand, DemandPriority } from "@/types/domain";

const priorityWeight: Record<DemandPriority, number> = {
  baixa: 1,
  media: 2,
  alta: 3,
  urgente: 4,
};

export function getPriorityScore(demand: Demand) {
  return priorityWeight[demand.priority];
}

export function sortDemandsByPriorityAndDate(demands: Demand[]) {
  return [...demands].sort((a, b) => {
    if (!a.due_date && !b.due_date) return getPriorityScore(b) - getPriorityScore(a);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    const dateDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return getPriorityScore(b) - getPriorityScore(a);
  });
}
