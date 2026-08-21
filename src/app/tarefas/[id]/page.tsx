"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CloseTaskPageButton } from "@/components/close-task-page-button";
import { DemandDashboard } from "@/components/demand-dashboard";
import { useAppData } from "@/components/data-provider";
import { Panel, StatusPill } from "@/components/ui";
import { formatDate } from "@/lib/date";
import { supportsQuestionDashboard } from "@/lib/demands";
import { demandStatusLabels, demandTypeLabels, priorityLabels } from "@/lib/labels";

export default function TaskDashboardPage() {
  const params = useParams<{ id: string }>();
  const { demands, loading, subjects } = useAppData();
  const demand = demands.find((item) => item.id === params.id);
  const subject = demand ? subjects.find((item) => item.id === demand.subject_id) : null;

  if (loading) {
    return (
      <Panel className="plain-section loading-panel">
        <p className="eyebrow">UniFlow</p>
        <h1>Carregando tarefa...</h1>
      </Panel>
    );
  }

  if (!demand) {
    return (
      <Panel className="plain-section">
        <h1>Tarefa não encontrada</h1>
        <Link className="ghost-action" href="/"><ArrowLeft size={16} />Voltar</Link>
      </Panel>
    );
  }

  const fallbackHref = subject ? `/materias/${subject.id}` : "/";

  return (
    <>
      <header className="subject-page-header">
        <div>
          {subject ? <p className="subject-kicker" style={{ color: subject.color }}>{subject.code}</p> : null}
          <h1>{demand.title}</h1>
        </div>
        <CloseTaskPageButton fallbackHref={fallbackHref} />
      </header>
      {supportsQuestionDashboard(demand.type) ? (
        <DemandDashboard demand={demand} />
      ) : (
        <Panel className="plain-section task-detail-panel">
          <div className="section-tools">
            <h2>Detalhes da tarefa</h2>
            <StatusPill tone={demand.priority}>{priorityLabels[demand.priority]}</StatusPill>
          </div>
          <div className="task-detail-grid">
            <div>
              <span>Tipo</span>
              <strong>{demandTypeLabels[demand.type]}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{demandStatusLabels[demand.status]}</strong>
            </div>
            <div>
              <span>Prazo</span>
              <strong>{demand.due_date ? formatDate(demand.due_date) : "Sem prazo"}</strong>
            </div>
          </div>
          {demand.description ? (
            <div className="task-description-block">
              <span>Descrição</span>
              <p>{demand.description}</p>
            </div>
          ) : null}
        </Panel>
      )}
    </>
  );
}
