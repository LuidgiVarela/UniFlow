"use client";

import Link from "next/link";
import { getDetailedTaskProgress, TaskProgress } from "@/components/task-progress";
import { PageHeader, Panel } from "@/components/ui";
import { useAppData } from "@/components/data-provider";
import { assessmentDaysText } from "@/lib/academic";
import { daysUntil, formatDate, toIsoDate } from "@/lib/date";
import { demandTypeLabels } from "@/lib/labels";
import { sortDemandsByPriorityAndDate } from "@/lib/priority";

export default function Home() {
  const { subjects, demands, demandQuestionItems, demandQuestions, assessments } = useAppData();
  const today = toIsoDate(new Date());
  const openDemands = demands.filter((demand) => demand.status !== "concluido");
  const todayItems = openDemands.filter((demand) => demand.due_date === today);
  const datedDemands = sortDemandsByPriorityAndDate(openDemands.filter((demand) => demand.due_date)).slice(0, 10);
  const undatedDemands = sortDemandsByPriorityAndDate(openDemands.filter((demand) => !demand.due_date));
  const upcomingAssessments = assessments
    .filter((assessment) => assessment.status === "futura" && assessment.date)
    .sort((a, b) => new Date(`${a.date}T12:00:00`).getTime() - new Date(`${b.date}T12:00:00`).getTime());

  function subjectFor(id: string) {
    return subjects.find((subject) => subject.id === id);
  }

  return (
    <>
      <PageHeader title="Visão geral" />

      {todayItems.length ? (
        <Panel className="plain-section">
          <h2>Hoje</h2>
          <div className="quiet-list">
            {todayItems.map((item) => {
              const subject = subjectFor(item.subject_id);
              return (
                <Link className="quiet-row task-summary-row" href={`/materias/${item.subject_id}`} key={item.id}>
                  <span className="subject-code" style={{ color: subject?.color }}>{subject?.code ?? "SEM"}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{demandTypeLabels[item.type]}</small>
                    <TaskProgress demand={item} progress={getDetailedTaskProgress(item, demandQuestions, demandQuestionItems)} />
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Panel className="plain-section">
        <h2>Próximos prazos</h2>
        <div className="timeline-list">
          {datedDemands.map((demand) => {
            const subject = subjectFor(demand.subject_id);
            const days = daysUntil(demand.due_date as string);
            return (
              <Link className="timeline-row task-summary-row" href={`/materias/${demand.subject_id}`} key={demand.id}>
                <time>{formatDate(demand.due_date)}</time>
                <span className="subject-code" style={{ color: subject?.color }}>{subject?.code ?? "SEM"}</span>
                <div>
                  <strong>{demand.title}</strong>
                  <small>{demandTypeLabels[demand.type]}</small>
                  <TaskProgress demand={demand} progress={getDetailedTaskProgress(demand, demandQuestions, demandQuestionItems)} />
                </div>
                <small>{days === 0 ? "hoje" : days < 0 ? `${Math.abs(days)}d atrasado` : `${days}d`}</small>
              </Link>
            );
          })}
        </div>
      </Panel>

      {undatedDemands.length ? (
        <Panel className="plain-section">
          <h2>Pendências sem prazo</h2>
          <div className="quiet-list">
            {undatedDemands.map((demand) => {
              const subject = subjectFor(demand.subject_id);
              return (
                <Link className="quiet-row task-summary-row" href={`/materias/${demand.subject_id}`} key={demand.id}>
                  <span className="subject-code" style={{ color: subject?.color }}>{subject?.code ?? "SEM"}</span>
                  <div>
                    <strong>{demand.title}</strong>
                    <small>{demandTypeLabels[demand.type]}</small>
                    <TaskProgress demand={demand} progress={getDetailedTaskProgress(demand, demandQuestions, demandQuestionItems)} />
                  </div>
                </Link>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Panel className="plain-section">
        <h2>Próximas avaliações</h2>
        <div className="quiet-list">
          {upcomingAssessments.map((assessment) => {
            const subject = subjectFor(assessment.subject_id);
            return (
              <Link className="quiet-row" href={`/materias/${assessment.subject_id}`} key={assessment.id}>
                <span className="subject-code" style={{ color: subject?.color }}>{subject?.code}</span>
                <strong>{assessment.name}</strong>
                <small>{formatDate(assessment.date)}</small>
                <small>{assessmentDaysText(assessment)}</small>
              </Link>
            );
          })}
          {!upcomingAssessments.length ? <p className="muted compact-note">Nenhuma avaliação futura.</p> : null}
        </div>
      </Panel>
    </>
  );
}
