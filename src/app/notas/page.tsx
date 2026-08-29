"use client";

import { Edit, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AssessmentModal } from "@/components/assessment-modal";
import { useAppData } from "@/components/data-provider";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/ui";
import { assessmentDaysText } from "@/lib/academic";
import { formatDate } from "@/lib/date";
import { assessmentWeightText, calculateKnownGradeAverage, calculateWeightedAverage, isAssessmentUpcoming } from "@/lib/grades";
import { assessmentStatusLabels, assessmentTypeLabels } from "@/lib/labels";
import type { Assessment } from "@/types/domain";

export default function NotesPage() {
  const { subjects, gradeComponents, assessments, removeAssessment } = useAppData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Assessment | null>(null);

  const upcoming = assessments
    .filter(isAssessmentUpcoming)
    .sort((a, b) => new Date(`${a.date ?? "2999-12-31"}T12:00:00`).getTime() - new Date(`${b.date ?? "2999-12-31"}T12:00:00`).getTime());
  const results = assessments
    .filter((assessment) => !isAssessmentUpcoming(assessment))
    .sort((a, b) => new Date(`${b.date ?? "1900-01-01"}T12:00:00`).getTime() - new Date(`${a.date ?? "1900-01-01"}T12:00:00`).getTime());

  const averages = useMemo(
    () =>
      subjects.map((subject) => {
        const items = assessments.filter((assessment) => assessment.subject_id === subject.id);
        const components = gradeComponents.filter((component) => component.subject_id === subject.id);
        const average = components.length ? calculateKnownGradeAverage(components, items) : calculateWeightedAverage(items);
        return { subject, average };
      }),
    [assessments, gradeComponents, subjects],
  );

  function subjectFor(id: string) {
    return subjects.find((subject) => subject.id === id);
  }

  function assessmentLine(assessment: Assessment, result = false) {
    const subject = subjectFor(assessment.subject_id);
    const gradeComponent = gradeComponents.find((component) => component.id === assessment.grade_component_id) ?? null;
    return (
      <article className="assessment-row" key={assessment.id}>
        <span className="subject-chip" style={{ borderColor: subject?.color }}>{subject?.code}</span>
        <div className="demand-main">
          <strong>{assessment.name}</strong>
          <div className="demand-meta">
            <span>{assessmentTypeLabels[assessment.type]}</span>
            <span>{formatDate(assessment.date)}</span>
            {assessmentWeightText(assessment, gradeComponent) ? <span>{assessmentWeightText(assessment, gradeComponent)}</span> : null}
            <span>{result ? `Nota ${assessment.score ?? "-"} / ${assessment.max_score ?? "-"}` : assessmentDaysText(assessment)}</span>
          </div>
        </div>
        <StatusPill tone={assessment.status}>{assessmentStatusLabels[assessment.status]}</StatusPill>
        <div className="row-actions">
          <button className="icon-button" onClick={() => setEditing(assessment)} type="button"><Edit size={15} /></button>
          <button className="icon-button danger" onClick={() => removeAssessment(assessment.id)} type="button"><Trash2 size={15} /></button>
        </div>
      </article>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Notas"
        title="Avaliações e resultados"
        action={<button className="primary-button" onClick={() => setModalOpen(true)} type="button"><Plus size={17} />Nova avaliação</button>}
      />

      <section className="dashboard-grid">
        <Panel>
          <h2>Próximas avaliações</h2>
          <div className="table-list">
            {upcoming.length ? upcoming.map((assessment) => assessmentLine(assessment)) : <EmptyState text="Nenhuma avaliação futura." />}
          </div>
        </Panel>

        <Panel>
          <h2>Médias</h2>
          <div className="stack">
            {averages.map(({ subject, average }) => (
              <article className="compact-item metric-row" key={subject.id}>
                <strong style={{ color: subject.color }}>{subject.code}</strong>
                <span>{subject.name}</span>
                <strong>{average === null ? "Sem cálculo definido" : average.toFixed(2)}</strong>
              </article>
            ))}
          </div>
        </Panel>
      </section>

      <Panel>
        <h2>Resultados</h2>
        <div className="table-list">
          {results.length ? results.map((assessment) => assessmentLine(assessment, true)) : <EmptyState text="Nenhum resultado registrado ainda." />}
        </div>
      </Panel>

      <AssessmentModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <AssessmentModal open={Boolean(editing)} assessment={editing} onClose={() => setEditing(null)} />
    </>
  );
}
