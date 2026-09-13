"use client";

import { useState } from "react";
import { Edit, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { SubjectModal } from "@/components/subject-modal";
import { useAppData } from "@/components/data-provider";
import { PageHeader, Panel } from "@/components/ui";
import { assessmentDaysText, nextAssessment } from "@/lib/academic";
import type { Subject } from "@/types/domain";

export default function SubjectsPage() {
  const { subjects, demands, assessments, pendingOperations, removeSubject } = useAppData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  async function deleteSubject(subject: Subject) {
    const confirmed = window.confirm(`Remover "${subject.name}"? Isso apaga a matéria e seus dados vinculados.`);
    if (!confirmed) return;
    try {
      await removeSubject(subject.id);
    } catch {
      // A falha permanece visível no indicador global.
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Matérias"
        title="Seu semestre"
        action={<button className="primary-button" onClick={() => setModalOpen(true)} type="button"><Plus size={18} />Nova matéria</button>}
      />
      <Panel>
        <div className="subject-grid">
          {subjects.map((subject) => {
            const pending = demands.filter((demand) => demand.subject_id === subject.id && demand.status !== "concluido").length;
            const upcoming = nextAssessment(assessments, subject.id);
            const isDeleting = Boolean(pendingOperations[`delete:subject:${subject.id}`]);
            return (
              <article aria-busy={isDeleting} className={`subject-card ${isDeleting ? "is-pending-removal" : ""}`} key={subject.id}>
                <span className="color-dot" style={{ background: subject.color }} />
                <Link href={`/materias/${subject.id}`}>
                  <h3>{subject.code}</h3>
                  <p>{subject.name}</p>
                </Link>
                {subject.notes ? <small>{subject.notes}</small> : null}
                <small>{upcoming ? `${upcoming.name} em ${assessmentDaysText(upcoming)}` : "Sem avaliação futura"}</small>
                <small>{pending} demandas pendentes</small>
                <div className="row-actions">
                  <button className="icon-button" disabled={isDeleting} onClick={() => setEditing(subject)} title="Editar matéria" type="button"><Edit size={16} /></button>
                  <button className={`icon-button danger ${isDeleting ? "is-loading" : ""}`} disabled={isDeleting} onClick={() => void deleteSubject(subject)} title="Excluir matéria" type="button">
                    {isDeleting ? null : <Trash2 size={16} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>
      <SubjectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <SubjectModal open={Boolean(editing)} subject={editing} onClose={() => setEditing(null)} />
    </>
  );
}
