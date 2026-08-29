"use client";

import { Edit, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import {
  assessmentWeightText,
  calculateGradeContribution,
  calculateKnownGradeAverage,
  calculateWeightedAverage,
  isAssessmentGraded,
  summarizeGradeComponents,
} from "@/lib/grades";
import { formatDate } from "@/lib/date";
import type { Assessment, GradeComponent, GradeComponentCalculation } from "@/types/domain";

const calculationLabels: Record<GradeComponentCalculation, string> = {
  average: "Média simples",
  weighted: "Peso individual",
};

function createBlankComponent(subjectId: string): GradeComponent {
  return {
    id: crypto.randomUUID(),
    subject_id: subjectId,
    name: "",
    weight: null,
    expected_count: null,
    calculation: "average",
    created_at: new Date().toISOString(),
  };
}

function scoreText(assessment: Assessment) {
  return `${assessment.score ?? "-"} / ${assessment.max_score ?? "-"}`;
}

export function GradeCriteriaManager({
  assessments,
  subjectId,
}: {
  assessments: Assessment[];
  subjectId: string;
}) {
  const { gradeComponents, removeGradeComponent, upsertGradeComponent } = useAppData();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<GradeComponent>(createBlankComponent(subjectId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectComponents = useMemo(
    () =>
      gradeComponents
        .filter((component) => component.subject_id === subjectId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [gradeComponents, subjectId],
  );
  const summaries = useMemo(
    () => summarizeGradeComponents(subjectComponents, assessments),
    [assessments, subjectComponents],
  );
  const gradedAssessments = assessments.filter(isAssessmentGraded);
  const uncategorized = gradedAssessments.filter((assessment) => !assessment.grade_component_id);
  const directAverage = calculateWeightedAverage(uncategorized);
  const knownAverage = calculateKnownGradeAverage(subjectComponents, assessments);
  const contribution = calculateGradeContribution(subjectComponents, assessments);

  function openComponentModal(component?: GradeComponent) {
    setForm(component ?? createBlankComponent(subjectId));
    setError(null);
    setSaving(false);
    setModalOpen(true);
  }

  async function saveComponent(event: React.FormEvent) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await upsertGradeComponent({ ...form, name });
      setModalOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar o critério.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteComponent(component: GradeComponent) {
    const ok = window.confirm(
      `Excluir o critério "${component.name}"? As avaliações continuam salvas, apenas deixam de ficar agrupadas nele.`,
    );
    if (!ok) return;
    await removeGradeComponent(component.id);
  }

  return (
    <div className="grade-manager">
      <div className="section-tools">
        <h2>Notas</h2>
        <button className="ghost-action" onClick={() => openComponentModal()} type="button">
          <Plus size={16} />Novo critério
        </button>
      </div>

      <section className="grade-summary-grid">
        <article>
          <span>Média parcial ponderada</span>
          <strong>{knownAverage === null ? "Sem cálculo" : knownAverage.toFixed(1)}</strong>
        </article>
        <article>
          <span>Pontos já garantidos</span>
          <strong>{contribution ? contribution.toFixed(2) : "0.00"}</strong>
        </article>
        <article>
          <span>Notas registradas</span>
          <strong>{gradedAssessments.length}</strong>
        </article>
      </section>

      <div className="grade-component-list">
        {summaries.map((summary) => (
          <section className="grade-component-card" key={summary.component.id}>
            <div className="grade-component-header">
              <div>
                <strong>{summary.component.name}</strong>
                <small>
                  {summary.component.weight === null ? "Peso não definido" : `${summary.component.weight}% da nota`}
                  {summary.component.expected_count ? ` - ${summary.gradedAssessments.length} de ${summary.component.expected_count} lançadas` : ""}
                </small>
                <small>{calculationLabels[summary.component.calculation]}</small>
                {summary.hasMissingWeights ? <small className="warning-text">Há nota sem peso dentro do critério.</small> : null}
              </div>
              <div className="grade-component-score">
                <strong>{summary.average === null ? "--" : summary.average.toFixed(1)}</strong>
                <small>{summary.contribution === null ? "sem contribuição" : `${summary.contribution.toFixed(2)} ponto(s)`}</small>
              </div>
              <div className="row-actions">
                <button className="icon-button" onClick={() => openComponentModal(summary.component)} title="Editar critério" type="button">
                  <Edit size={15} />
                </button>
                <button className="icon-button danger" onClick={() => deleteComponent(summary.component)} title="Excluir critério" type="button">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="grade-mini-list">
              {summary.assessments.length ? (
                summary.assessments.map((assessment) => (
                  <article key={assessment.id}>
                    <span>{assessment.name}</span>
                    <small>{[formatDate(assessment.date), assessmentWeightText(assessment, summary.component)].filter(Boolean).join(" - ")}</small>
                    <strong>{isAssessmentGraded(assessment) ? scoreText(assessment) : "sem nota"}</strong>
                  </article>
                ))
              ) : (
                <p className="muted compact-note">Nenhuma avaliação vinculada ainda.</p>
              )}
            </div>
          </section>
        ))}
      </div>

      {uncategorized.length ? (
        <section className="grade-component-card">
          <div className="grade-component-header">
            <div>
              <strong>Sem critério</strong>
              <small>Avaliações com nota, mas sem grupo configurado</small>
            </div>
            <div className="grade-component-score">
              <strong>{directAverage === null ? "--" : directAverage.toFixed(1)}</strong>
              <small>{directAverage === null ? "sem peso próprio" : "média ponderada"}</small>
            </div>
          </div>
          <div className="grade-mini-list">
            {uncategorized.map((assessment) => (
              <article key={assessment.id}>
                <span>{assessment.name}</span>
                <small>{assessmentWeightText(assessment) ?? "sem peso"}</small>
                <strong>{scoreText(assessment)}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!subjectComponents.length && !gradedAssessments.length ? (
        <p className="muted compact-note">Nenhuma nota ainda. Crie critérios quando o professor explicar a fórmula.</p>
      ) : null}

      {modalOpen ? (
        <div className="modal-backdrop">
          <form className="modal form-stack compact-modal" onSubmit={saveComponent}>
            <div className="modal-header">
              <h2>{form.created_at && subjectComponents.some((item) => item.id === form.id) ? "Editar critério" : "Novo critério"}</h2>
              <button className="icon-button" onClick={() => setModalOpen(false)} type="button">x</button>
            </div>
            <label>Nome<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <div className="form-grid">
              <label>Peso total (%)<input min="0" step="0.01" type="number" value={form.weight ?? ""} onChange={(event) => setForm({ ...form, weight: event.target.value ? Number(event.target.value) : null })} placeholder="Opcional" /></label>
              <label>Quantidade prevista<input min="0" step="1" type="number" value={form.expected_count ?? ""} onChange={(event) => setForm({ ...form, expected_count: event.target.value ? Number(event.target.value) : null })} placeholder="Opcional" /></label>
            </div>
            <label>Como calcular dentro do critério<select value={form.calculation} onChange={(event) => setForm({ ...form, calculation: event.target.value as GradeComponentCalculation })}>
              <option value="average">Média simples</option>
              <option value="weighted">Peso individual</option>
            </select></label>
            <p className="muted compact-note">
              Média simples divide as avaliações igualmente. Peso individual usa o peso de cada avaliação apenas dentro deste critério.
            </p>
            {error ? <p className="form-message error-message">{error}</p> : null}
            <button className={`primary-button full ${saving ? "is-loading" : ""}`} disabled={saving} type="submit">
              {saving ? "Salvando..." : "Salvar critério"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
