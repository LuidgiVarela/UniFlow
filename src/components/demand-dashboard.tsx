"use client";

import { Check, Plus, Star, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import type { Demand, DemandQuestion, DemandQuestionDifficulty, DemandQuestionItem } from "@/types/domain";

const difficulties: Array<{ value: DemandQuestionDifficulty; label: string }> = [
  { value: "facil", label: "Fácil" },
  { value: "media", label: "Média" },
  { value: "dificil", label: "Difícil" },
];

function progressText(done: number, total: number) {
  if (!total) return "0 de 0 itens";
  return `${done} de ${total} itens`;
}

function nextItemLabel(items: DemandQuestionItem[]) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const nextIndex = items.length;
  return alphabet[nextIndex] ?? `item ${nextIndex + 1}`;
}

function displayQuestionLabel(label: string) {
  return label.replace(/^Questao\b/i, "Questão");
}

export function DemandDashboard({ demand }: { demand: Demand }) {
  const {
    demandQuestionItems,
    demandQuestions,
    generateDemandQuestions,
    removeDemandQuestionItem,
    upsertDemandQuestion,
    upsertDemandQuestionItem,
  } = useAppData();
  const [questionCount, setQuestionCount] = useState(demand.total_items ?? 21);
  const [itemPattern, setItemPattern] = useState("a,b,c,d");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const questions = useMemo(
    () =>
      demandQuestions
        .filter((question) => question.demand_id === demand.id)
        .sort((a, b) => a.order_index - b.order_index),
    [demand.id, demandQuestions],
  );

  const itemsByQuestion = useMemo(() => {
    const result: Record<string, DemandQuestionItem[]> = {};
    for (const question of questions) {
      result[question.id] = demandQuestionItems
        .filter((item) => item.question_id === question.id)
        .sort((a, b) => a.order_index - b.order_index);
    }
    return result;
  }, [demandQuestionItems, questions]);

  const totalItems = questions.reduce((sum, question) => sum + (itemsByQuestion[question.id]?.length ?? 0), 0);
  const doneItems = questions.reduce(
    (sum, question) => sum + (itemsByQuestion[question.id]?.filter((item) => item.done).length ?? 0),
    0,
  );
  const percent = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const importantQuestions = questions.filter((question) => question.important).length;
  const completedQuestions = questions.filter((question) => {
    const items = itemsByQuestion[question.id] ?? [];
    return items.length > 0 && items.every((item) => item.done);
  }).length;
  const difficultyStats = difficulties.map((difficulty) => {
    const difficultyQuestions = questions.filter((question) => question.difficulty === difficulty.value);
    const difficultyItems = difficultyQuestions.flatMap((question) => itemsByQuestion[question.id] ?? []);
    const difficultyDone = difficultyItems.filter((item) => item.done).length;
    return {
      ...difficulty,
      count: difficultyQuestions.length,
      percent: difficultyItems.length ? Math.round((difficultyDone / difficultyItems.length) * 100) : 0,
    };
  });

  async function submitGenerator(event: React.FormEvent) {
    event.preventDefault();
    const labels = itemPattern.split(",");
    setGenerating(true);
    setError(null);
    try {
      await generateDemandQuestions(demand.id, questionCount, labels);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível gerar as questões.");
    } finally {
      setGenerating(false);
    }
  }

  async function updateQuestion(question: DemandQuestion, patch: Partial<DemandQuestion>) {
    await upsertDemandQuestion({ ...question, ...patch });
  }

  async function addItem(question: DemandQuestion, items: DemandQuestionItem[]) {
    const orderIndex = items.reduce((max, item) => Math.max(max, item.order_index), 0) + 1;
    await upsertDemandQuestionItem({
      id: crypto.randomUUID(),
      question_id: question.id,
      label: nextItemLabel(items),
      done: false,
      order_index: orderIndex,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <section className="task-dashboard-page">
      <div className="task-dashboard-hero">
        <div>
          <h1>{demand.title}</h1>
          <p>{progressText(doneItems, totalItems)} - {percent}%</p>
        </div>
        <div className="task-dashboard-progress">
          <div className="progress-track subtle">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <section className="task-stats-panel" aria-label="Estatísticas da atividade">
        <div className="task-donut-card">
          <div className="task-donut" style={{ "--progress": `${percent}%` } as CSSProperties}>
            <span>{percent}%</span>
          </div>
          <div>
            <strong>Progresso geral</strong>
            <small>{completedQuestions} de {questions.length} questões completas</small>
          </div>
        </div>
        <div className="task-stat-card">
          <strong>{importantQuestions}</strong>
          <small>questões importantes</small>
        </div>
        <div className="task-stat-card">
          <strong>{Math.max(questions.length - completedQuestions, 0)}</strong>
          <small>questões em aberto</small>
        </div>
        <div className="difficulty-chart">
          {difficultyStats.map((difficulty) => (
            <div className="difficulty-chart-row" key={difficulty.value}>
              <span>{difficulty.label}</span>
              <div className="difficulty-bar"><i style={{ width: `${difficulty.percent}%` }} /></div>
              <strong>{difficulty.count}</strong>
            </div>
          ))}
        </div>
      </section>

      <form className="task-generator" onSubmit={submitGenerator}>
        <label>Questões<input min="1" step="1" type="number" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label>
        <label>Itens iniciais<input value={itemPattern} onChange={(event) => setItemPattern(event.target.value)} /></label>
        <button className={`primary-button ${generating ? "is-loading" : ""}`} disabled={generating} type="submit">
          {questions.length ? "Adicionar questões" : "Configurar lista"}
        </button>
      </form>
      {error ? <p className="form-message error-message">{error}</p> : null}

      <div className="question-dashboard-list">
        {questions.map((question) => {
          const items = itemsByQuestion[question.id] ?? [];
          const done = items.filter((item) => item.done).length;
          const noteValue = noteDrafts[question.id] ?? question.notes ?? "";
          const questionPercent = items.length ? Math.round((done / items.length) * 100) : 0;
          return (
            <article className={`question-card ${question.important ? "important" : ""}`} key={question.id}>
              <div className="question-card-header">
                <div>
                  <div className="question-title-line">
                    <strong>{displayQuestionLabel(question.label)}</strong>
                    <button
                      aria-label={question.important ? "Remover marca de questão importante" : "Marcar como questão importante"}
                      className={`question-star-button ${question.important ? "active" : ""}`}
                      onClick={() => updateQuestion(question, { important: !question.important })}
                      title={question.important ? "Questão importante" : "Marcar como importante"}
                      type="button"
                    >
                      <Star size={15} />
                    </button>
                  </div>
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
              <div className="question-mini-chart" aria-label={`${questionPercent}% concluído`}>
                <span style={{ width: `${questionPercent}%` }} />
              </div>
              <div className="question-items">
                {items.map((item) => (
                  <div className={`question-item ${item.done ? "done" : ""}`} key={item.id}>
                    <button
                      aria-checked={item.done}
                      onClick={() => upsertDemandQuestionItem({ ...item, done: !item.done })}
                      role="checkbox"
                      type="button"
                    >
                      <span>{item.done ? <Check size={14} /> : null}</span>
                      {item.label}
                    </button>
                    <button className="question-item-remove" onClick={() => removeDemandQuestionItem(item.id)} title="Remover item" type="button">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button className="question-add-item" onClick={() => addItem(question, items)} type="button">
                  <Plus size={14} />Item
                </button>
              </div>
              <label className="question-note">
                Observação
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
        {!questions.length ? <p className="muted compact-note">Configure a lista para acompanhar questões e itens.</p> : null}
      </div>
    </section>
  );
}
