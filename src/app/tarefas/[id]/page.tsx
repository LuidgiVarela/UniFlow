"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DemandDashboard } from "@/components/demand-dashboard";
import { useAppData } from "@/components/data-provider";
import { Panel } from "@/components/ui";

export default function TaskDashboardPage() {
  const params = useParams<{ id: string }>();
  const { demands, subjects } = useAppData();
  const demand = demands.find((item) => item.id === params.id);
  const subject = demand ? subjects.find((item) => item.id === demand.subject_id) : null;

  if (!demand) {
    return (
      <Panel className="plain-section">
        <h1>Tarefa nao encontrada</h1>
        <Link className="ghost-action" href="/"><ArrowLeft size={16} />Voltar</Link>
      </Panel>
    );
  }

  return (
    <>
      <header className="subject-page-header">
        <div>
          {subject ? <p className="subject-kicker" style={{ color: subject.color }}>{subject.code}</p> : null}
          <h1>{demand.title}</h1>
        </div>
        <Link className="ghost-action" href={subject ? `/materias/${subject.id}` : "/"}>
          <ArrowLeft size={16} />Voltar
        </Link>
      </header>
      <DemandDashboard demand={demand} />
    </>
  );
}
