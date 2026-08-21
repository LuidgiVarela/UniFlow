import type { Demand } from "@/types/domain";

export type TaskProgressValue = {
  total: number;
  completed: number;
  percent: number;
  label?: string;
};

export function getTaskProgress(demand: Demand): TaskProgressValue | null {
  const total = demand.total_items ?? null;
  const completed = demand.completed_items ?? null;
  if (total === null || completed === null || total <= 0) return null;
  return {
    total,
    completed,
    percent: Math.min(100, Math.round((completed / total) * 100)),
    label: "questões",
  };
}

export function TaskProgress({
  demand,
  progress: progressOverride,
}: {
  demand: Demand;
  progress?: TaskProgressValue | null;
}) {
  const progress = progressOverride ?? getTaskProgress(demand);
  if (!progress) return null;

  return (
    <div className="task-progress">
      <div className="progress-track subtle">
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <small>{progress.percent}%</small>
      <small>
        {progress.completed} de {progress.total} {progress.label ?? "itens"}
      </small>
    </div>
  );
}
