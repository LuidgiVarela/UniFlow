"use client";

import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronRight,
  History,
  ListChecks,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { useAppData } from "@/components/data-provider";
import { ReviewList } from "@/components/review-list";
import { Panel } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/date";
import {
  buildReviewEntries,
  buildReviewWeekLoad,
  buildSmartReschedulePlan,
  completedReviewsOn,
  dueReviewEntries,
  futureReviewEntries,
  learnedCapacityForDate,
  localIsoDate,
  nextDateAfterReview,
  nextMasteryAfterReview,
  reviewEventFor,
  reviewHref,
  storedMastery,
  type ReviewEntry,
  type ReviewScheduleChange,
} from "@/lib/reviews";
import type { AssessmentMaterial, ReviewAction, ReviewEvent } from "@/types/domain";

const availabilityOptions = [
  { value: 0, label: "Sem tempo" },
  { value: 2, label: "Leve" },
  { value: 3, label: "Normal" },
  { value: 5, label: "Alta" },
];

type Feedback = {
  tone: "success" | "warning" | "error";
  message: string;
};

function nearestAvailability(value: number) {
  return availabilityOptions.reduce((nearest, option) => (
    Math.abs(option.value - value) < Math.abs(nearest - value) ? option.value : nearest
  ), availabilityOptions[0].value);
}

function eventActionLabel(action: ReviewAction) {
  if (action === "completed") return "Revisão concluída";
  if (action === "postponed") return "Adiada manualmente";
  return "Replanejada";
}

function eventDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ReviewCenter() {
  const appData = useAppData();
  const {
    addReviewEvent,
    assessmentMaterials,
    assessmentTopics,
    assessments,
    materials,
    reviewDayPlans,
    reviewEvents,
    subjects,
    topics,
    upsertAssessmentMaterialProgress,
    upsertReviewDayPlan,
    upsertTopic,
  } = appData;
  const entries = useMemo(
    () => buildReviewEntries({ assessmentMaterials, assessmentTopics, assessments, materials, subjects, topics }),
    [assessmentMaterials, assessmentTopics, assessments, materials, subjects, topics],
  );
  const today = localIsoDate();
  const savedTodayPlan = reviewDayPlans.find((plan) => plan.plan_date === today);
  const inferredCapacity = nearestAvailability(learnedCapacityForDate(today, reviewEvents));
  const [todayCapacity, setTodayCapacity] = useState(savedTodayPlan?.capacity ?? inferredCapacity);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [planPreview, setPlanPreview] = useState<ReviewScheduleChange[] | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);
  const dueEntries = dueReviewEntries(entries);
  const futureEntries = futureReviewEntries(entries);
  const overdueCount = dueEntries.filter((entry) => entry.nextReviewDate && daysUntil(entry.nextReviewDate) < 0).length;
  const completedToday = completedReviewsOn(today, reviewEvents);
  const nextSevenDays = futureEntries.filter((entry) => entry.nextReviewDate && daysUntil(entry.nextReviewDate) <= 7).length;
  const weekLoad = buildReviewWeekLoad(entries, reviewEvents, reviewDayPlans, todayCapacity);
  const recentEvents = [...reviewEvents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 7);
  const upcomingGroups = futureEntries.slice(0, 24).reduce<Map<string, ReviewEntry[]>>((groups, entry) => {
    const date = entry.nextReviewDate!;
    groups.set(date, [...(groups.get(date) ?? []), entry]);
    return groups;
  }, new Map());

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

  async function appendHistory(event: ReviewEvent) {
    try {
      await addReviewEvent(event);
      return true;
    } catch {
      return false;
    }
  }

  async function completeReview(entry: ReviewEntry) {
    const mastery = nextMasteryAfterReview(entry);
    const nextReviewDate = nextDateAfterReview(entry);
    const now = new Date();
    setFeedback(null);
    setSavingKey(entry.key);
    try {
      await persistProgress(entry, {
        mastery_level: mastery,
        last_reviewed_at: now.toISOString(),
        next_review_date: nextReviewDate,
      });
      const historySaved = await appendHistory(reviewEventFor(entry, "completed", nextReviewDate, mastery, now));
      setFeedback({
        tone: historySaved ? "success" : "warning",
        message: historySaved
          ? `Revisão de “${entry.title}” concluída. Próxima em ${formatDate(nextReviewDate)}.`
          : `Revisão concluída, mas o histórico não pôde ser registrado.`,
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

  async function postponeReview(entry: ReviewEntry, nextReviewDate: string) {
    const mastery = storedMastery(entry);
    const now = new Date();
    setFeedback(null);
    setSavingKey(entry.key);
    try {
      await persistProgress(entry, {
        mastery_level: mastery,
        last_reviewed_at: entry.lastReviewedAt,
        next_review_date: nextReviewDate,
      });
      const historySaved = await appendHistory(reviewEventFor(entry, "postponed", nextReviewDate, mastery, now));
      setFeedback({
        tone: historySaved ? "success" : "warning",
        message: historySaved
          ? `Revisão de “${entry.title}” remarcada para ${formatDate(nextReviewDate)}.`
          : `Revisão remarcada, mas o histórico não pôde ser registrado.`,
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

  async function changeAvailability(capacity: number) {
    const previous = todayCapacity;
    const now = new Date().toISOString();
    setTodayCapacity(capacity);
    setSavingCapacity(true);
    setFeedback(null);
    try {
      await upsertReviewDayPlan({
        plan_date: today,
        capacity,
        created_at: savedTodayPlan?.created_at ?? now,
        updated_at: now,
      });
    } catch (error) {
      setTodayCapacity(previous);
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível salvar sua disponibilidade.",
      });
    } finally {
      setSavingCapacity(false);
    }
  }

  function previewSmartPlan() {
    const changes = buildSmartReschedulePlan({
      entries,
      events: reviewEvents,
      dayPlans: reviewDayPlans,
      todayCapacity,
    });
    if (!changes.length) {
      setFeedback({
        tone: "success",
        message: "A fila atual já cabe na disponibilidade de hoje.",
      });
      return;
    }
    setFeedback(null);
    setPlanPreview(changes);
  }

  async function applySmartPlan() {
    if (!planPreview?.length) return;
    setApplyingPlan(true);
    setFeedback(null);
    let applied = 0;
    let historyFailures = 0;
    let updateFailures = 0;

    for (const change of planPreview) {
      const mastery = storedMastery(change.entry);
      const now = new Date();
      try {
        await persistProgress(change.entry, {
          mastery_level: mastery,
          last_reviewed_at: change.entry.lastReviewedAt,
          next_review_date: change.toDate,
        });
        applied += 1;
        const saved = await appendHistory(reviewEventFor(change.entry, "auto_rescheduled", change.toDate, mastery, now));
        if (!saved) historyFailures += 1;
      } catch {
        updateFailures += 1;
      }
    }

    setApplyingPlan(false);
    setPlanPreview(null);
    if (updateFailures) {
      setFeedback({
        tone: "error",
        message: `${applied} ${applied === 1 ? "revisão foi reorganizada" : "revisões foram reorganizadas"}; ${updateFailures} não puderam ser atualizadas.`,
      });
      return;
    }
    setFeedback({
      tone: historyFailures ? "warning" : "success",
      message: historyFailures
        ? `${applied} revisões reorganizadas; parte do histórico não pôde ser registrada.`
        : `${applied} ${applied === 1 ? "revisão reorganizada" : "revisões reorganizadas"} com sucesso.`,
    });
  }

  return (
    <>
      <section className="review-center-summary" aria-label="Resumo das revisões">
        <div><span>Na fila hoje</span><strong>{dueEntries.length}</strong></div>
        <div><span>Atrasadas</span><strong>{overdueCount}</strong></div>
        <div><span>Concluídas hoje</span><strong>{completedToday}</strong></div>
        <div><span>Próximos 7 dias</span><strong>{nextSevenDays}</strong></div>
      </section>

      <section className="review-planner-toolbar">
        <div className="review-availability-heading">
          <CalendarClock aria-hidden="true" size={19} />
          <div>
            <h2>Disponibilidade de hoje</h2>
            <span>{completedToday} concluídas · {Math.max(0, todayCapacity - completedToday)} vagas restantes</span>
          </div>
        </div>
        <div aria-label="Disponibilidade para revisões hoje" className="review-availability-options" role="group">
          {availabilityOptions.map((option) => (
            <button
              aria-pressed={todayCapacity === option.value}
              className={todayCapacity === option.value ? "active" : ""}
              disabled={savingCapacity}
              key={option.value}
              onClick={() => void changeAvailability(option.value)}
              type="button"
            >
              <span>{option.label}</span>
              <strong>{option.value}</strong>
            </button>
          ))}
        </div>
        <button
          className="primary-button review-plan-button"
          disabled={savingCapacity || applyingPlan || !dueEntries.length}
          onClick={previewSmartPlan}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
          Replanejar dia
        </button>
      </section>

      {feedback ? <p className={`review-center-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

      <div className="review-center-grid">
        <Panel className="plain-section review-today-panel">
          <header className="review-section-header">
            <div>
              <div className="review-section-title"><ListChecks aria-hidden="true" size={18} /><h2>Fila de hoje</h2></div>
              <span>Ordenada por atraso, tempo sem revisão e avaliação mais próxima</span>
            </div>
            <strong>{dueEntries.length}</strong>
          </header>
          {dueEntries.length ? (
            <ReviewList entries={dueEntries} onComplete={completeReview} onPostpone={postponeReview} savingKey={savingKey} />
          ) : (
            <div className="review-center-empty"><Check aria-hidden="true" size={19} /><strong>Fila concluída por hoje.</strong></div>
          )}
        </Panel>

        <div className="review-center-side">
          <Panel className="plain-section review-week-panel">
            <header className="review-section-header compact">
              <div className="review-section-title"><CalendarDays aria-hidden="true" size={18} /><h2>Próximos 7 dias</h2></div>
            </header>
            <div className="review-week-list">
              {weekLoad.map((day) => {
                const total = day.scheduled + day.completed;
                const percent = Math.min(100, (total / Math.max(1, day.capacity)) * 100);
                const overloaded = total > day.capacity;
                return (
                  <div className={`review-week-row${overloaded ? " overloaded" : ""}`} key={day.date}>
                    <div><strong>{day.label}</strong><span>{day.shortDate}</span></div>
                    <div className="review-week-track"><span style={{ width: `${percent}%` }} /></div>
                    <small>{total}/{day.capacity}</small>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="plain-section review-history-panel">
            <header className="review-section-header compact">
              <div className="review-section-title"><History aria-hidden="true" size={18} /><h2>Histórico recente</h2></div>
            </header>
            {recentEvents.length ? (
              <div className="review-history-list">
                {recentEvents.map((event) => {
                  const subject = subjects.find((item) => item.id === event.subject_id);
                  return (
                    <article key={event.id} style={{ "--review-color": subject?.color } as CSSProperties}>
                      <span className="review-history-dot" />
                      <div><strong>{event.target_title}</strong><span>{subject?.code ?? "MAT"} · {eventActionLabel(event.action)}</span></div>
                      <time>{eventDateLabel(event.created_at)}</time>
                    </article>
                  );
                })}
              </div>
            ) : <p className="muted compact-note">Nenhuma revisão registrada ainda.</p>}
          </Panel>
        </div>
      </div>

      <Panel className="plain-section review-upcoming-panel">
        <header className="review-section-header">
          <div>
            <div className="review-section-title"><BookOpenCheck aria-hidden="true" size={18} /><h2>Próximas revisões</h2></div>
            <span>Agenda posterior a hoje</span>
          </div>
          <strong>{futureEntries.length}</strong>
        </header>
        {upcomingGroups.size ? (
          <div className="review-upcoming-groups">
            {[...upcomingGroups].map(([date, dateEntries]) => (
              <section className="review-upcoming-day" key={date}>
                <header><time>{formatDate(date)}</time><span>{dateEntries.length} {dateEntries.length === 1 ? "item" : "itens"}</span></header>
                <div>
                  {dateEntries.map((entry) => (
                    <Link
                      href={reviewHref(entry)}
                      key={entry.key}
                      rel={entry.kind === "material" ? "noreferrer" : undefined}
                      style={{ "--review-color": entry.subject.color } as CSSProperties}
                      target={entry.kind === "material" ? "_blank" : undefined}
                    >
                      <span>{entry.subject.code}</span>
                      <strong>{entry.title}</strong>
                      <small>{entry.kind === "topic" ? "Conteúdo" : "Material"}</small>
                      <ChevronRight aria-hidden="true" size={15} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : <div className="review-center-empty"><CalendarDays aria-hidden="true" size={19} /><strong>Nenhuma revisão futura agendada.</strong></div>}
      </Panel>

      {planPreview ? (
        <div className="modal-backdrop">
          <section aria-labelledby="review-plan-title" className="modal review-plan-modal">
            <header className="modal-header">
              <div>
                <h2 id="review-plan-title">Novo plano de revisão</h2>
                <p>{planPreview.length} {planPreview.length === 1 ? "revisão será redistribuída" : "revisões serão redistribuídas"}</p>
              </div>
              <button aria-label="Fechar" className="icon-button" disabled={applyingPlan} onClick={() => setPlanPreview(null)} type="button"><X size={17} /></button>
            </header>
            <div className="review-plan-list">
              {planPreview.map((change) => (
                <article key={change.entry.key} style={{ "--review-color": change.entry.subject.color } as CSSProperties}>
                  <span>{change.entry.subject.code}</span>
                  <div><strong>{change.entry.title}</strong><small>{change.entry.assessment?.name ?? (change.entry.kind === "topic" ? "Conteúdo" : "Material")}</small></div>
                  <time>{change.fromDate === today ? "Hoje" : formatDate(change.fromDate)}</time>
                  <ArrowRight aria-hidden="true" size={15} />
                  <time>{formatDate(change.toDate)}</time>
                </article>
              ))}
            </div>
            <footer className="review-plan-footer">
              <button className="ghost-action" disabled={applyingPlan} onClick={() => setPlanPreview(null)} type="button">Cancelar</button>
              <button className={`primary-button${applyingPlan ? " is-loading" : ""}`} disabled={applyingPlan} onClick={() => void applySmartPlan()} type="button">
                {!applyingPlan ? <Check aria-hidden="true" size={16} /> : null}
                {applyingPlan ? "Aplicando" : "Aplicar novo plano"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
