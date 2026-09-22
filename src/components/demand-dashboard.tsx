"use client";

import { Check, NotebookPen, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import type { Demand, DemandQuestion, DemandQuestionDifficulty, DemandQuestionItem } from "@/types/domain";

type QuestionNumberingMode = "sequential" | "custom";

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

function questionIdentifier(label: string) {
  return displayQuestionLabel(label).replace(/^Questão\s*/i, "").trim();
}

function normalizeQuestionLabel(value: string) {
  const identifier = questionIdentifier(value);
  return identifier ? `Questão ${identifier}` : "";
}

function splitLabels(value: string) {
  return value.split(/[,;\n]+/).map((label) => label.trim()).filter(Boolean);
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
  const [numberingMode, setNumberingMode] = useState<QuestionNumberingMode>("sequential");
  const [questionCount, setQuestionCount] = useState(demand.total_items ?? 21);
  const [questionStart, setQuestionStart] = useState<0 | 1>(1);
  const [customQuestionLabels, setCustomQuestionLabels] = useState("");
  const [itemPattern, setItemPattern] = useState("a,b,c,d");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionLabelDraft, setQuestionLabelDraft] = useState("");
  const [savingQuestionLabel, setSavingQuestionLabel] = useState(false);

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
  const importantItems = questions.reduce(
    (sum, question) => sum + (itemsByQuestion[question.id]?.filter((item) => item.important).length ?? 0),
    0,
  );
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
  const hasQuestionZero = questions.some((question) => questionIdentifier(question.label) === "0");

  async function submitGenerator(event: React.FormEvent) {
    event.preventDefault();
    const labels = splitLabels(itemPattern);
    const requestedLabels = numberingMode === "custom" ? splitLabels(customQuestionLabels) : undefined;
    if (!labels.length) {
      setError("Informe ao menos um item para cada questão.");
      return;
    }
    if (numberingMode === "custom" && !requestedLabels?.length) {
      setError("Informe os identificadores das questões.");
      return;
    }
    if (numberingMode === "sequential" && (!Number.isFinite(questionCount) || questionCount < 1)) {
      setError("Informe uma quantidade válida de questões.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await generateDemandQuestions(
        demand.id,
        requestedLabels?.length ?? questionCount,
        labels,
        numberingMode === "sequential" && !questions.length ? questionStart : undefined,
        requestedLabels,
      );
      if (requestedLabels) setCustomQuestionLabels("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível gerar as questões.");
    } finally {
      setGenerating(false);
    }
  }

  async function addQuestionZero() {
    const labels = splitLabels(itemPattern);
    if (!labels.length) {
      setError("Informe ao menos um item para a Questão 0.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await generateDemandQuestions(demand.id, 1, labels, 0);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível adicionar a Questão 0.");
    } finally {
      setGenerating(false);
    }
  }

  async function updateQuestion(question: DemandQuestion, patch: Partial<DemandQuestion>) {
    await upsertDemandQuestion({ ...question, ...patch });
  }

  async function saveQuestionLabel(question: DemandQuestion) {
    const nextLabel = normalizeQuestionLabel(questionLabelDraft);
    if (!nextLabel) {
      setError("Informe o identificador da questão.");
      return;
    }
    if (questions.some((item) => item.id !== question.id && normalizeQuestionLabel(item.label).toLocaleLowerCase("pt-BR") === nextLabel.toLocaleLowerCase("pt-BR"))) {
      setError(`${nextLabel} já existe nesta lista.`);
      return;
    }

    setSavingQuestionLabel(true);
    setError(null);
    try {
      await updateQuestion(question, { label: nextLabel });
      setEditingQuestionId(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível renomear a questão.");
    } finally {
      setSavingQuestionLabel(false);
    }
  }

  async function addItem(question: DemandQuestion, items: DemandQuestionItem[]) {
    const orderIndex = items.reduce((max, item) => Math.max(max, item.order_index), 0) + 1;
    await upsertDemandQuestionItem({
      id: crypto.randomUUID(),
      question_id: question.id,
      label: nextItemLabel(items),
      done: false,
      important: false,
      order_index: orderIndex,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <section className="task-dashboard-page">
      <div className="task-dashboard-hero">
        <div className="task-dashboard-hero-top">
          <div>
            <h1>{demand.title}</h1>
            <p>{progressText(doneItems, totalItems)} - {percent}%</p>
          </div>
          <Link
            className="ghost-action task-notebook-action"
            href={`/tarefas/${demand.id}/caderno`}
            rel="noopener noreferrer"
            target="_blank"
          >
            <NotebookPen size={17} />Caderno da lista
          </Link>
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
          <strong>{importantItems}</strong>
          <small>itens para revisar</small>
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

      <form
        className={`task-generator ${numberingMode === "custom" ? "with-custom-numbering" : questions.length ? "" : "with-question-start"}`}
        onSubmit={submitGenerator}
      >
        <div className="question-numbering-field">
          <span>Numeração</span>
          <div aria-label="Formato da numeração" className="question-numbering-control" role="group">
            <button
              aria-pressed={numberingMode === "sequential"}
              className={numberingMode === "sequential" ? "active" : ""}
              onClick={() => setNumberingMode("sequential")}
              type="button"
            >
              Sequencial
            </button>
            <button
              aria-pressed={numberingMode === "custom"}
              className={numberingMode === "custom" ? "active" : ""}
              onClick={() => setNumberingMode("custom")}
              type="button"
            >
              Personalizada
            </button>
          </div>
        </div>
        {numberingMode === "sequential" ? (
          <label>Quantidade<input min="1" step="1" type="number" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} /></label>
        ) : (
          <label className="custom-question-labels">Questões da lista<input placeholder="1.1, 1.2, 1.3" value={customQuestionLabels} onChange={(event) => setCustomQuestionLabels(event.target.value)} /></label>
        )}
        <label>Itens por questão<input placeholder="a, b, c" value={itemPattern} onChange={(event) => setItemPattern(event.target.value)} /></label>
        {numberingMode === "sequential" && !questions.length ? (
          <div className="question-start-field">
            <span>Primeira questão</span>
            <div aria-label="Número da primeira questão" className="question-start-control" role="group">
              {([0, 1] as const).map((number) => (
                <button
                  aria-pressed={questionStart === number}
                  className={questionStart === number ? "active" : ""}
                  key={number}
                  onClick={() => setQuestionStart(number)}
                  type="button"
                >
                  {number}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button className={`primary-button ${generating ? "is-loading" : ""}`} disabled={generating} type="submit">
          {questions.length ? "Adicionar questões" : "Configurar lista"}
        </button>
        {questions.length && !hasQuestionZero ? (
          <button className="ghost-action question-zero-action" disabled={generating} onClick={() => void addQuestionZero()} type="button">
            <Plus size={15} />Adicionar Questão 0
          </button>
        ) : null}
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
              <div className={`question-card-header ${editingQuestionId === question.id ? "editing-label" : ""}`}>
                <div>
                  <div className="question-title-line">
                    {editingQuestionId === question.id ? (
                      <form className="question-label-editor" onSubmit={(event) => {
                        event.preventDefault();
                        void saveQuestionLabel(question);
                      }}>
                        <input
                          aria-label="Identificador da questão"
                          autoFocus
                          onChange={(event) => setQuestionLabelDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setEditingQuestionId(null);
                          }}
                          value={questionLabelDraft}
                        />
                        <button aria-label="Salvar identificador" disabled={savingQuestionLabel} title="Salvar" type="submit">
                          <Check size={14} />
                        </button>
                        <button aria-label="Cancelar edição" disabled={savingQuestionLabel} onClick={() => setEditingQuestionId(null)} title="Cancelar" type="button">
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <button
                        className="question-label-button"
                        onClick={() => {
                          setQuestionLabelDraft(questionIdentifier(question.label));
                          setEditingQuestionId(question.id);
                          setError(null);
                        }}
                        title="Renomear questão"
                        type="button"
                      >
                        <strong>{displayQuestionLabel(question.label)}</strong>
                        <Pencil size={12} />
                      </button>
                    )}
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
                  <div className={`question-item ${item.done ? "done" : ""} ${item.important ? "important" : ""}`} key={item.id}>
                    <button
                      aria-checked={item.done}
                      onClick={() => upsertDemandQuestionItem({ ...item, done: !item.done })}
                      role="checkbox"
                      type="button"
                    >
                      <span>{item.done ? <Check size={14} /> : null}</span>
                      {item.label}
                    </button>
                    <button
                      aria-label={item.important ? "Remover item da revisão" : "Marcar item para revisar"}
                      className="question-item-star"
                      onClick={() => upsertDemandQuestionItem({ ...item, important: !item.important })}
                      title={item.important ? "Item para revisar" : "Marcar para revisar"}
                      type="button"
                    >
                      <Star size={12} />
                    </button>
                    <button className="question-item-remove" onClick={() => void removeDemandQuestionItem(item.id).catch(() => undefined)} title="Remover item" type="button">
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
