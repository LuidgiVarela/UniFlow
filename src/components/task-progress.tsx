import type { Demand } from "@/types/domain";

export function getTaskProgress(demand: Demand) {
  const total = demand.total_items ?? null;
  const completed = demand.completed_items ?? null;
  if (total === null || completed === null || total <= 0) return null;
  return {
    total,
    completed,
    percent: Math.min(100, Math.round((completed / total) * 100)),
  };
}

export function TaskProgress({ demand }: { demand: Demand }) {
  const progress = getTaskProgress(demand);
  if (!progress) return null;

  return (
    <div className="task-progress">
      <div className="progress-track subtle">
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <small>{progress.percent}%</small>
      <small>
        {progress.completed} de {progress.total} questões
      </small>
    </div>
  );
}
