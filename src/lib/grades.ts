import type { Assessment, GradeComponent } from "@/types/domain";

export function assessmentWeightText(assessment: Assessment, component?: GradeComponent | null) {
  if (assessment.weight === null) return null;
  if (component?.calculation === "average") return null;
  if (component?.calculation === "weighted") return `Peso no critério ${assessment.weight}%`;
  return `Peso ${assessment.weight}%`;
}

export function isAssessmentGraded(assessment: Assessment) {
  return assessment.score !== null && assessment.max_score !== null && assessment.max_score > 0;
}

export function isAssessmentUpcoming(assessment: Assessment) {
  return assessment.status === "futura" && assessment.score === null;
}

export function assessmentScoreOnTen(assessment: Assessment) {
  if (!isAssessmentGraded(assessment)) return null;
  return ((assessment.score ?? 0) / (assessment.max_score ?? 1)) * 10;
}

export function calculateWeightedAverage(assessments: Assessment[]) {
  const items = assessments.filter((assessment) => isAssessmentGraded(assessment) && assessment.weight !== null);
  const totalWeight = items.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  if (!totalWeight) return null;

  const weighted = items.reduce(
    (sum, item) => sum + (assessmentScoreOnTen(item) ?? 0) * (item.weight ?? 0),
    0,
  );
  return weighted / totalWeight;
}

export type GradeComponentSummary = {
  component: GradeComponent;
  assessments: Assessment[];
  gradedAssessments: Assessment[];
  average: number | null;
  contribution: number | null;
  evaluatedWeight: number;
  hasMissingWeights: boolean;
};

export function summarizeGradeComponent(component: GradeComponent, assessments: Assessment[]): GradeComponentSummary {
  const componentAssessments = assessments.filter((assessment) => assessment.grade_component_id === component.id);
  const gradedAssessments = componentAssessments.filter(isAssessmentGraded);
  const weightedItems = gradedAssessments.filter((assessment) => assessment.weight !== null);
  const totalInnerWeight = weightedItems.reduce((sum, assessment) => sum + (assessment.weight ?? 0), 0);
  const hasMissingWeights = component.calculation === "weighted" && gradedAssessments.some((assessment) => assessment.weight === null);
  const scoreSum = gradedAssessments.reduce((sum, assessment) => sum + (assessmentScoreOnTen(assessment) ?? 0), 0);
  const weightedScoreSum = weightedItems.reduce(
    (sum, assessment) => sum + (assessmentScoreOnTen(assessment) ?? 0) * (assessment.weight ?? 0),
    0,
  );
  const average =
    component.calculation === "weighted"
      ? totalInnerWeight ? weightedScoreSum / totalInnerWeight : null
      : gradedAssessments.length ? scoreSum / gradedAssessments.length : null;
  const evaluatedWeight =
    component.weight === null
      ? 0
      : component.calculation === "weighted"
        ? (component.weight * Math.min(totalInnerWeight, 100)) / 100
        : component.expected_count
          ? (component.weight * Math.min(gradedAssessments.length / component.expected_count, 1))
          : average === null
            ? 0
            : component.weight;
  const contribution =
    average !== null && evaluatedWeight
      ? (average * evaluatedWeight) / 100
      : null;

  return {
    component,
    assessments: componentAssessments,
    gradedAssessments,
    average,
    contribution,
    evaluatedWeight,
    hasMissingWeights,
  };
}

export function summarizeGradeComponents(components: GradeComponent[], assessments: Assessment[]) {
  return components.map((component) => summarizeGradeComponent(component, assessments));
}

export function calculateGradeContribution(components: GradeComponent[], assessments: Assessment[]) {
  const componentContribution = summarizeGradeComponents(components, assessments).reduce(
    (sum, summary) => sum + (summary.contribution ?? 0),
    0,
  );
  const directContribution = assessments
    .filter((assessment) => !assessment.grade_component_id && isAssessmentGraded(assessment) && assessment.weight !== null)
    .reduce((sum, assessment) => sum + ((assessmentScoreOnTen(assessment) ?? 0) * (assessment.weight ?? 0)) / 100, 0);

  return componentContribution + directContribution;
}

export function calculateEvaluatedGradeWeight(components: GradeComponent[], assessments: Assessment[]) {
  const componentWeight = summarizeGradeComponents(components, assessments).reduce(
    (sum, summary) => sum + summary.evaluatedWeight,
    0,
  );
  const directWeight = assessments
    .filter((assessment) => !assessment.grade_component_id && isAssessmentGraded(assessment) && assessment.weight !== null)
    .reduce((sum, assessment) => sum + (assessment.weight ?? 0), 0);

  return componentWeight + directWeight;
}

export function calculateKnownGradeAverage(components: GradeComponent[], assessments: Assessment[]) {
  const totalWeight = calculateEvaluatedGradeWeight(components, assessments);
  if (!totalWeight) return null;

  const contribution = calculateGradeContribution(components, assessments);
  return (contribution / totalWeight) * 100;
}
