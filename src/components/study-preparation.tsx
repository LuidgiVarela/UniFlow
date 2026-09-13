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
  AssessmentMaterial,
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

type StudyUnit = {
  key: string;
  kind: "topic" | "material";
  title: string;
  subtitle: string;
  orderIndex: number;
  mastery_level?: TopicMasteryLevel | null;
  next_review_date?: string | null;
  topic?: Topic;
  material?: Material;
  assessmentMaterial?: AssessmentMaterial;
};

type StudyPlanItem = {
  unit: StudyUnit;
  date: string;
  dateLabel: string;
  action: string;
};

type StudyPreparationProps = {
  subject: Subject;
  assessments: Assessment[];
  assessmentTopics: AssessmentTopic[];
  assessmentMaterials: AssessmentMaterial[];
  topics: Topic[];
  demands: Demand[];
  materials: Material[];
  onEditAssessment: (assessment: Assessment) => void;
};

function masteryLevel(unit: StudyUnit): TopicMasteryLevel {
  if (unit.mastery_level === 0 || unit.mastery_level === 1 || unit.mastery_level === 2 || unit.mastery_level === 3) {
    return unit.mastery_level;
  }
  if (unit.topic?.status === "concluido") return 2;
  if (unit.topic?.status === "estudando") return 1;
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

function nextReviewText(unit: StudyUnit) {
  if (unit.mastery_level === null || unit.mastery_level === undefined) {
    return unit.kind === "topic" ? "Estimado pelo andamento" : "Domínio não avaliado";
  }
  if (unit.mastery_level === 0 || !unit.next_review_date) return "Domínio não avaliado";
  const days = daysUntil(unit.next_review_date);
  if (days <= 0) return "Revisar hoje";
  if (days === 1) return "Revisar amanhã";
  return `Revisar em ${formatDate(unit.next_review_date)}`;
}

function buildStudyPlan(units: StudyUnit[], assessmentDate: string | null): StudyPlanItem[] {
  const ordered = [...units].sort((a, b) => {
    const aDue = a.next_review_date && daysUntil(a.next_review_date) <= 0 ? 0 : 1;
    const bDue = b.next_review_date && daysUntil(b.next_review_date) <= 0 ? 0 : 1;
    if (aDue !== bDue) return aDue - bDue;
    const masteryDifference = masteryLevel(a) - masteryLevel(b);
    if (masteryDifference !== 0) return masteryDifference;
    return a.orderIndex - b.orderIndex;
  });
  const visible = ordered.slice(0, 6);
  const availableDays = assessmentDate ? Math.max(0, daysUntil(assessmentDate) - 1) : Math.max(0, visible.length - 1);

  return visible.map((unit, index) => {
    const distributedOffset = visible.length <= 1
      ? 0
      : Math.round((index * availableDays) / (visible.length - 1));
    const reviewOffset = unit.next_review_date ? Math.max(0, daysUntil(unit.next_review_date)) : distributedOffset;
    const offset = Math.min(availableDays, distributedOffset, reviewOffset);
    const date = isoDateFromToday(offset);
    return {
      unit,
      date,
      dateLabel: planDateLabel(date),
      action: masteryActions[masteryLevel(unit)],
    };
  });
}

function materialHref(material: Material) {
  return material.type === "link" ? material.url! : `/materiais/abrir/${material.id}`;
}

function materialTypeLabel(material: Material) {
  if (material.type === "link") return "Link de estudo";
  return /\.pdf$/i.test(material.name) ? "PDF" : "Arquivo de estudo";
}

export function StudyPreparation({
  subject,
  assessments,
  assessmentTopics,
  assessmentMaterials,
  topics,
  demands,
  materials,
  onEditAssessment,
}: StudyPreparationProps) {
  const { upsertAssessmentMaterialProgress, upsertTopic } = useAppData();
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [savingUnitIds, setSavingUnitIds] = useState<Set<string>>(() => new Set());
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
  const linkedMaterialRows = assessmentMaterials.filter((item) => item.assessment_id === selectedAssessment.id);
  const linkedMaterialById = new Map(linkedMaterialRows.map((item) => [item.material_id, item]));
  const hasExplicitScope = linkedTopicIds.size > 0 || linkedMaterialRows.length > 0;
  const usingAllTopics = !hasExplicitScope;
  const preparationTopics = (usingAllTopics ? [...topics] : topics.filter((topic) => linkedTopicIds.has(topic.id)))
    .sort((a, b) => a.order_index - b.order_index);
  const preparationMaterials = materials
    .filter((material) => linkedMaterialById.has(material.id) && (material.type === "file" || Boolean(material.url)))
    .sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      || a.name.localeCompare(b.name, "pt-BR"));
  const studyUnits: StudyUnit[] = [
    ...preparationTopics.map((topic) => ({
      key: `topic-${topic.id}`,
      kind: "topic" as const,
      title: topic.title,
      subtitle: topic.notes || topicStatusLabels[topic.status],
      orderIndex: topic.order_index,
      mastery_level: topic.mastery_level,
      next_review_date: topic.next_review_date,
      topic,
    })),
    ...preparationMaterials.map((material, index) => {
      const link = linkedMaterialById.get(material.id)!;
      return {
        key: `material-${material.id}`,
        kind: "material" as const,
        title: material.name,
        subtitle: materialTypeLabel(material),
        orderIndex: 100_000 + (material.sort_order ?? index),
        mastery_level: link.mastery_level,
        next_review_date: link.next_review_date,
        material,
        assessmentMaterial: link,
      };
    }),
  ];
  const levels = studyUnits.map(masteryLevel);
  const readiness = levels.length
    ? Math.round((levels.reduce<number>((total, level) => total + level, 0) / (levels.length * 3)) * 100)
    : 0;
  const reviewedCount = levels.filter((level) => level >= 2).length;
  const pendingDemands = demands.filter((demand) => demand.status !== "concluido");
  const recentMaterials = materials
    .filter((material) => material.type === "file" || Boolean(material.url))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);
  const studyPlan = buildStudyPlan(studyUnits, selectedAssessment.date);
  const nextAction = studyPlan[0] ?? null;
  const remainingPlanItems = Math.max(0, studyUnits.length - studyPlan.length);

  async function updateMastery(unit: StudyUnit, level: TopicMasteryLevel) {
    const reviewDays = masteryOptions.find((option) => option.level === level)?.reviewDays ?? null;
    const progress = {
      mastery_level: level,
      last_reviewed_at: level === 0 ? null : new Date().toISOString(),
      next_review_date: reviewDays === null ? null : isoDateFromToday(reviewDays),
    };
    setSaveError(null);
    setSavingUnitIds((current) => new Set(current).add(unit.key));
    try {
      if (unit.topic) {
        await upsertTopic({ ...unit.topic, ...progress });
      } else if (unit.assessmentMaterial) {
        await upsertAssessmentMaterialProgress({ ...unit.assessmentMaterial, ...progress });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível atualizar o domínio deste item.");
    } finally {
      setSavingUnitIds((current) => {
        const next = new Set(current);
        next.delete(unit.key);
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
            <strong>{studyUnits.length ? `${readiness}%` : "--"}</strong>
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
          <small>Baseada no domínio dos conteúdos e materiais selecionados</small>
        </div>
        <dl className="preparation-metrics">
          <div>
            <dt>Itens revisados</dt>
            <dd>{reviewedCount} de {studyUnits.length}</dd>
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
            <strong>{nextAction.unit.title}</strong>
            <small>{nextAction.action} · {nextAction.dateLabel}</small>
          </div>
          {nextAction.unit.material ? (
            <a className="ghost-action" href={materialHref(nextAction.unit.material)} rel="noreferrer" target="_blank">
              Abrir material<ExternalLink size={15} />
            </a>
          ) : (
            <a className="ghost-action" href={`#preparation-${nextAction.unit.key}`}>
              Ver conteúdo<ChevronRight size={16} />
            </a>
          )}
        </section>
      ) : null}

      {usingAllTopics && preparationTopics.length ? (
        <div className="preparation-scope-notice">
          <CircleAlert size={17} />
          <span>Nenhum conteúdo ou material foi vinculado. O plano está considerando todos os tópicos da matéria.</span>
          <button className="ghost-action" onClick={() => onEditAssessment(selectedAssessment)} type="button">
            <Pencil size={15} />Selecionar itens
          </button>
        </div>
      ) : null}

      {saveError ? <p className="form-message error-message" role="alert">{saveError}</p> : null}

      <div className="preparation-workspace">
        <section className="preparation-topic-section">
          <header className="preparation-section-header">
            <div>
              <BookOpenCheck size={18} />
              <h3>Conteúdos e materiais</h3>
            </div>
            <div className="preparation-section-actions">
              <span>{studyUnits.length} {studyUnits.length === 1 ? "item" : "itens"}</span>
              <button aria-label="Selecionar conteúdos e materiais" className="icon-button" onClick={() => onEditAssessment(selectedAssessment)} title="Selecionar conteúdos e materiais" type="button">
                <Pencil size={15} />
              </button>
            </div>
          </header>

          {studyUnits.length ? (
            <div className="preparation-topic-list">
              {studyUnits.map((unit) => {
                const level = masteryLevel(unit);
                const saving = savingUnitIds.has(unit.key);
                return (
                  <article
                    aria-busy={saving}
                    className={`preparation-topic-row ${unit.kind === "material" ? "material" : ""}`}
                    id={`preparation-${unit.key}`}
                    key={unit.key}
                  >
                    <div className="preparation-topic-copy">
                      <div className="preparation-unit-title">
                        {unit.kind === "material" ? <FileText size={16} /> : <BookOpenCheck size={16} />}
                        <strong>{unit.title}</strong>
                      </div>
                      <small>
                        {unit.subtitle}
                        {unit.material ? (
                          <a href={materialHref(unit.material)} rel="noreferrer" target="_blank">
                            Abrir<ExternalLink size={13} />
                          </a>
                        ) : null}
                      </small>
                    </div>
                    <div aria-label={`Domínio de ${unit.title}`} className="mastery-segmented-control" role="group">
                      {masteryOptions.map((option) => (
                        <button
                          aria-label={`Marcar ${unit.title} como ${option.label}`}
                          aria-pressed={level === option.level}
                          className={level === option.level ? "active" : ""}
                          data-level={option.level}
                          disabled={saving}
                          key={option.level}
                          onClick={() => void updateMastery(unit, option.level)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <span className="preparation-review-date">
                      <CalendarDays size={15} />
                      {saving ? "Salvando..." : nextReviewText(unit)}
                    </span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="preparation-inline-empty">
              <strong>Nenhum conteúdo ou material selecionado</strong>
              <button onClick={() => onEditAssessment(selectedAssessment)} type="button">
                Selecionar tópicos e slides<ChevronRight size={15} />
              </button>
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
                  <li key={item.unit.key}>
                    <time dateTime={item.date}>{item.dateLabel}</time>
                    <div>
                      <strong>{item.unit.title}</strong>
                      <small>{item.action} · {item.unit.kind === "material" ? "Material" : "Conteúdo"}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className="muted compact-note">Selecione conteúdos ou materiais para montar o plano.</p>}
            {remainingPlanItems ? (
              <small className="preparation-plan-more">
                Mais {remainingPlanItems} {remainingPlanItems === 1 ? "item" : "itens"} depois desta sequência
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
                  href={materialHref(material)}
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
