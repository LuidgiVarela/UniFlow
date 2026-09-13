"use client";

import { ArrowDown, ArrowUp, Check, Edit, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAppData } from "@/components/data-provider";
import { StatusPill } from "@/components/ui";
import { topicProgress } from "@/lib/academic";
import { topicStatusLabels } from "@/lib/labels";
import type { Subject, Topic, TopicStatus } from "@/types/domain";

const statuses: TopicStatus[] = ["nao_iniciado", "estudando", "concluido"];

function blankTopic(subject: Subject, order: number): Topic {
  return {
    id: crypto.randomUUID(),
    subject_id: subject.id,
    title: "",
    status: "nao_iniciado",
    order_index: order,
    notes: "",
    created_at: new Date().toISOString(),
  };
}

export function TopicManager({ subject }: { subject: Subject }) {
  const { pendingOperations, topics, upsertTopic, removeTopic } = useAppData();
  const subjectTopics = topics
    .filter((topic) => topic.subject_id === subject.id)
    .sort((a, b) => a.order_index - b.order_index);
  const progress = topicProgress(subjectTopics);
  const [editing, setEditing] = useState<Topic | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  async function move(topic: Topic, direction: -1 | 1) {
    const index = subjectTopics.findIndex((item) => item.id === topic.id);
    const swap = subjectTopics[index + direction];
    if (!swap) return;
    await Promise.all([
      upsertTopic({ ...topic, order_index: swap.order_index }),
      upsertTopic({ ...swap, order_index: topic.order_index }),
    ]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSavingForm(true);
    try {
      await upsertTopic(editing);
      setEditing(null);
    } finally {
      setSavingForm(false);
    }
  }

  async function toggleTopic(topic: Topic) {
    const nextStatus: TopicStatus = topic.status === "concluido" ? "nao_iniciado" : "concluido";
    await upsertTopic({ ...topic, status: nextStatus });
  }

  async function deleteTopic(topic: Topic) {
    const confirmed = window.confirm(`Excluir o conteúdo "${topic.title}"?`);
    if (!confirmed) return;
    try {
      await removeTopic(topic.id);
    } catch {
      // A falha permanece visível no indicador global.
    }
  }

  return (
    <div className="topic-manager">
      <div className="section-tools">
        <div>
          <strong>{progress.done} de {progress.total} tópicos concluídos</strong>
          <div className="progress-track"><span style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <button className="primary-button small" onClick={() => setEditing(blankTopic(subject, subjectTopics.length + 1))} type="button">
          <Plus size={16} />Tópico
        </button>
      </div>

      <div className="topic-list">
        {subjectTopics.map((topic) => {
          const isDeleting = Boolean(pendingOperations[`delete:topic:${topic.id}`]);
          return (
            <article aria-busy={isDeleting} className={`topic-row ${isDeleting ? "is-pending-removal" : ""}`} key={topic.id}>
              <button
                aria-checked={topic.status === "concluido"}
                aria-label={topic.status === "concluido" ? "Marcar tópico como não concluído" : "Marcar tópico como concluído"}
                className={`check-button ${topic.status === "concluido" ? "checked" : ""}`}
                disabled={isDeleting}
                onClick={() => toggleTopic(topic)}
                role="checkbox"
                type="button"
              >
                {topic.status === "concluido" ? <Check size={15} /> : null}
              </button>
              <div>
                <strong>{topic.title}</strong>
                {topic.notes ? <small>{topic.notes}</small> : null}
              </div>
              <StatusPill tone={topic.status}>{topicStatusLabels[topic.status]}</StatusPill>
              <div className="row-actions">
                <button className="icon-button" disabled={isDeleting} onClick={() => move(topic, -1)} title="Mover para cima" type="button"><ArrowUp size={15} /></button>
                <button className="icon-button" disabled={isDeleting} onClick={() => move(topic, 1)} title="Mover para baixo" type="button"><ArrowDown size={15} /></button>
                <button className="icon-button" disabled={isDeleting} onClick={() => setEditing(topic)} title="Editar conteúdo" type="button"><Edit size={15} /></button>
                <button className={`icon-button danger ${isDeleting ? "is-loading" : ""}`} disabled={isDeleting} onClick={() => void deleteTopic(topic)} title="Excluir conteúdo" type="button">
                  {isDeleting ? null : <Trash2 size={15} />}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {editing ? (
        <div className="modal-backdrop">
          <form className="modal form-stack topic-modal" onSubmit={submit}>
            <div className="modal-header">
              <h2>{subjectTopics.some((topic) => topic.id === editing.id) ? "Editar tópico" : "Novo tópico"}</h2>
              <button className="icon-button" onClick={() => setEditing(null)} type="button">x</button>
            </div>
            <label>Título<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required /></label>
            <div className="form-grid">
              <label>Ordem<input type="number" value={editing.order_index} onChange={(e) => setEditing({ ...editing, order_index: Number(e.target.value) })} /></label>
              <label>Status<select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as TopicStatus })}>{statuses.map((status) => <option key={status} value={status}>{topicStatusLabels[status]}</option>)}</select></label>
            </div>
            <label>Observação<textarea rows={10} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></label>
            <button className={`primary-button full ${savingForm ? "is-loading" : ""}`} disabled={savingForm} type="submit">
              {savingForm ? "Salvando..." : "Salvar tópico"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
