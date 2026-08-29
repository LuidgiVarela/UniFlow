"use client";

import { PageHeader, Panel } from "@/components/ui";
import { DemandDescriptionPreview } from "@/components/demand-description-preview";
import { useAppData } from "@/components/data-provider";
import { formatDate, toIsoDate, weekDays } from "@/lib/date";
import { demandTypeLabels } from "@/lib/labels";

export default function WeekPage() {
  const { subjects, demands } = useAppData();
  const days = weekDays();
  const open = demands.filter((demand) => demand.status !== "concluido");
  const weekDemandCount = open.filter((demand) => demand.due_date && days.some((day) => toIsoDate(day) === demand.due_date)).length;
  const exams = open.filter((demand) => demand.type === "prova").length;

  return (
    <>
      <PageHeader eyebrow="Semana" title="Semana" />
      <Panel>
        <div className="week-summary">
          <span>{weekDemandCount} prazos</span>
          <span>{exams} provas</span>
        </div>
      </Panel>
      <section className="week-grid">
        {days.map((day) => {
          const iso = toIsoDate(day);
          const items = open.filter((demand) => demand.due_date === iso);
          return (
            <Panel key={iso}>
              <h2>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(day).replace(".", "")}</h2>
              <p className="muted">{formatDate(iso)}</p>
              <div className="stack">
                {items.map((demand) => {
                  const subject = subjects.find((item) => item.id === demand.subject_id);
                  return (
                    <article className="compact-item" key={demand.id}>
                      <strong style={{ color: subject?.color }}>{subject?.code}</strong>
                      <span>{demand.title}</span>
                      <small>{demandTypeLabels[demand.type]}</small>
                      <DemandDescriptionPreview description={demand.description} />
                    </article>
                  );
                })}
                {!items.length ? <p className="muted">Sem entregas.</p> : null}
              </div>
            </Panel>
          );
        })}
      </section>
    </>
  );
}
