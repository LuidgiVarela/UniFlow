import type { Assessment } from "@/types/domain";

export function assessmentWeightText(assessment: Assessment) {
  return assessment.weight === null ? null : `Peso ${assessment.weight}%`;
}

export function calculateWeightedAverage(assessments: Assessment[]) {
  const items = assessments.filter(
    (assessment) =>
      assessment.score !== null &&
      assessment.max_score &&
      assessment.weight !== null,
  );
  const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  if (!totalWeight) return null;

  const weighted = items.reduce(
    (sum, item) => sum + ((item.score ?? 0) / (item.max_score || 1)) * 10 * (item.weight ?? 0),
    0,
  );
  return weighted / totalWeight;
}
