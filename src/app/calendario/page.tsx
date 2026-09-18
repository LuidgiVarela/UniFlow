"use client";

import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Landmark,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { PageHeader } from "@/components/ui";
import { assessmentStatusLabels, assessmentTypeLabels, demandStatusLabels, demandTypeLabels } from "@/lib/labels";
import { UNB_2026_2_CALENDAR_SOURCE, unbAcademicEvents2026_2 } from "@/lib/unb-academic-calendar";

type CalendarFilter = "all" | "assessment" | "demand" | "institutional";

type AcademicCalendarEvent = {
  id: string;
  date: string;
  endDate?: string;
  href: string;
  kind: Exclude<CalendarFilter, "all">;
  title: string;
  typeLabel: string;
  statusLabel: string;
  completed: boolean;
  subjectCode: string;
  subjectColor: string;
  external?: boolean;
};

const weekDays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function sameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function dateKeysInRange(start: string, end = start) {
  const keys: string[] = [];
  const cursor = dateFromKey(start);
  const last = dateFromKey(end);
  while (cursor <= last) {
    keys.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function eventTouchesMonth(event: AcademicCalendarEvent, month: Date) {
  const monthStart = localDateKey(new Date(month.getFullYear(), month.getMonth(), 1, 12));
  const monthEnd = localDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0, 12));
  return event.date <= monthEnd && (event.endDate ?? event.date) >= monthStart;
}

