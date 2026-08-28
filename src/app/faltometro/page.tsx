"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { PageHeader, Panel } from "@/components/ui";
import { daysUntil } from "@/lib/date";
import type { Subject } from "@/types/domain";

const MIN_ATTENDANCE = 0.75;
const ABSENCES_PER_CLASS = 2;
const SEMESTER_START = "2026-08-10";
const SEMESTER_END = "2026-12-14";

function allowedAbsences(courseHours: number) {
  if (!courseHours) return 0;
  return Math.floor(courseHours * (1 - MIN_ATTENDANCE));
}

function presencePercent(courseHours: number, absences: number) {
  if (!courseHours) return 100;
  return Math.max(0, Math.round(((courseHours - absences) / courseHours) * 100));
}

function absenceTone(remaining: number, courseHours: number) {
  if (!courseHours) return "neutral";
  if (remaining < 0) return "danger";
  if (remaining <= ABSENCES_PER_CLASS) return "warning";
  return "ok";
}

function remainingClassDays(remainingAbsences: number) {
  return Math.max(0, Math.floor(remainingAbsences / ABSENCES_PER_CLASS));
}

function semesterElapsedPercent() {
  const today = new Date();
  const start = new Date(`${SEMESTER_START}T12:00:00`).getTime();
  const end = new Date(`${SEMESTER_END}T12:00:00`).getTime();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return Math.min(100, Math.max(0, Math.round(((current - start) / (end - start)) * 100)));
}

export default function FaltometroPage() {
  const { subjects, upsertSubject } = useAppData();
  const [hourDrafts, setHourDrafts] = useState<Record<string, string>>({});
  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [subjects],
  );
  const semesterDaysLeft = Math.max(0, daysUntil(SEMESTER_END));
  const semesterProgress = semesterElapsedPercent();

  async function updateSubject(subject: Subject, patch: Partial<Subject>) {
    await upsertSubject({ ...subject, ...patch });
  }

  function hoursInputValue(subject: Subject) {
    return hourDrafts[subject.id] ?? String(Math.max(0, subject.total_classes ?? 0));
  }

  function saveCourseHours(subject: Subject) {
    const draft = hourDrafts[subject.id];
    if (draft === undefined) return;
    const courseHours = Math.max(0, Number(draft) || 0);
    setHourDrafts((current) => {
      const next = { ...current };
      delete next[subject.id];
      return next;
    });
    void updateSubject(subject, { total_classes: courseHours });
  }

  return (
    <>
      <PageHeader title="Faltômetro" />
      <Panel className="plain-section attendance-panel">
        <section className="semester-countdown-card">
          <div>
            <span>Semestre 2026.2</span>
            <strong>{semesterDaysLeft ? `${semesterDaysLeft} dias restantes` : "Semestre encerrado"}</strong>
            <small>Até 14/12/2026</small>
          </div>
          <div className="semester-progress">
            <div>
              <span>Progresso do semestre</span>
              <strong>{semesterProgress}%</strong>
            </div>
            <div className="progress-track subtle">
              <span style={{ width: `${semesterProgress}%` }} />
            </div>
          </div>
        </section>
        <div className="attendance-list">
          {sortedSubjects.map((subject) => {
            const courseHours = Math.max(0, subject.total_classes ?? 0);
            const absences = Math.max(0, subject.absences_count ?? 0);
            const allowed = allowedAbsences(courseHours);
            const remaining = allowed - absences;
            const remainingDays = remainingClassDays(remaining);
            const percent = presencePercent(courseHours, absences);
            const tone = absenceTone(remaining, courseHours);

            return (
              <article className={`attendance-row ${tone}`} key={subject.id}>
                <div className="attendance-subject">
                  <span className="color-dot" style={{ background: subject.color }} />
                  <div>
                    <strong>{subject.code}</strong>
                    <small>{subject.name}</small>
                  </div>
                </div>

                <label>
                  Carga horária
                  <input
                    min="0"
                    type="number"
                    value={hoursInputValue(subject)}
                    onBlur={() => saveCourseHours(subject)}
                    onChange={(event) => setHourDrafts((current) => ({ ...current, [subject.id]: event.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </label>

                <div className="attendance-stepper">
                  <span>Faltas</span>
                  <div>
                    <button
                      className="icon-button"
                      disabled={absences <= 0}
                      onClick={() => void updateSubject(subject, { absences_count: Math.max(0, absences - ABSENCES_PER_CLASS) })}
                      title="Remover uma aula dupla"
                      type="button"
                    >
                      <Minus size={15} />
                    </button>
                    <strong>{absences}</strong>
                    <button
                      className="icon-button"
                      onClick={() => void updateSubject(subject, { absences_count: absences + ABSENCES_PER_CLASS })}
                      title="Adicionar uma aula dupla"
                      type="button"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>

                <div className="attendance-meter">
                  <div>
                    <strong>{courseHours ? `${Math.max(remaining, 0)} faltas restantes` : "Defina a carga"}</strong>
                    <small>{courseHours ? `${remainingDays} dias de aula restantes` : "Ex.: 30, 60 ou 90 horas"}</small>
                    {courseHours ? <small>{allowed} faltas permitidas</small> : null}
                  </div>
                  <div className="progress-track subtle">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>

                <span className={`attendance-pill ${tone}`}>
                  {courseHours ? `${percent}% presença` : "sem cálculo"}
                </span>
              </article>
            );
          })}
          {!sortedSubjects.length ? <p className="muted compact-note">Nenhuma matéria cadastrada ainda.</p> : null}
        </div>
      </Panel>
    </>
  );
}
