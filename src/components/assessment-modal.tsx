"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { toIsoDate } from "@/lib/date";
import { assessmentStatusLabels, assessmentTypeLabels } from "@/lib/labels";
import type { Assessment, AssessmentStatus, AssessmentType } from "@/types/domain";

const types: AssessmentType[] = ["prova", "trabalho", "lista", "projeto", "seminario", "outro"];
const statuses: AssessmentStatus[] = ["futura", "realizada", "corrigida"];

function createBlankAssessment(subjectId: string): Assessment {
  return {
    id: crypto.randomUUID(),
    subject_id: subjectId,
    name: "",
    type: "prova",
    date: toIsoDate(new Date()),
    weight: null,
    max_score: 10,
    score: null,
    description: "",
    status: "futura",
    created_at: new Date().toISOString(),
  };
}

export function AssessmentModal({
  open,
  onClose,
  assessment,
  subjectId,
}: {
  open: boolean;
  onClose: () => void;
  assessment?: Assessment | null;
  subjectId?: string;
}) {
  const { subjects, topics, assessmentTopics, upsertAssessment } = useAppData();
  const fallbackSubjectId = subjectId ?? subjects[0]?.id ?? "";
  const [form, setForm] = useState<Assessment>(createBlankAssessment(fallbackSubjectId));
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (assessment) {
        setForm(assessment);
        setSelectedTopics(
          assessmentTopics
            .filter((item) => item.assessment_id === assessment.id)
            .map((item) => item.topic_id),
        );
        return;
      }
      setForm(createBlankAssessment(fallbackSubjectId));
      setSelectedTopics([]);
    });
  }, [assessment, assessmentTopics, fallbackSubjectId, open]);

  const availableTopics = useMemo(
    () => topics.filter((topic) => topic.subject_id === form.subject_id).sort((a, b) => a.order_index - b.order_index),
    [form.subject_id, topics],
  );

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await upsertAssessment(form, selectedTopics);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <form className="modal form-stack" onSubmit={submit}>
        <div className="modal-header">
          <h2>{assessment ? "Editar avaliação" : "Nova avaliação"}</h2>
          <button className="icon-button" onClick={onClose} type="button">x</button>
        </div>
        <label>Matéria<select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</select></label>
        <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <div className="form-grid">
          <label>Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AssessmentType })}>{types.map((type) => <option key={type} value={type}>{assessmentTypeLabels[type]}</option>)}</select></label>
          <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AssessmentStatus })}>{statuses.map((status) => <option key={status} value={status}>{assessmentStatusLabels[status]}</option>)}</select></label>
        </div>
        <div className="form-grid">
          <label>Data<input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value || null })} /></label>
          <label>Peso (%)<input type="number" step="0.01" value={form.weight ?? ""} onChange={(e) => setForm({ ...form, weight: e.target.value ? Number(e.target.value) : null })} /></label>
        </div>
        <div className="form-grid">
          <label>Nota máxima<input type="number" step="0.01" value={form.max_score ?? ""} onChange={(e) => setForm({ ...form, max_score: e.target.value ? Number(e.target.value) : null })} /></label>
          <label>Nota obtida<input type="number" step="0.01" value={form.score ?? ""} onChange={(e) => setForm({ ...form, score: e.target.value ? Number(e.target.value) : null })} placeholder="Opcional" /></label>
        </div>
        <label>Descrição<textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <fieldset className="topic-picker">
          <legend>Conteúdo cobrado</legend>
          {availableTopics.length ? availableTopics.map((topic) => (
            <label className="checkbox-row" key={topic.id}>
              <input
                checked={selectedTopics.includes(topic.id)}
                onChange={(e) => {
                  setSelectedTopics((current) =>
                    e.target.checked ? [...current, topic.id] : current.filter((id) => id !== topic.id),
                  );
                }}
                type="checkbox"
              />
              <span>{topic.title}</span>
            </label>
          )) : <p className="muted">Cadastre tópicos nesta matéria para vincular conteúdo.</p>}
        </fieldset>
        <button className="primary-button full" disabled={!subjects.length} type="submit">Salvar avaliação</button>
      </form>
    </div>
  );
}