function monthDays(reference: Date) {
  const first = new Date(reference.getFullYear(), reference.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function fullDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(dateFromKey(value));
}

function monthLabel(value: Date) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(value);
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

export default function CalendarPage() {
  const { assessments, demands, subjects } = useAppData();
  const [viewMonth, setViewMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1, 12);
  });
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()));
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const todayKey = localDateKey(new Date());

  const subjectById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  );

  const events = useMemo<AcademicCalendarEvent[]>(() => {
    const assessmentEvents = assessments.flatMap<AcademicCalendarEvent>((assessment) => {
      if (!assessment.date) return [];
      const subject = subjectById.get(assessment.subject_id);
      return [{
        id: `assessment-${assessment.id}`,
        date: assessment.date,
        href: `/materias/${encodeURIComponent(assessment.subject_id)}?aba=avaliacoes`,
        kind: "assessment",
        title: assessment.name,
        typeLabel: assessmentTypeLabels[assessment.type],
        statusLabel: assessmentStatusLabels[assessment.status],
        completed: assessment.status !== "futura",
        subjectCode: subject?.code ?? "SEM",
        subjectColor: subject?.color ?? "#8f8f96",
      }];
    });

    const demandEvents = demands.flatMap<AcademicCalendarEvent>((demand) => {
      if (!demand.due_date) return [];
      const subject = subjectById.get(demand.subject_id);
      return [{
        id: `demand-${demand.id}`,
        date: demand.due_date,
        href: `/tarefas/${encodeURIComponent(demand.id)}`,
        kind: "demand",
        title: demand.title,
        typeLabel: demandTypeLabels[demand.type],
        statusLabel: demandStatusLabels[demand.status],
        completed: demand.status === "concluido",
        subjectCode: subject?.code ?? "SEM",
        subjectColor: subject?.color ?? "#8f8f96",
      }];
    });

    const institutionalEvents = unbAcademicEvents2026_2.map<AcademicCalendarEvent>((event) => ({
      id: event.id,
      date: event.date,
      endDate: event.endDate,
      href: UNB_2026_2_CALENDAR_SOURCE,
      kind: "institutional",
      title: event.title,
      typeLabel: "Calendário acadêmico 2026.2",
      statusLabel: event.label,
      completed: false,
      subjectCode: "UnB",
      subjectColor: event.color,
      external: true,
    }));

    return [...assessmentEvents, ...demandEvents, ...institutionalEvents].sort((left, right) => (
      left.date.localeCompare(right.date)
      || Number(left.completed) - Number(right.completed)
      || left.title.localeCompare(right.title, "pt-BR")
    ));
  }, [assessments, demands, subjectById]);

  const filteredEvents = filter === "all" ? events : events.filter((event) => event.kind === filter);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, AcademicCalendarEvent[]>();
    filteredEvents.forEach((event) => {
      dateKeysInRange(event.date, event.endDate).forEach((date) => {
        grouped.set(date, [...(grouped.get(date) ?? []), event]);
      });
    });
    return grouped;
  }, [filteredEvents]);
  const days = useMemo(() => monthDays(viewMonth), [viewMonth]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const visibleMonthEvents = filteredEvents.filter((event) => eventTouchesMonth(event, viewMonth));
  const visibleAssessmentCount = visibleMonthEvents.filter((event) => event.kind === "assessment").length;
  const visibleDemandCount = visibleMonthEvents.filter((event) => event.kind === "demand").length;
  const visibleInstitutionalCount = visibleMonthEvents.filter((event) => event.kind === "institutional").length;

  function changeMonth(direction: -1 | 1) {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + direction, 1, 12);
    setViewMonth(next);
    setSelectedDate(localDateKey(next));
  }

  function goToToday() {
    const today = new Date();
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1, 12));
    setSelectedDate(localDateKey(today));
  }

  return (
    <div className="calendar-page">
      <PageHeader title="Calendário" />

      <section className="academic-calendar">
        <header className="calendar-toolbar">
          <div className="calendar-period-copy">
            <div>
              <CalendarDays aria-hidden="true" size={19} />
              <h2>{monthLabel(viewMonth)}</h2>
            </div>
            <p>{visibleMonthEvents.length} {visibleMonthEvents.length === 1 ? "compromisso" : "compromissos"} · {visibleAssessmentCount} avaliações · {visibleDemandCount} tarefas · {visibleInstitutionalCount} UnB</p>
          </div>

          <div aria-label="Filtrar calendário" className="calendar-filter" role="group">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">Todos</button>
            <button className={filter === "assessment" ? "active" : ""} onClick={() => setFilter("assessment")} type="button">Avaliações</button>
            <button className={filter === "demand" ? "active" : ""} onClick={() => setFilter("demand")} type="button">Tarefas</button>
            <button className={filter === "institutional" ? "active" : ""} onClick={() => setFilter("institutional")} type="button">UnB</button>
          </div>

          <div className="calendar-navigation">
            <button className="calendar-today-button" onClick={goToToday} type="button">Hoje</button>
            <button aria-label="Mês anterior" onClick={() => changeMonth(-1)} title="Mês anterior" type="button"><ChevronLeft size={18} /></button>
            <button aria-label="Próximo mês" onClick={() => changeMonth(1)} title="Próximo mês" type="button"><ChevronRight size={18} /></button>
          </div>
        </header>

        <div className="calendar-workspace">
          <div className="calendar-month-scroll">
            <div className="calendar-month">
              <div className="calendar-weekdays" aria-hidden="true">
                {weekDays.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="calendar-grid">
                {days.map((date) => {
                  const key = localDateKey(date);
                  const dayEvents = eventsByDate.get(key) ?? [];
                  const outside = !sameMonth(date, viewMonth);
                  const selected = key === selectedDate;
                  const today = key === todayKey;
                  const overdue = key < todayKey && dayEvents.some((event) => event.kind !== "institutional" && !event.completed);
                  return (
                    <article
                      className={`calendar-day${outside ? " outside" : ""}${selected ? " selected" : ""}${today ? " today" : ""}`}
                      key={key}
                    >
                      <button
                        aria-label={`Ver agenda de ${fullDateLabel(key)}`}
                        className="calendar-day-number"
                        onClick={() => setSelectedDate(key)}
                        type="button"
                      >
                        <span>{date.getDate()}</span>
                        {overdue ? <i aria-label="Há itens atrasados" title="Há itens atrasados" /> : null}
                      </button>
                      <div className="calendar-day-events">
                        {dayEvents.slice(0, 3).map((event) => (
                          <Link
                            className={`calendar-event${event.completed ? " completed" : ""}`}
                            href={event.href}
                            key={event.id}
                            rel={event.external ? "noreferrer" : undefined}
                            target={event.external ? "_blank" : undefined}
                            title={`${event.subjectCode} · ${event.title}`}
                          >
                            <span className="calendar-event-dot" style={{ background: event.subjectColor }} />
                            <strong>{event.subjectCode}</strong>
                            <span>{event.title}</span>
                          </Link>
                        ))}
                        {dayEvents.length > 3 ? (
                          <button className="calendar-more-events" onClick={() => setSelectedDate(key)} type="button">+{dayEvents.length - 3} itens</button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="calendar-agenda">
            <div className="calendar-agenda-heading">
              <span>{selectedDate === todayKey ? "Hoje" : fullDateLabel(selectedDate)}</span>
              <strong>{selectedEvents.length}</strong>
            </div>
            {selectedEvents.length ? (
              <div className="calendar-agenda-list">
                {selectedEvents.map((event) => (
                  <Link
                    className={`calendar-agenda-event${event.completed ? " completed" : ""}`}
                    href={event.href}
                    key={event.id}
                    rel={event.external ? "noreferrer" : undefined}
                    target={event.external ? "_blank" : undefined}
                  >
                    <span className="calendar-agenda-accent" style={{ background: event.subjectColor }} />
                    <div className="calendar-agenda-icon">
                      {event.completed
                        ? <Check aria-hidden="true" size={17} />
                        : event.kind === "institutional"
                          ? <Landmark aria-hidden="true" size={18} />
                          : event.kind === "assessment"
                          ? <GraduationCap aria-hidden="true" size={18} />
                          : <ClipboardList aria-hidden="true" size={18} />}
                    </div>
                    <div>
                      <span style={{ color: event.subjectColor }}>{event.subjectCode}</span>
                      <strong>{event.title}</strong>
                      <small>{event.typeLabel} · {event.statusLabel}</small>
                    </div>
                    <ArrowUpRight aria-hidden="true" size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="calendar-agenda-empty">
                <CalendarCheck2 aria-hidden="true" size={25} />
                <strong>Dia livre</strong>
                <span>Nenhum compromisso neste filtro.</span>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
