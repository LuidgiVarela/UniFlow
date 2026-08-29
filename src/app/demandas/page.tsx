"use client";

import { useMemo, useState } from "react";
import { Check, Edit, Trash2 } from "lucide-react";
import { DemandDescriptionPreview } from "@/components/demand-description-preview";
import { DemandModal } from "@/components/demand-modal";
import { useAppData } from "@/components/data-provider";
import { PageHeader, Panel, StatusPill } from "@/components/ui";
import { formatDate } from "@/lib/date";
import { demandStatusLabels, demandTypeLabels, priorityLabels } from "@/lib/labels";
import { sortDemandsByPriorityAndDate } from "@/lib/priority";
import type { Demand, DemandStatus, DemandType } from "@/types/domain";

export default function DemandsPage() {
  const { subjects, demands, completeDemand, removeDemand } = useAppData();
  const [editing, setEditing] = useState<Demand | null>(null);
  const [subjectFilter, setSubjectFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<DemandStatus | "todos">("todos");
  const [typeFilter, setTypeFilter] = useState<DemandType | "todos">("todos");

  const filtered = useMemo(
    () =>
      sortDemandsByPriorityAndDate(demands).filter((demand) => {
        return (
          (subjectFilter === "todos" || demand.subject_id === subjectFilter) &&
          (statusFilter === "todos" || demand.status === statusFilter) &&
          (typeFilter === "todos" || demand.type === typeFilter)
        );
      }),
    [demands, statusFilter, subjectFilter, typeFilter],
  );

  return (
    <>
      <PageHeader eyebrow="Tarefas" title="Tarefas" />
      <Panel>
        <div className="filters">
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <option value="todos">Todas as matérias</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.code}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DemandStatus | "todos")}>
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluido">Concluído</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as DemandType | "todos")}>
            <option value="todos">Todos os tipos</option>
            {Object.entries(demandTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="table-list">
          {filtered.map((demand) => {
            const subject = subjects.find((item) => item.id === demand.subject_id);
            return (
              <article className="demand-row" key={demand.id}>
                <span className="subject-chip" style={{ borderColor: subject?.color }}>{subject?.code}</span>
                <div className="demand-main">
                  <strong>{demand.title}</strong>
                  <div className="demand-meta">
                    <span>{demandTypeLabels[demand.type]}</span>
                    {demand.due_date ? <span>{formatDate(demand.due_date)}</span> : null}
                    <span>{demandStatusLabels[demand.status]}</span>
                  </div>
                  <DemandDescriptionPreview description={demand.description} />
                </div>
                <StatusPill tone={demand.priority}>{priorityLabels[demand.priority]}</StatusPill>
                <div className="row-actions">
                  <button className="icon-button" onClick={() => completeDemand(demand)} title="Concluir" type="button"><Check size={16} /></button>
                  <button className="icon-button" onClick={() => setEditing(demand)} title="Editar" type="button"><Edit size={16} /></button>
                  <button className="icon-button danger" onClick={() => removeDemand(demand.id)} title="Excluir" type="button"><Trash2 size={16} /></button>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
      <DemandModal open={Boolean(editing)} demand={editing} onClose={() => setEditing(null)} />
    </>
  );
}
