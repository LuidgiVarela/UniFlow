"use client";

import {
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  Check,
  Flame,
  History,
  ListChecks,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { useAppData } from "@/components/data-provider";
import { ReviewList } from "@/components/review-list";
import { ReviewPriorityList } from "@/components/review-priority-list";
import { Panel } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/date";
import {
  buildReviewActivity,
  buildReviewEntries,
  buildReviewWeekLoad,
  capacityForDate,
  completedReviewsOn,
  completedReviewsThisWeek,
  currentReviewStreak,
  learnedCapacityForDate,
  localIsoDate,
  nextDateAfterReview,
  nextMasteryAfterReview,
  reviewEventFor,
  reviewQueueItemFor,
  sortReviewEntries,
  storedMastery,
  type ReviewEntry,
} from "@/lib/reviews";
import type { AssessmentMaterial, ReviewAction, ReviewEvent, ReviewQueueState } from "@/types/domain";

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
  if (action === "postponed") return "Remarcada manualmente";
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
    reviewQueueItems,
    subjects,
    topicPrerequisites,
    topics,
    upsertAssessmentMaterialProgress,
    upsertReviewDayPlan,
    upsertReviewQueueItem,
    upsertTopic,
  } = appData;
  const entries = useMemo(
    () => buildReviewEntries({
      assessmentMaterials,
      assessmentTopics,
      assessments,
      materials,
      subjects,
      topicPrerequisites,
      topics,
    }),
    [assessmentMaterials, assessmentTopics, assessments, materials, subjects, topicPrerequisites, topics],
  );
  const today = localIsoDate();
  const savedTodayPlan = reviewDayPlans.find((plan) => plan.plan_date === today);
  const inferredCapacity = nearestAvailability(learnedCapacityForDate(today, reviewEvents));
  const [todayCapacity, setTodayCapacity] = useState(savedTodayPlan?.capacity ?? inferredCapacity);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [savingPlanDate, setSavingPlanDate] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [fillingQueue, setFillingQueue] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");

  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const todayQueueItems = reviewQueueItems.filter((item) => item.queue_date === today);
  const queueItemByKey = new Map(todayQueueItems.map((item) => [item.target_key, item]));
  const plannedItems = todayQueueItems
    .filter((item) => item.state === "planned")
    .sort((a, b) => a.sort_order - b.sort_order);
  const queueEntries = plannedItems
    .map((item) => entryByKey.get(item.target_key))
    .filter((entry): entry is ReviewEntry => Boolean(entry));
  const hiddenKeys = new Set(
    todayQueueItems
      .filter((item) => item.state === "planned" || item.state === "completed" || item.state === "dismissed")
      .map((item) => item.target_key),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const priorityEntries = sortReviewEntries(entries)
    .filter((entry) => !hiddenKeys.has(entry.key))
    .filter((entry) => subjectFilter === "all" || entry.subject.id === subjectFilter)
    .filter((entry) => !normalizedSearch
      || entry.title.toLocaleLowerCase("pt-BR").includes(normalizedSearch)
      || entry.subject.code.toLocaleLowerCase("pt-BR").includes(normalizedSearch))
    .slice(0, 40);
  const overdueCount = entries.filter((entry) => entry.nextReviewDate && daysUntil(entry.nextReviewDate) < 0).length;
  const completedToday = completedReviewsOn(today, reviewEvents);
  const weekLoad = buildReviewWeekLoad(reviewEvents, reviewDayPlans, todayCapacity, reviewQueueItems);
  const recentEvents = [...reviewEvents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 7);
  const activity = buildReviewActivity(reviewEvents);
  const streak = currentReviewStreak(reviewEvents);
  const completedThisWeek = completedReviewsThisWeek(reviewEvents);
  const mondayOffset = (new Date().getDay() + 6) % 7;
  const weeklyTarget = Array.from({ length: 7 }, (_, index) => {
    const date = localIsoDate(index - mondayOffset);
    return date === today ? todayCapacity : capacityForDate(date, reviewDayPlans, reviewEvents);
  }).reduce((total, capacity) => total + capacity, 0);
  const queueTotal = queueEntries.length + completedToday;
  const overTarget = Math.max(0, queueTotal - todayCapacity);

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

  async function setQueueState(entry: ReviewEntry, state: ReviewQueueState, sortOrder?: number) {
    const current = queueItemByKey.get(entry.key);
    await upsertReviewQueueItem(reviewQueueItemFor(
      entry,
      today,
      state,
      sortOrder ?? current?.sort_order ?? plannedItems.length + 1,
      current,
    ));
  }

  async function addToQueue(entry: ReviewEntry) {
    setFeedback(null);
    setSavingKey(entry.key);
    try {
      await setQueueState(entry, "planned", plannedItems.length + 1);
      setFeedback({
        tone: entry.unmetPrerequisites.length ? "warning" : "success",
        message: entry.unmetPrerequisites.length
          ? `“${entry.title}” entrou na fila. Ele depende de ${entry.unmetPrerequisites.map((topic) => topic.title).join(", ")}.`
          : `“${entry.title}” entrou na sua fila de hoje.`,
      });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível atualizar a fila." });
    } finally {
      setSavingKey(null);
    }
  }

  async function dismissForToday(entry: ReviewEntry) {
    setFeedback(null);
    setSavingKey(entry.key);
    try {
      await setQueueState(entry, "dismissed");
      setFeedback({ tone: "success", message: `“${entry.title}” não será sugerido novamente hoje.` });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível ocultar esta sugestão." });
    } finally {
      setSavingKey(null);
    }
  }

  async function removeFromQueue(entry: ReviewEntry) {
    setFeedback(null);
    setSavingKey(entry.key);
    try {
      await setQueueState(entry, "available");
      setFeedback({ tone: "success", message: `“${entry.title}” saiu da fila e voltou às prioridades.` });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível atualizar a fila." });
    } finally {
      setSavingKey(null);
    }
  }

  async function moveQueueEntry(entry: ReviewEntry, direction: -1 | 1) {
    const index = queueEntries.findIndex((item) => item.key === entry.key);
    const swapEntry = queueEntries[index + direction];
    if (!swapEntry) return;
    const current = queueItemByKey.get(entry.key);
    const swap = queueItemByKey.get(swapEntry.key);
    if (!current || !swap) return;
    setSavingKey(entry.key);
    setFeedback(null);
    try {
      await Promise.all([
        upsertReviewQueueItem({ ...current, sort_order: swap.sort_order, updated_at: new Date().toISOString() }),
        upsertReviewQueueItem({ ...swap, sort_order: current.sort_order, updated_at: new Date().toISOString() }),
      ]);
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível reordenar a fila." });
    } finally {
      setSavingKey(null);
    }
  }

  async function fillDailyTarget() {
    const remaining = Math.max(0, todayCapacity - queueTotal);
    if (!remaining) {
      setFeedback({
        tone: "success",
        message: todayCapacity === 0 ? "Hoje está marcado como um dia sem revisões." : "Sua meta de hoje já está preenchida.",
      });
      return;
    }
    const candidates = priorityEntries.slice(0, remaining);
    if (!candidates.length) {
      setFeedback({ tone: "success", message: "Não há outras prioridades disponíveis para preencher a meta." });
      return;
    }
    setFillingQueue(true);
    setFeedback(null);
    try {
      for (const [index, entry] of candidates.entries()) {
        await setQueueState(entry, "planned", plannedItems.length + index + 1);
      }
      setFeedback({ tone: "success", message: `${candidates.length} ${candidates.length === 1 ? "prioridade adicionada" : "prioridades adicionadas"} à fila.` });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível preencher a fila." });
    } finally {
      setFillingQueue(false);
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
      let queueSaved = true;
      try {
        await setQueueState(entry, "completed");
      } catch {
        queueSaved = false;
      }
      setFeedback({
        tone: historySaved && queueSaved ? "success" : "warning",
        message: historySaved && queueSaved
          ? `Revisão de “${entry.title}” concluída. Próxima em ${formatDate(nextReviewDate)}.`
          : "A revisão foi concluída, mas parte do histórico visual não pôde ser registrada.",
      });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível salvar esta revisão." });
    } finally {
      setSavingKey(null);
    }
  }

  async function rescheduleReview(entry: ReviewEntry, nextReviewDate: string) {
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
      await setQueueState(entry, "dismissed");
      setFeedback({
        tone: historySaved ? "success" : "warning",
        message: historySaved
          ? `Revisão de “${entry.title}” remarcada para ${formatDate(nextReviewDate)}.`
          : "A revisão foi remarcada, mas o histórico não pôde ser registrado.",
      });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível remarcar esta revisão." });
    } finally {
      setSavingKey(null);
    }
  }

  function availabilityForDate(date: string) {
    if (date === today) return todayCapacity;
    const savedPlan = reviewDayPlans.find((plan) => plan.plan_date === date);
    return savedPlan?.capacity ?? nearestAvailability(learnedCapacityForDate(date, reviewEvents));
  }

  async function changeAvailability(capacity: number, date = today) {
    const previous = todayCapacity;
    const now = new Date().toISOString();
    const savedPlan = reviewDayPlans.find((plan) => plan.plan_date === date);
    if (date === today) setTodayCapacity(capacity);
    setSavingPlanDate(date);
    setFeedback(null);
    try {
      await upsertReviewDayPlan({
        plan_date: date,
        capacity,
        created_at: savedPlan?.created_at ?? now,
        updated_at: now,
      });
    } catch (error) {
      if (date === today) setTodayCapacity(previous);
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Não foi possível salvar sua disponibilidade." });
    } finally {
      setSavingPlanDate(null);
    }
  }

  return (
    <>
      <section className="review-center-summary" aria-label="Resumo das revisões">
        <div><span>Minha fila hoje</span><strong>{queueEntries.length}</strong></div>
        <div><span>Prioridades atrasadas</span><strong>{overdueCount}</strong></div>
        <div><span>Concluídas hoje</span><strong>{completedToday}</strong></div>
        <div><span>Meta da semana</span><strong>{completedThisWeek}/{weeklyTarget}</strong></div>
      </section>

      <section className="review-planner-toolbar">
        <div className="review-availability-heading">
          <CalendarClock aria-hidden="true" size={19} />
          <div>
            <h2>Ritmo de hoje</h2>
            <span>
              Meta flexível de {todayCapacity} {todayCapacity === 1 ? "revisão" : "revisões"}
              {overTarget ? ` · ${overTarget} além da meta` : ` · ${Math.max(0, todayCapacity - queueTotal)} vagas sugeridas`}
            </span>
          </div>
        </div>
        <div aria-label="Disponibilidade para revisões hoje" className="review-availability-options" role="group">
          {availabilityOptions.map((option) => (
            <button
              aria-pressed={todayCapacity === option.value}
              className={`${todayCapacity === option.value ? "active" : ""} ${savingPlanDate === today && todayCapacity === option.value ? "is-loading" : ""}`}
              disabled={Boolean(savingPlanDate)}
              key={option.value}
              onClick={() => void changeAvailability(option.value)}
              type="button"
            >
              <span>{option.label}</span>
              <strong>{option.value}</strong>
            </button>
          ))}
        </div>
        <div className="review-planner-actions">
          <button className="ghost-action" onClick={() => setAvailabilityOpen(true)} type="button">
            <CalendarDays aria-hidden="true" size={16} />
            Planejar semana
          </button>
          <button
            className={`primary-button review-plan-button${fillingQueue ? " is-loading" : ""}`}
            disabled={fillingQueue || Boolean(savingPlanDate)}
            onClick={() => void fillDailyTarget()}
            type="button"
          >
            {!fillingQueue ? <Sparkles aria-hidden="true" size={16} /> : null}
            {fillingQueue ? "Preenchendo" : "Preencher meta"}
          </button>
        </div>
      </section>

      {feedback ? <p className={`review-center-feedback ${feedback.tone}`} role="status">{feedback.message}</p> : null}

      <div className="review-center-grid">
        <div className="review-center-main">
          <Panel className="plain-section review-today-panel">
            <header className="review-section-header">
              <div>
                <div className="review-section-title"><ListChecks aria-hidden="true" size={18} /><h2>Minha fila de hoje</h2></div>
                <span>Você escolhe o que entra; a meta não limita quantos itens pode concluir</span>
              </div>
              <strong>{queueEntries.length}</strong>
            </header>
            {queueEntries.length ? (
              <ReviewList
                entries={queueEntries}
                onComplete={completeReview}
                onMove={moveQueueEntry}
                onPostpone={rescheduleReview}
                onRemove={removeFromQueue}
                savingKey={savingKey}
              />
            ) : (
              <div className="review-center-empty">
                <BookOpenCheck aria-hidden="true" size={19} />
                <div><strong>Sua fila ainda está vazia.</strong><span>Escolha prioridades abaixo ou preencha até a meta.</span></div>
              </div>
            )}
          </Panel>

          <Panel className="plain-section review-priorities-panel">
            <header className="review-section-header review-priorities-header">
              <div>
                <div className="review-section-title"><BarChart3 aria-hidden="true" size={18} /><h2>Prioridades</h2></div>
                <span>Ranking por atraso, domínio, tempo sem revisão, avaliação e pré-requisitos</span>
              </div>
              <div className="review-priority-filters">
                <label className="review-priority-search">
                  <Search aria-hidden="true" size={15} />
                  <span className="visually-hidden">Buscar prioridade</span>
                  <input onChange={(event) => setSearch(event.target.value)} placeholder="Buscar" value={search} />
                </label>
                <label>
                  <span className="visually-hidden">Filtrar por matéria</span>
                  <select onChange={(event) => setSubjectFilter(event.target.value)} value={subjectFilter}>
                    <option value="all">Todas as matérias</option>
                    {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code}</option>)}
                  </select>
                </label>
              </div>
            </header>
            {priorityEntries.length ? (
              <ReviewPriorityList
                entries={priorityEntries}
                onAdd={addToQueue}
                onDismiss={dismissForToday}
                savingKey={savingKey}
              />
            ) : (
              <div className="review-center-empty"><Check aria-hidden="true" size={19} /><strong>Nenhuma prioridade com estes filtros.</strong></div>
            )}
          </Panel>
        </div>

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

      <Panel className="plain-section review-activity-panel">
        <header className="review-section-header">
          <div>
            <div className="review-section-title"><Flame aria-hidden="true" size={18} /><h2>Ritmo de revisão</h2></div>
            <span>Consistência sem punição: cada quadrado representa um dia</span>
          </div>
          <div className="review-activity-stats">
            <span><strong>{completedThisWeek}</strong> esta semana</span>
            <span><strong>{streak}</strong> {streak === 1 ? "dia seguido" : "dias seguidos"}</span>
          </div>
        </header>
        <div className="review-heatmap-wrap">
          <div aria-label="Atividade de revisões dos últimos meses" className="review-heatmap" role="img">
            {activity.map((day) => (
              <span
                aria-label={`${formatDate(day.date)}: ${day.count} ${day.count === 1 ? "revisão" : "revisões"}`}
                data-level={day.level}
                key={day.date}
                title={`${formatDate(day.date)} · ${day.count} ${day.count === 1 ? "revisão" : "revisões"}`}
              />
            ))}
          </div>
          <div className="review-heatmap-legend"><span>Menos</span>{[0, 1, 2, 3, 4].map((level) => <i data-level={level} key={level} />)}<span>Mais</span></div>
        </div>
      </Panel>

      {availabilityOpen ? (
        <div className="modal-backdrop">
          <section aria-labelledby="review-availability-title" className="modal review-availability-modal">
            <header className="modal-header">
              <div>
                <h2 id="review-availability-title">Disponibilidade da semana</h2>
                <p>Use como meta flexível; você sempre pode fazer mais ou menos</p>
              </div>
              <button aria-label="Fechar" className="icon-button" disabled={Boolean(savingPlanDate)} onClick={() => setAvailabilityOpen(false)} type="button"><X size={17} /></button>
            </header>
            <div className="review-availability-week">
              {weekLoad.map((day) => {
                const capacity = availabilityForDate(day.date);
                const isSaving = savingPlanDate === day.date;
                return (
                  <article aria-busy={isSaving} key={day.date}>
                    <div>
                      <strong>{day.label}</strong>
                      <span>{day.shortDate} · {day.scheduled} na fila</span>
                    </div>
                    <div aria-label={`Disponibilidade de ${day.label}`} className="review-day-capacity-options" role="group">
                      {availabilityOptions.map((option) => (
                        <button
                          aria-pressed={capacity === option.value}
                          className={`${capacity === option.value ? "active" : ""} ${isSaving && capacity === option.value ? "is-loading" : ""}`}
                          disabled={Boolean(savingPlanDate)}
                          key={option.value}
                          onClick={() => void changeAvailability(option.value, day.date)}
                          title={`${option.label}: ${option.value} revisões`}
                          type="button"
                        >
                          <span>{option.label}</span>
                          <strong>{option.value}</strong>
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
            <footer className="review-plan-footer">
              <button className="primary-button" disabled={Boolean(savingPlanDate)} onClick={() => setAvailabilityOpen(false)} type="button">Concluir</button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
