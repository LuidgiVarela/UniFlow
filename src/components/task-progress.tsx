import type { Demand, DemandQuestion, DemandQuestionItem } from "@/types/domain";

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

export function getDetailedTaskProgress(
  demand: Demand,
  questions: DemandQuestion[],
  questionItems: DemandQuestionItem[],
): TaskProgressValue | null {
  const questionIds = questions
    .filter((question) => question.demand_id === demand.id)
    .map((question) => question.id);
  if (!questionIds.length) return getTaskProgress(demand);

  const items = questionItems.filter((item) => questionIds.includes(item.question_id));
  if (!items.length) return getTaskProgress(demand);

  const completed = items.filter((item) => item.done).length;
  return {
    total: items.length,
    completed,
    percent: Math.min(100, Math.round((completed / items.length) * 100)),
    label: "itens",
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
