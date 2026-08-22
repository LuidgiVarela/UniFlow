"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { PageHeader, Panel } from "@/components/ui";
import type { Subject } from "@/types/domain";

const MIN_ATTENDANCE = 0.75;

function allowedAbsences(totalClasses: number) {
  if (!totalClasses) return 0;
  return Math.floor(totalClasses * (1 - MIN_ATTENDANCE));
}

function presencePercent(totalClasses: number, absences: number) {
  if (!totalClasses) return 100;
  return Math.max(0, Math.round(((totalClasses - absences) / totalClasses) * 100));
}

function absenceTone(remaining: number, totalClasses: number) {
  if (!totalClasses) return "neutral";
  if (remaining < 0) return "danger";
  if (remaining <= 1) return "warning";
  return "ok";
}

export default function FaltometroPage() {
  const { subjects, upsertSubject } = useAppData();
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [classDrafts, setClassDrafts] = useState<Record<string, string>>({});
  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [subjects],
  );

  async function updateSubject(subject: Subject, patch: Partial<Subject>) {
    setSavingIds((current) => ({ ...current, [subject.id]: true }));
    try {
      await upsertSubject({ ...subject, ...patch });
    } finally {
      setSavingIds((current) => ({ ...current, [subject.id]: false }));
    }
  }

  function classInputValue(subject: Subject) {
    return classDrafts[subject.id] ?? String(Math.max(0, subject.total_classes ?? 0));
  }

  function saveClassCount(subject: Subject) {
    const draft = classDrafts[subject.id];
    if (draft === undefined) return;
    const totalClasses = Math.max(0, Number(draft) || 0);
    setClassDrafts((current) => {
      const next = { ...current };
      delete next[subject.id];
      return next;
    });
    void updateSubject(subject, { total_classes: totalClasses });
  }

  return (
    <>
      <PageHeader title="Faltômetro" />
      <Panel className="plain-section attendance-panel">
        <div className="attendance-list">
          {sortedSubjects.map((subject) => {
            const totalClasses = Math.max(0, subject.total_classes ?? 0);
            const absences = Math.max(0, subject.absences_count ?? 0);
            const allowed = allowedAbsences(totalClasses);
            const remaining = allowed - absences;
            const percent = presencePercent(totalClasses, absences);
            const tone = absenceTone(remaining, totalClasses);
            const saving = savingIds[subject.id];

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
                  Aulas
                  <input
                    disabled={saving}
                    min="0"
                    type="number"
                    value={classInputValue(subject)}
                    onBlur={() => saveClassCount(subject)}
                    onChange={(event) => setClassDrafts((current) => ({ ...current, [subject.id]: event.target.value }))}
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
                      disabled={saving || absences <= 0}
                      onClick={() => updateSubject(subject, { absences_count: Math.max(0, absences - 1) })}
                      type="button"
                    >
                      <Minus size={15} />
                    </button>
                    <strong>{absences}</strong>
                    <button
                      className="icon-button"
                      disabled={saving}
                      onClick={() => updateSubject(subject, { absences_count: absences + 1 })}
                      type="button"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>

                <div className="attendance-meter">
                  <div>
                    <strong>{totalClasses ? `${Math.max(remaining, 0)} restantes` : "Defina as aulas"}</strong>
                    <small>{totalClasses ? `${allowed} faltas permitidas` : "Use o total do semestre"}</small>
                  </div>
                  <div className="progress-track subtle">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                </div>

                <span className={`attendance-pill ${tone}`}>
                  {totalClasses ? `${percent}% presença` : "sem cálculo"}
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
