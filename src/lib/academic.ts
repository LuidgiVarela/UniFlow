import { daysUntil } from "@/lib/date";
import type { Assessment, Topic } from "@/types/domain";

export function topicProgress(topics: Topic[]) {
  const done = topics.filter((topic) => topic.status === "concluido").length;
  const total = topics.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

export function nextAssessment(assessments: Assessment[], subjectId?: string) {
  const items = assessments
    .filter((assessment) => assessment.status === "futura" && assessment.date)
    .filter((assessment) => !subjectId || assessment.subject_id === subjectId)
    .sort((a, b) => new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime());
  return items[0] ?? null;
}

export function assessmentDaysText(assessment: Assessment | null) {
  if (!assessment?.date) return "sem avaliação";
  const days = daysUntil(assessment.date);
  if (days < 0) return `${Math.abs(days)}d atrasado`;
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `${days} dias`;
}
