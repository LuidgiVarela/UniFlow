"use client";

import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import type { Demand, DemandQuestion, DemandQuestionDifficulty } from "@/types/domain";

const difficulties: Array<{ value: DemandQuestionDifficulty; label: string }> = [
  { value: "facil", label: "Facil" },
  { value: "media", label: "Media" },
  { value: "dificil", label: "Dificil" },
];

function progressText(done: number, total: number) {
  if (!total) return "0 de 0 itens";
  return `${done} de ${total} itens`;
}

export function DemandDashboardModal({
  demand,
  onClose,
}: {
  demand: Demand | null;
  onClose: () => void;
}) {
  const {
    demandQuestionItems,
    demandQuestions,
    generateDemandQuestions,
    upsertDemandQuestion,
    upsertDemandQuestionItem,
  } = useAppData();
  const [questionCount, setQuestionCount] = useState(demand?.total_items ?? 21);
  const [itemPattern, setItemPattern] = useState("a,b,c,d");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const questions = useMemo(
    () =>
      demand
        ? demandQuestions
            .filter((question) => question.demand_id === demand.id)
            .sort((a, b) => a.order_index - b.order_index)
        : [],
    [demand, demandQuestions],
  );

  const itemsByQuestion = useMemo(() => {
    const result: Record<string, typeof demandQuestionItems> = {};
    for (const question of questions) {
      result[question.id] = demandQuestionItems
        .filter((item) => item.question_id === question.id)
        .sort((a, b) => a.order_index - b.order_index);
    }
    return result;
  }, [demandQuestionItems, questions]);

  if (!demand) return null;
  const activeDemand = demand;

  const totalItems = questions.reduce((sum, question) => sum + (itemsByQuestion[question.id]?.length ?? 0), 0);
  const doneItems = questions.reduce(
    (sum, question) => sum + (itemsByQuestion[question.id]?.filter((item) => item.done).length ?? 0),
    0,
  );
  const percent = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  async function submitGenerator(event: React.FormEvent) {
    event.preventDefault();
    const labels = itemPattern.split(",");
    setGenerating(true);
    setError(null);
    try {
      await generateDemandQuestions(activeDemand.id, questionCount, labels);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nao foi possivel gerar as questoes.");
    } finally {
      setGenerating(false);
    }
  }

  async function updateQuestion(question: DemandQuestion, patch: Partial<DemandQuestion>) {
    await upsertDemandQuestion({ ...question, ...patch });
  }

  return (
    <div className="modal-backdrop">
      <section className="modal task-dashboard-modal">
        <div className="modal-header">
          <div>
          <h2>{activeDemand.title}</h2>
            <p className="muted compact-note">{progressText(doneItems, totalItems)} - {percent}%</p>
          </div>
          <button className="icon-button" onClick={onClose} type="button"><X size={16} /></button>
        </div>

        <div className="task-dashboard-progress">
          <div className="progress-track subtle">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>

        <form className="task-generator" onSubmit={submitGenerator}>
          <label>Questoes<input min="1" step="1" type="number" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label>
          <label>Itens por questao<input value={itemPattern} onChange={(event) => setItemPattern(event.target.value)} /></label>
          <button className={`primary-button ${generating ? "is-loading" : ""}`} disabled={generating} type="submit">
            {questions.length ? "Adicionar questoes" : "Configurar lista"}
          </button>
        </form>
        {error ? <p className="form-message error-message">{error}</p> : null}

        <div className="question-dashboard-list">
          {questions.map((question) => {
            const items = itemsByQuestion[question.id] ?? [];
            const done = items.filter((item) => item.done).length;
            const noteValue = noteDrafts[question.id] ?? question.notes ?? "";
            return (
              <article className="question-card" key={question.id}>
                <div className="question-card-header">
                  <div>
                    <strong>{question.label}</strong>
                    <small>{progressText(done, items.length)}</small>
                  </div>
                  <select
                    value={question.difficulty}
                    onChange={(event) => updateQuestion(question, { difficulty: event.target.value as DemandQuestionDifficulty })}
                  >
                    {difficulties.map((difficulty) => (
                      <option key={difficulty.value} value={difficulty.value}>{difficulty.label}</option>
                    ))}
                  </select>
                </div>
                <div className="question-items">
                  {items.map((item) => (
                    <button
                      aria-checked={item.done}
                      className={`question-item ${item.done ? "done" : ""}`}
                      key={item.id}
                      onClick={() => upsertDemandQuestionItem({ ...item, done: !item.done })}
                      role="checkbox"
                      type="button"
                    >
                      <span>{item.done ? <Check size={14} /> : null}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
                <label className="question-note">
                  Observacao
                  <textarea
                    value={noteValue}
                    onBlur={() => {
                      if (noteValue !== (question.notes ?? "")) void updateQuestion(question, { notes: noteValue });
                    }}
                    onChange={(event) => setNoteDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                  />
                </label>
              </article>
            );
          })}
          {!questions.length ? <p className="muted compact-note">Configure a lista para acompanhar questoes e itens.</p> : null}
        </div>
      </section>
    </div>
  );
}
