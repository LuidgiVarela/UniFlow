import type { Assessment, GradeComponent } from "@/types/domain";

export function assessmentWeightText(assessment: Assessment) {
  return assessment.weight === null ? null : `Peso ${assessment.weight}%`;
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
};

export function summarizeGradeComponent(component: GradeComponent, assessments: Assessment[]): GradeComponentSummary {
  const componentAssessments = assessments.filter((assessment) => assessment.grade_component_id === component.id);
  const gradedAssessments = componentAssessments.filter(isAssessmentGraded);
  const scoreSum = gradedAssessments.reduce((sum, assessment) => sum + (assessmentScoreOnTen(assessment) ?? 0), 0);
  const average = gradedAssessments.length ? scoreSum / gradedAssessments.length : null;
  const contribution = average !== null && component.weight !== null ? (average * component.weight) / 100 : null;

  return {
    component,
    assessments: componentAssessments,
    gradedAssessments,
    average,
    contribution,
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

export function calculateKnownGradeAverage(components: GradeComponent[], assessments: Assessment[]) {
  const summaries = summarizeGradeComponents(components, assessments);
  const componentWeight = summaries.reduce(
    (sum, summary) => sum + (summary.average !== null ? summary.component.weight ?? 0 : 0),
    0,
  );
  const directItems = assessments.filter(
    (assessment) => !assessment.grade_component_id && isAssessmentGraded(assessment) && assessment.weight !== null,
  );
  const directWeight = directItems.reduce((sum, assessment) => sum + (assessment.weight ?? 0), 0);
  const totalWeight = componentWeight + directWeight;
  if (!totalWeight) return null;

  const contribution = calculateGradeContribution(components, assessments);
  return (contribution / totalWeight) * 100;
}
