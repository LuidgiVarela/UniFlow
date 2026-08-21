"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { demandStatusLabels, demandTypeLabels, priorityLabels } from "@/lib/labels";
import type { Demand, DemandPriority, DemandStatus, DemandType } from "@/types/domain";

const types: DemandType[] = ["prova", "trabalho", "lista", "exercicio", "leitura", "apresentacao", "outro"];
const priorities: DemandPriority[] = ["baixa", "media", "alta", "urgente"];
const statuses: DemandStatus[] = ["pendente", "em_andamento", "concluido"];

export function DemandModal({
  open,
  onClose,
  demand,
  subjectId,
}: {
  open: boolean;
  onClose: () => void;
  demand?: Demand | null;
  subjectId?: string;
}) {
  const { subjects, upsertDemand } = useAppData();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Demand>({
    id: crypto.randomUUID(),
    subject_id: "",
    title: "",
    type: "lista",
    due_date: null,
    priority: "media",
    status: "pendente",
    description: "",
    total_items: null,
    completed_items: null,
    created_at: new Date().toISOString(),
  });

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (demand) {
        setForm(demand);
        return;
      }
      setForm({
          id: crypto.randomUUID(),
          subject_id: subjectId ?? subjects[0]?.id ?? "",
          title: "",
          type: "lista",
          due_date: null,
          priority: "media",
          status: "pendente",
          description: "",
          total_items: null,
          completed_items: null,
          created_at: new Date().toISOString(),
        });
    });
  }, [demand, open, subjectId, subjects]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    await upsertDemand(form);
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <form className="modal form-stack" onSubmit={submit}>
        <div className="modal-header">
          <h2>{demand ? "Editar tarefa" : "Nova tarefa"}</h2>
          <button className="icon-button" onClick={onClose} type="button">x</button>
        </div>
        <label>Título<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>Matéria<select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} required>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</select></label>
        <div className="form-grid">
          <label>Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DemandType })}>{types.map((type) => <option key={type} value={type}>{demandTypeLabels[type]}</option>)}</select></label>
          <label>
            Prazo
            <div className="date-field">
              <input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value || null })} />
              {form.due_date ? <button className="ghost-action tiny" onClick={() => setForm({ ...form, due_date: null })} type="button">Limpar</button> : null}
            </div>
          </label>
        </div>
        <div className="form-grid">
          <label>Prioridade<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as DemandPriority })}>{priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}</select></label>
          <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DemandStatus })}>{statuses.map((status) => <option key={status} value={status}>{demandStatusLabels[status]}</option>)}</select></label>
        </div>
        <label>Descrição<textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        {error ? <p className="form-message">{error}</p> : null}
        <button className="primary-button full" disabled={!subjects.length} type="submit">Salvar tarefa</button>
      </form>
    </div>
  );
}
