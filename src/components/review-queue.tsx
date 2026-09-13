"use client";

import {
  BookOpenCheck,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { useAppData } from "@/components/data-provider";
import { Panel } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/date";
import { isAssessmentUpcoming } from "@/lib/grades";
import type {
  AppData,
  Assessment,
  AssessmentMaterial,
  Material,
  Subject,
  Topic,
  TopicMasteryLevel,
} from "@/types/domain";

const DAILY_REVIEW_LIMIT = 5;
const REVIEW_INTERVALS: Record<Exclude<TopicMasteryLevel, 0>, number> = {
  1: 1,
  2: 3,
  3: 7,
};

type ReviewEntry = {
  key: string;
  kind: "topic" | "material";
  title: string;
  subject: Subject;
  assessment: Assessment | null;
  mastery: TopicMasteryLevel;
  lastReviewedAt: string | null;
  nextReviewDate: string | null;
  orderIndex: number;
  topic?: Topic;
  material?: Material;
  assessmentMaterial?: AssessmentMaterial;
};

function localIsoDate(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function inferredTopicMastery(topic: Topic): TopicMasteryLevel {
  if (topic.mastery_level === 0 || topic.mastery_level === 1 || topic.mastery_level === 2 || topic.mastery_level === 3) {
    return topic.mastery_level;
  }
  if (topic.status === "concluido") return 2;
  if (topic.status === "estudando") return 1;
  return 0;
}

function reviewedDaysAgo(value: string | null) {
  if (!value) return null;
  const reviewed = new Date(value);
  if (Number.isNaN(reviewed.getTime())) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  const reviewedStart = new Date(reviewed.getFullYear(), reviewed.getMonth(), reviewed.getDate(), 12).getTime();
  return Math.max(0, Math.round((todayStart - reviewedStart) / 86_400_000));
}

function hasStudyProgress(item: {
  mastery_level?: TopicMasteryLevel | null;
  last_reviewed_at?: string | null;
  next_review_date?: string | null;
}) {
  return item.mastery_level !== null && item.mastery_level !== undefined
    || Boolean(item.last_reviewed_at)
    || Boolean(item.next_review_date);
}

function assessmentTime(assessment: Assessment | null) {
  if (!assessment?.date) return Number.MAX_SAFE_INTEGER;
  return new Date(`${assessment.date}T12:00:00`).getTime();
}

function nearerAssessment(current: Assessment | null, candidate: Assessment) {
  if (!current) return candidate;
  return assessmentTime(candidate) < assessmentTime(current) ? candidate : current;
}

function buildReviewEntries({
  subjects,
  topics,
  assessments,
  assessmentTopics,
  assessmentMaterials,
  materials,
}: Pick<AppData,
  "subjects" | "topics" | "assessments" | "assessmentTopics" | "assessmentMaterials" | "materials"
>) {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const materialById = new Map(materials.map((material) => [material.id, material]));
  const topicsBySubject = new Map<string, Topic[]>();
  topics.forEach((topic) => {
    const current = topicsBySubject.get(topic.subject_id) ?? [];
    current.push(topic);
    topicsBySubject.set(topic.subject_id, current);
  });

  const topicEntries = new Map<string, ReviewEntry>();
  topics.filter(hasStudyProgress).forEach((topic) => {
    const subject = subjectById.get(topic.subject_id);
    if (!subject) return;
    topicEntries.set(topic.id, {
      key: `topic-${topic.id}`,
      kind: "topic",
      title: topic.title,
      subject,
      assessment: null,
      mastery: inferredTopicMastery(topic),
      lastReviewedAt: topic.last_reviewed_at ?? null,
      nextReviewDate: topic.next_review_date ?? null,
      orderIndex: topic.order_index,
      topic,
    });
  });

  const upcomingAssessments = assessments
    .filter(isAssessmentUpcoming)
    .sort((a, b) => assessmentTime(a) - assessmentTime(b));

  upcomingAssessments.forEach((assessment) => {
    const linkedTopicIds = new Set(
      assessmentTopics
        .filter((item) => item.assessment_id === assessment.id)
        .map((item) => item.topic_id),
    );
    const linkedMaterials = assessmentMaterials.filter((item) => item.assessment_id === assessment.id);
    const hasExplicitScope = linkedTopicIds.size > 0 || linkedMaterials.length > 0;
    const scopedTopics = hasExplicitScope
      ? topics.filter((topic) => linkedTopicIds.has(topic.id))
      : topicsBySubject.get(assessment.subject_id) ?? [];

    scopedTopics.forEach((topic) => {
      const subject = subjectById.get(topic.subject_id);
      if (!subject) return;
      const current = topicEntries.get(topic.id);
      if (current) {
        current.assessment = nearerAssessment(current.assessment, assessment);
        return;
      }
      topicEntries.set(topic.id, {
        key: `topic-${topic.id}`,
        kind: "topic",
        title: topic.title,
        subject,
        assessment,
        mastery: inferredTopicMastery(topic),
        lastReviewedAt: topic.last_reviewed_at ?? null,
        nextReviewDate: topic.next_review_date ?? null,
        orderIndex: topic.order_index,
        topic,
      });
    });
  });

  const assessmentById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const materialEntries = assessmentMaterials.flatMap<ReviewEntry>((link) => {
    const assessment = assessmentById.get(link.assessment_id) ?? null;
    if (!hasStudyProgress(link) && (!assessment || !isAssessmentUpcoming(assessment))) return [];
    const material = materialById.get(link.material_id);
    const subject = material ? subjectById.get(material.subject_id) : null;
    if (!material || !subject || (material.type === "link" && !material.url)) return [];
    return [{
      key: `material-${link.assessment_id}-${link.material_id}`,
      kind: "material",
      title: material.name,
      subject,
      assessment,
      mastery: link.mastery_level ?? 0,
      lastReviewedAt: link.last_reviewed_at ?? null,
      nextReviewDate: link.next_review_date ?? null,
      orderIndex: material.sort_order ?? Number.MAX_SAFE_INTEGER,
      material,
      assessmentMaterial: link,
    }];
  });

  return [...topicEntries.values(), ...materialEntries];
}

function compareDueEntries(a: ReviewEntry, b: ReviewEntry) {
  const aHasSchedule = Boolean(a.nextReviewDate);
  const bHasSchedule = Boolean(b.nextReviewDate);
  if (aHasSchedule !== bHasSchedule) return aHasSchedule ? -1 : 1;

  const aOverdue = a.nextReviewDate ? Math.max(0, -daysUntil(a.nextReviewDate)) : 0;
  const bOverdue = b.nextReviewDate ? Math.max(0, -daysUntil(b.nextReviewDate)) : 0;
  if (aOverdue !== bOverdue) return bOverdue - aOverdue;

  const aAge = reviewedDaysAgo(a.lastReviewedAt) ?? Number.MAX_SAFE_INTEGER;
  const bAge = reviewedDaysAgo(b.lastReviewedAt) ?? Number.MAX_SAFE_INTEGER;
  if (aAge !== bAge) return bAge - aAge;
  if (a.mastery !== b.mastery) return a.mastery - b.mastery;

  const assessmentDifference = assessmentTime(a.assessment) - assessmentTime(b.assessment);
  if (assessmentDifference !== 0) return assessmentDifference;
  if (a.subject.id !== b.subject.id) return a.subject.code.localeCompare(b.subject.code, "pt-BR");
  if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  return a.title.localeCompare(b.title, "pt-BR");
}

function dueReason(entry: ReviewEntry) {
  if (!entry.nextReviewDate) return entry.lastReviewedAt ? "Sem nova data" : "Ainda não revisado";
  const difference = daysUntil(entry.nextReviewDate);
  if (difference < 0) return `Atrasada há ${Math.abs(difference)}d`;
  return "Agendada para hoje";
}

function lastReviewText(value: string | null) {
  const days = reviewedDaysAgo(value);
  if (days === null) return "Nunca revisado";
  if (days === 0) return "Revisado hoje";
  if (days === 1) return "Última revisão ontem";
  return `Última revisão há ${days}d`;
}

function materialHref(material: Material) {
  return material.type === "link" ? material.url! : `/materiais/abrir/${encodeURIComponent(material.id)}`;
}

export function ReviewQueue() {
  const {
    assessmentMaterials,
    assessmentTopics,
    assessments,
    materials,
    subjects,
    topics,
    upsertAssessmentMaterialProgress,
    upsertTopic,
  } = useAppData();
  const [showAll, setShowAll] = useState(false);
  const [reschedulingKey, setReschedulingKey] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState(() => localIsoDate(1));
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const entries = useMemo(
    () => buildReviewEntries({ assessmentMaterials, assessmentTopics, assessments, materials, subjects, topics }),
    [
      assessmentMaterials,
      assessmentTopics,
      assessments,
      materials,
      subjects,
      topics,
    ],
  );
  const dueEntries = entries
    .filter((entry) => !entry.nextReviewDate || daysUntil(entry.nextReviewDate) <= 0)
    .sort(compareDueEntries);
  const futureEntries = entries
    .filter((entry) => entry.nextReviewDate && daysUntil(entry.nextReviewDate) > 0)
    .sort((a, b) => daysUntil(a.nextReviewDate!) - daysUntil(b.nextReviewDate!));
  const visibleEntries = showAll ? dueEntries : dueEntries.slice(0, DAILY_REVIEW_LIMIT);
  const overdueCount = dueEntries.filter((entry) => entry.nextReviewDate && daysUntil(entry.nextReviewDate) < 0).length;

  async function persistProgress(
    entry: ReviewEntry,
    progress: Pick<AssessmentMaterial, "mastery_level" | "last_reviewed_at" | "next_review_date">,
  ) {
    if (entry.topic) {
      await upsertTopic({ ...entry.topic, ...progress });
      return;
    }
    if (entry.assessmentMaterial) {
      await upsertAssessmentMaterialProgress({ ...entry.assessmentMaterial, ...progress });
    }
  }

  async function completeReview(entry: ReviewEntry) {
    const mastery = entry.mastery === 0 ? 1 : entry.mastery;
    const nextReviewDate = localIsoDate(REVIEW_INTERVALS[mastery]);
    setFeedback(null);
    setSavingKey(entry.key);
    try {
      await persistProgress(entry, {
        mastery_level: mastery,
        last_reviewed_at: new Date().toISOString(),
        next_review_date: nextReviewDate,
      });
      setReschedulingKey(null);
      setFeedback({
        tone: "success",
        message: `Revisão de “${entry.title}” concluída. Próxima em ${formatDate(nextReviewDate)}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar esta revisão.",
      });
    } finally {
      setSavingKey(null);
    }
  }

  async function rescheduleReview(entry: ReviewEntry, nextReviewDate: string) {
    setFeedback(null);
    setSavingKey(entry.key);
    try {
      await persistProgress(entry, {
        mastery_level: entry.topic?.mastery_level ?? entry.assessmentMaterial?.mastery_level ?? null,
        last_reviewed_at: entry.lastReviewedAt,
        next_review_date: nextReviewDate,
      });
      setReschedulingKey(null);
      setFeedback({
        tone: "success",
        message: `Revisão de “${entry.title}” remarcada para ${formatDate(nextReviewDate)}.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível remarcar esta revisão.",
      });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <Panel className="plain-section review-queue-panel">
      <header className="review-queue-header">
        <div>
          <div className="review-queue-title-line">
            <BookOpenCheck aria-hidden="true" size={19} />
            <h2>Revisões de hoje</h2>
          </div>
          <p className="review-queue-caption">
            {dueEntries.length
              ? `${dueEntries.length} ${dueEntries.length === 1 ? "prioridade" : "prioridades"}${overdueCount ? ` · ${overdueCount} ${overdueCount === 1 ? "atrasada" : "atrasadas"}` : ""}`
              : futureEntries[0]?.nextReviewDate
                ? `Tudo em dia · próxima revisão em ${formatDate(futureEntries[0].nextReviewDate)}`
                : "Tudo em dia"}
          </p>
        </div>
        {dueEntries.length > DAILY_REVIEW_LIMIT ? (
          <button
            aria-expanded={showAll}
            className="ghost-action review-queue-expand"
            onClick={() => setShowAll((current) => !current)}
            type="button"
          >
            {showAll ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}
            {showAll ? "Mostrar menos" : `Ver fila completa (${dueEntries.length})`}
          </button>
        ) : null}
      </header>

      {feedback ? (
        <p className={`review-queue-feedback ${feedback.tone}`} role="status">{feedback.message}</p>
      ) : null}

      {visibleEntries.length ? (
        <div className="review-queue-list">
          {visibleEntries.map((entry, index) => {
            const isSaving = savingKey === entry.key;
            const isRescheduling = reschedulingKey === entry.key;
            const titleContent = (
              <>
                <strong>{entry.title}</strong>
                {entry.kind === "material" ? <ExternalLink aria-hidden="true" size={14} /> : null}
              </>
            );
            return (
              <article
                className="review-queue-row"
                key={entry.key}
                style={{ "--review-color": entry.subject.color } as CSSProperties}
              >
                <span aria-label={`Prioridade ${index + 1}`} className="review-priority-rank">{index + 1}</span>
                <span className="review-kind-icon" title={entry.kind === "topic" ? "Conteúdo" : "Material"}>
                  {entry.kind === "topic"
                    ? <BookOpenCheck aria-hidden="true" size={17} />
                    : <FileText aria-hidden="true" size={17} />}
                </span>
                <div className="review-entry-main">
                  <div className="review-entry-heading">
                    <span className="review-subject-code">{entry.subject.code}</span>
                    {entry.kind === "topic" ? (
                      <Link href={`/materias/${encodeURIComponent(entry.subject.id)}?aba=preparacao`}>{titleContent}</Link>
                    ) : (
                      <a href={materialHref(entry.material!)} rel="noreferrer" target="_blank">{titleContent}</a>
                    )}
                  </div>
                  <span>
                    {entry.kind === "topic" ? "Conteúdo" : "Material"}
                    {entry.assessment ? ` · ${entry.assessment.name}` : ""}
                  </span>
                </div>
                <div className="review-entry-timing">
                  <strong>{dueReason(entry)}</strong>
                  <span>{lastReviewText(entry.lastReviewedAt)}</span>
                </div>
                <div className="review-entry-actions">
                  <button
                    className={`primary-button small${isSaving ? " is-loading" : ""}`}
                    disabled={isSaving}
                    onClick={() => void completeReview(entry)}
                    type="button"
                  >
                    {!isSaving ? <Check aria-hidden="true" size={16} /> : null}
                    {isSaving ? "Salvando" : "Revisei"}
                  </button>
                  <button
                    aria-expanded={isRescheduling}
                    className="ghost-action review-reschedule-trigger"
                    disabled={isSaving}
                    onClick={() => {
                      setCustomDate(localIsoDate(1));
                      setReschedulingKey((current) => current === entry.key ? null : entry.key);
                    }}
                    type="button"
                  >
                    <CalendarClock aria-hidden="true" size={16} />
                    Não consegui
                  </button>
                </div>

                {isRescheduling ? (
                  <div className="review-reschedule-options">
                    <span>Remarcar para</span>
                    <button className="ghost-action" disabled={isSaving} onClick={() => void rescheduleReview(entry, localIsoDate(1))} type="button">Amanhã</button>
                    <button className="ghost-action" disabled={isSaving} onClick={() => void rescheduleReview(entry, localIsoDate(3))} type="button">3 dias</button>
                    <button className="ghost-action" disabled={isSaving} onClick={() => void rescheduleReview(entry, localIsoDate(7))} type="button">7 dias</button>
                    <label className="review-custom-date">
                      <span className="visually-hidden">Outra data</span>
                      <input min={localIsoDate(1)} onChange={(event) => setCustomDate(event.target.value)} type="date" value={customDate} />
                    </label>
                    <button
                      aria-label="Aplicar outra data"
                      className="icon-button"
                      disabled={isSaving || !customDate}
                      onClick={() => void rescheduleReview(entry, customDate)}
                      title="Aplicar outra data"
                      type="button"
                    >
                      <Check aria-hidden="true" size={17} />
                    </button>
                    <button
                      aria-label="Cancelar remarcação"
                      className="icon-button"
                      disabled={isSaving}
                      onClick={() => setReschedulingKey(null)}
                      title="Cancelar"
                      type="button"
                    >
                      <X aria-hidden="true" size={17} />
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="review-queue-empty">
          <Check aria-hidden="true" size={18} />
          <strong>Nenhuma revisão pendente.</strong>
        </div>
      )}
    </Panel>
  );
}
