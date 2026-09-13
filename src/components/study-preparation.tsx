"use client";

import {
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  ListTodo,
  Pencil,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { useAppData } from "@/components/data-provider";
import { assessmentDaysText } from "@/lib/academic";
import { daysUntil, formatDate } from "@/lib/date";
import { isAssessmentUpcoming } from "@/lib/grades";
import { assessmentTypeLabels, demandTypeLabels, topicStatusLabels } from "@/lib/labels";
import type {
  Assessment,
  AssessmentTopic,
  Demand,
  Material,
  Subject,
  Topic,
  TopicMasteryLevel,
} from "@/types/domain";

const masteryOptions: Array<{ level: TopicMasteryLevel; label: string; reviewDays: number | null }> = [
  { level: 0, label: "Pendente", reviewDays: null },
  { level: 1, label: "Frágil", reviewDays: 1 },
  { level: 2, label: "Revisando", reviewDays: 3 },
  { level: 3, label: "Seguro", reviewDays: 7 },
];

const masteryActions: Record<TopicMasteryLevel, string> = {
  0: "Primeiro contato",
  1: "Reforçar a base",
  2: "Revisão ativa",
  3: "Revisão rápida",
};

type StudyPlanItem = {
  topic: Topic;
  date: string;
  dateLabel: string;
  action: string;
};

type StudyPreparationProps = {
  subject: Subject;
  assessments: Assessment[];
  assessmentTopics: AssessmentTopic[];
  topics: Topic[];
  demands: Demand[];
  materials: Material[];
  onEditAssessment: (assessment: Assessment) => void;
};

function masteryLevel(topic: Topic): TopicMasteryLevel {
  if (topic.mastery_level === 0 || topic.mastery_level === 1 || topic.mastery_level === 2 || topic.mastery_level === 3) {
    return topic.mastery_level;
  }
  if (topic.status === "concluido") return 2;
  if (topic.status === "estudando") return 1;
  return 0;
}

function isoDateFromToday(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function planDateLabel(date: string) {
  const days = daysUntil(date);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return formatDate(date);
}

function nextReviewText(topic: Topic) {
  if (topic.mastery_level === null || topic.mastery_level === undefined) return "Estimado pelo andamento";
  if (topic.mastery_level === 0 || !topic.next_review_date) return "Domínio não avaliado";
  const days = daysUntil(topic.next_review_date);
  if (days <= 0) return "Revisar hoje";
  if (days === 1) return "Revisar amanhã";
  return `Revisar em ${formatDate(topic.next_review_date)}`;
}

function buildStudyPlan(topics: Topic[], assessmentDate: string | null): StudyPlanItem[] {
  const ordered = [...topics].sort((a, b) => {
    const aDue = a.next_review_date && daysUntil(a.next_review_date) <= 0 ? 0 : 1;
    const bDue = b.next_review_date && daysUntil(b.next_review_date) <= 0 ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    const masteryDifference = masteryLevel(a) - masteryLevel(b);
    if (masteryDifference !== 0) return masteryDifference;
    return a.order_index - b.order_index;
  });
  const visible = ordered.slice(0, 6);
  const availableDays = assessmentDate ? Math.max(0, daysUntil(assessmentDate) - 1) : Math.max(0, visible.length - 1);

  return visible.map((topic, index) => {
    const distributedOffset = visible.length <= 1
      ? 0
      : Math.round((index * availableDays) / (visible.length - 1));
    const reviewOffset = topic.next_review_date ? Math.max(0, daysUntil(topic.next_review_date)) : distributedOffset;
    const offset = Math.min(availableDays, distributedOffset, reviewOffset);
    const date = isoDateFromToday(offset);
    return {
      topic,
      date,
      dateLabel: planDateLabel(date),
      action: masteryActions[masteryLevel(topic)],
    };
  });
}

export function StudyPreparation({
  subject,
  assessments,
  assessmentTopics,
  topics,
  demands,
  materials,
  onEditAssessment,
}: StudyPreparationProps) {
  const { upsertTopic } = useAppData();
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [savingTopicIds, setSavingTopicIds] = useState<Set<string>>(() => new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const upcomingAssessments = useMemo(
    () => assessments
      .filter(isAssessmentUpcoming)
      .sort((a, b) => new Date(`${a.date ?? "2999-12-31"}T12:00:00`).getTime() - new Date(`${b.date ?? "2999-12-31"}T12:00:00`).getTime()),
    [assessments],
  );
  const selectedAssessment = upcomingAssessments.find((assessment) => assessment.id === selectedAssessmentId)
    ?? upcomingAssessments[0]
    ?? null;

  if (!selectedAssessment) {
    return (
      <div className="preparation-empty-state">
        <Target size={24} />
        <div>
          <strong>Nenhuma avaliação futura</strong>
          <p className="muted compact-note">A preparação aparecerá quando houver uma avaliação futura nesta matéria.</p>
        </div>
        <Link className="ghost-action" href={`/materias/${encodeURIComponent(subject.id)}?aba=avaliacoes`}>
          Ir para avaliações<ChevronRight size={16} />
        </Link>
      </div>
    );
  }

  const linkedTopicIds = new Set(
    assessmentTopics
      .filter((item) => item.assessment_id === selectedAssessment.id)
      .map((item) => item.topic_id),
  );
  const usingAllTopics = linkedTopicIds.size === 0;
  const preparationTopics = (usingAllTopics ? [...topics] : topics.filter((topic) => linkedTopicIds.has(topic.id)))
    .sort((a, b) => a.order_index - b.order_index);
  const levels = preparationTopics.map(masteryLevel);
  const readiness = levels.length
    ? Math.round((levels.reduce<number>((total, level) => total + level, 0) / (levels.length * 3)) * 100)
    : 0;
  const reviewedCount = levels.filter((level) => level >= 2).length;
  const pendingDemands = demands.filter((demand) => demand.status !== "concluido");
  const recentMaterials = materials
    .filter((material) => material.type === "file" || Boolean(material.url))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);
  const studyPlan = buildStudyPlan(preparationTopics, selectedAssessment.date);
  const nextAction = studyPlan[0] ?? null;
  const remainingPlanItems = Math.max(0, preparationTopics.length - studyPlan.length);

  async function updateMastery(topic: Topic, level: TopicMasteryLevel) {
    const reviewDays = masteryOptions.find((option) => option.level === level)?.reviewDays ?? null;
    setSaveError(null);
    setSavingTopicIds((current) => new Set(current).add(topic.id));
    try {
      await upsertTopic({
        ...topic,
        mastery_level: level,
        last_reviewed_at: level === 0 ? null : new Date().toISOString(),
        next_review_date: reviewDays === null ? null : isoDateFromToday(reviewDays),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível atualizar o domínio deste conteúdo.");
    } finally {
      setSavingTopicIds((current) => {
        const next = new Set(current);
        next.delete(topic.id);
        return next;
      });
    }
  }

  return (
    <div
      className="preparation-manager"
      style={{ "--preparation-color": subject.color } as CSSProperties}
    >
      <header className="preparation-toolbar">
        <div>
          <h2>Preparação</h2>
          <span className="preparation-assessment-type">{assessmentTypeLabels[selectedAssessment.type]}</span>
        </div>
        <label className="preparation-assessment-picker">
          <span>Avaliação</span>
          <select
            onChange={(event) => setSelectedAssessmentId(event.target.value)}
            value={selectedAssessment.id}
          >
            {upcomingAssessments.map((assessment) => (
              <option key={assessment.id} value={assessment.id}>
                {assessment.name}{assessment.date ? ` · ${formatDate(assessment.date)}` : " · sem data"}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="preparation-summary" aria-label={`Preparação para ${selectedAssessment.name}`}>
        <div className="preparation-assessment-title">
          <span>Próxima avaliação</span>
          <strong>{selectedAssessment.name}</strong>
          <small>{formatDate(selectedAssessment.date)} · {assessmentDaysText(selectedAssessment)}</small>
        </div>
        <div className="preparation-readiness">
          <div>
            <span>Prontidão estimada</span>
            <strong>{preparationTopics.length ? `${readiness}%` : "--"}</strong>
          </div>
          <div
            aria-label={`${readiness}% de prontidão`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={readiness}
            className="preparation-progress-track"
            role="progressbar"
          >
            <span style={{ width: `${readiness}%` }} />
          </div>
          <small>Baseada no domínio dos conteúdos selecionados</small>
        </div>
        <dl className="preparation-metrics">
          <div>
            <dt>Conteúdos revisados</dt>
            <dd>{reviewedCount} de {preparationTopics.length}</dd>
          </div>
          <div>
            <dt>Tarefas pendentes</dt>
            <dd>{pendingDemands.length}</dd>
          </div>
        </dl>
      </section>

      {nextAction ? (
        <section className="preparation-next-action">
          <Target size={20} />
          <div>
            <span>Próxima ação</span>
            <strong>{nextAction.topic.title}</strong>
            <small>{nextAction.action} · {nextAction.dateLabel}</small>
          </div>
          <a className="ghost-action" href={`#preparation-topic-${nextAction.topic.id}`}>
            Ver conteúdo<ChevronRight size={16} />
          </a>
        </section>
      ) : null}

      {usingAllTopics && preparationTopics.length ? (
        <div className="preparation-scope-notice">
          <CircleAlert size={17} />
          <span>Nenhum conteúdo foi vinculado a esta avaliação. O plano está considerando toda a matéria.</span>
          <button className="ghost-action" onClick={() => onEditAssessment(selectedAssessment)} type="button">
            <Pencil size={15} />Vincular conteúdos
          </button>
        </div>
      ) : null}

      {saveError ? <p className="form-message error-message" role="alert">{saveError}</p> : null}

      <div className="preparation-workspace">
        <section className="preparation-topic-section">
          <header className="preparation-section-header">
            <div>
              <BookOpenCheck size={18} />
              <h3>Conteúdo da avaliação</h3>
            </div>
            <span>{preparationTopics.length} {preparationTopics.length === 1 ? "tópico" : "tópicos"}</span>
          </header>

          {preparationTopics.length ? (
            <div className="preparation-topic-list">
              {preparationTopics.map((topic) => {
                const level = masteryLevel(topic);
                const saving = savingTopicIds.has(topic.id);
                return (
                  <article
                    aria-busy={saving}
                    className="preparation-topic-row"
                    id={`preparation-topic-${topic.id}`}
                    key={topic.id}
                  >
                    <div className="preparation-topic-copy">
                      <strong>{topic.title}</strong>
                      <small>{topic.notes || topicStatusLabels[topic.status]}</small>
                    </div>
                    <div aria-label={`Domínio de ${topic.title}`} className="mastery-segmented-control" role="group">
                      {masteryOptions.map((option) => (
                        <button
                          aria-label={`Marcar ${topic.title} como ${option.label}`}
                          aria-pressed={level === option.level}
                          className={level === option.level ? "active" : ""}
                          data-level={option.level}
                          disabled={saving}
                          key={option.level}
                          onClick={() => void updateMastery(topic, option.level)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <span className="preparation-review-date">
                      <CalendarDays size={15} />
                      {saving ? "Salvando..." : nextReviewText(topic)}
                    </span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="preparation-inline-empty">
              <strong>Nenhum conteúdo cadastrado</strong>
              <Link href={`/materias/${encodeURIComponent(subject.id)}?aba=conteudo`}>
                Adicionar conteúdo<ChevronRight size={15} />
              </Link>
            </div>
          )}
        </section>

        <aside className="preparation-side-column">
          <section className="preparation-plan-section">
            <header className="preparation-section-header">
              <div>
                <CalendarDays size={18} />
                <h3>Plano sugerido</h3>
              </div>
            </header>
            {studyPlan.length ? (
              <ol className="preparation-plan-list">
                {studyPlan.map((item) => (
                  <li key={item.topic.id}>
                    <time dateTime={item.date}>{item.dateLabel}</time>
                    <div>
                      <strong>{item.topic.title}</strong>
                      <small>{item.action}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="muted compact-note">Adicione conteúdos para montar o plano.</p>}
            {remainingPlanItems ? (
              <small className="preparation-plan-more">
                Mais {remainingPlanItems} {remainingPlanItems === 1 ? "tópico" : "tópicos"} depois desta sequência
              </small>
            ) : null}
          </section>

          <section className="preparation-support-section">
            <header className="preparation-section-header">
              <div>
                <ListTodo size={18} />
                <h3>Apoio para o estudo</h3>
              </div>
            </header>

            <div className="preparation-support-group">
              <strong>Tarefas pendentes</strong>
              {pendingDemands.slice(0, 3).map((demand) => (
                <Link href={`/materias/${encodeURIComponent(subject.id)}?aba=tarefas`} key={demand.id}>
                  <span>{demand.title}</span>
                  <small>{demand.due_date ? formatDate(demand.due_date) : demandTypeLabels[demand.type]}</small>
                  <ChevronRight size={15} />
                </Link>
              ))}
              {!pendingDemands.length ? <small className="muted">Nenhuma tarefa pendente.</small> : null}
            </div>

            <div className="preparation-support-group">
              <strong>Materiais recentes</strong>
              {recentMaterials.map((material) => (
                <a
                  href={material.type === "link" ? material.url! : `/materiais/abrir/${material.id}`}
                  key={material.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <FileText size={15} />
                  <span>{material.name}</span>
                  <ExternalLink size={14} />
                </a>
              ))}
              {!recentMaterials.length ? <small className="muted">Nenhum material cadastrado.</small> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
