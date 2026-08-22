"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { PageHeader, Panel } from "@/components/ui";
import type { Subject } from "@/types/domain";

const MIN_ATTENDANCE = 0.75;
const ABSENCES_PER_CLASS = 2;

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

export default function FaltometroPage() {
  const { subjects, upsertSubject } = useAppData();
  const [hourDrafts, setHourDrafts] = useState<Record<string, string>>({});
  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [subjects],
  );

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
        <div className="attendance-list">
          {sortedSubjects.map((subject) => {
            const courseHours = Math.max(0, subject.total_classes ?? 0);
            const absences = Math.max(0, subject.absences_count ?? 0);
            const allowed = allowedAbsences(courseHours);
            const remaining = allowed - absences;
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
                    <small>{courseHours ? `${allowed} faltas permitidas` : "Ex.: 30, 60 ou 90 horas"}</small>
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
