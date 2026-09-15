"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  ListMinus,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import {
  dueReason,
  lastReviewText,
  localIsoDate,
  reviewHref,
  type ReviewEntry,
} from "@/lib/reviews";

type ReviewListProps = {
  entries: ReviewEntry[];
  savingKey: string | null;
  onComplete: (entry: ReviewEntry) => Promise<void>;
  onPostpone: (entry: ReviewEntry, date: string) => Promise<void>;
  onRemove?: (entry: ReviewEntry) => Promise<void>;
  onMove?: (entry: ReviewEntry, direction: -1 | 1) => Promise<void>;
};

export function ReviewList({ entries, savingKey, onComplete, onPostpone, onRemove, onMove }: ReviewListProps) {
  const [reschedulingKey, setReschedulingKey] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState(() => localIsoDate(1));

  return (
    <div className="review-queue-list review-center-list">
      {entries.map((entry, index) => {
        const isSaving = savingKey === entry.key;
        const isRescheduling = reschedulingKey === entry.key;
        const titleContent = (
          <>
            <strong>{entry.title}</strong>
            {entry.kind === "material" ? <ExternalLink aria-hidden="true" size={14} /> : null}
          </>
        );
        return (
          <article
            className="review-queue-row"
            key={entry.key}
            style={{ "--review-color": entry.subject.color } as CSSProperties}
          >
            <span aria-label={`Prioridade ${index + 1}`} className="review-priority-rank">{index + 1}</span>
            <span className="review-kind-icon" title={entry.kind === "topic" ? "Conteúdo" : "Material"}>
              {entry.kind === "topic"
                ? <BookOpenCheck aria-hidden="true" size={17} />
                : <FileText aria-hidden="true" size={17} />}
            </span>
            <div className="review-entry-main">
              <div className="review-entry-heading">
                <span className="review-subject-code">{entry.subject.code}</span>
                {entry.kind === "topic" ? (
                  <Link href={reviewHref(entry)}>{titleContent}</Link>
                ) : (
                  <a href={reviewHref(entry)} rel="noreferrer" target="_blank">{titleContent}</a>
                )}
              </div>
              <span>
                {entry.kind === "topic" ? "Conteúdo" : "Material"}
                {entry.assessment ? ` · ${entry.assessment.name}` : ""}
              </span>
              {entry.unmetPrerequisites.length ? (
                <span className="review-prerequisite-warning">
                  <TriangleAlert aria-hidden="true" size={13} />
                  Antes: {entry.unmetPrerequisites.map((topic) => topic.title).join(", ")}
                </span>
              ) : null}
            </div>
            <div className="review-entry-timing">
              <strong>{dueReason(entry)}</strong>
              <span>{lastReviewText(entry.lastReviewedAt)}</span>
            </div>
            <div className="review-entry-actions">
              {onMove ? (
                <div className="review-order-actions">
                  <button
                    aria-label="Mover revisão para cima"
                    className="icon-button"
                    disabled={isSaving || index === 0}
                    onClick={() => void onMove(entry, -1)}
                    title="Mover para cima"
                    type="button"
                  >
                    <ArrowUp aria-hidden="true" size={15} />
                  </button>
                  <button
                    aria-label="Mover revisão para baixo"
                    className="icon-button"
                    disabled={isSaving || index === entries.length - 1}
                    onClick={() => void onMove(entry, 1)}
                    title="Mover para baixo"
                    type="button"
                  >
                    <ArrowDown aria-hidden="true" size={15} />
                  </button>
                </div>
              ) : null}
              <button
                className={`primary-button small${isSaving ? " is-loading" : ""}`}
                disabled={isSaving}
                onClick={() => void onComplete(entry)}
                type="button"
              >
                {!isSaving ? <Check aria-hidden="true" size={16} /> : null}
                {isSaving ? "Salvando" : "Revisei"}
              </button>
              <button
                aria-expanded={isRescheduling}
                className="ghost-action review-reschedule-trigger"
                disabled={isSaving}
                onClick={() => {
                  setCustomDate(localIsoDate(1));
                  setReschedulingKey((current) => current === entry.key ? null : entry.key);
                }}
                type="button"
              >
                <CalendarClock aria-hidden="true" size={16} />
                Não consegui
              </button>
              {onRemove ? (
                <button
                  aria-label="Tirar da fila de hoje"
                  className="icon-button"
                  disabled={isSaving}
                  onClick={() => void onRemove(entry)}
                  title="Tirar da fila de hoje"
                  type="button"
                >
                  <ListMinus aria-hidden="true" size={16} />
                </button>
              ) : null}
            </div>

            {isRescheduling ? (
              <div className="review-reschedule-options">
                <span>Remarcar para</span>
                <button
                  className="ghost-action"
                  disabled={isSaving}
                  onClick={() => {
                    setReschedulingKey(null);
                    void onPostpone(entry, localIsoDate(1));
                  }}
                  type="button"
                >
                  Amanhã
                </button>
                <button
                  className="ghost-action"
                  disabled={isSaving}
                  onClick={() => {
                    setReschedulingKey(null);
                    void onPostpone(entry, localIsoDate(3));
                  }}
                  type="button"
                >
                  3 dias
                </button>
                <button
                  className="ghost-action"
                  disabled={isSaving}
                  onClick={() => {
                    setReschedulingKey(null);
                    void onPostpone(entry, localIsoDate(7));
                  }}
                  type="button"
                >
                  7 dias
                </button>
                <label className="review-custom-date">
                  <span className="visually-hidden">Outra data</span>
                  <input min={localIsoDate(1)} onChange={(event) => setCustomDate(event.target.value)} type="date" value={customDate} />
                </label>
                <button
                  aria-label="Aplicar outra data"
                  className="icon-button"
                  disabled={isSaving || !customDate}
                  onClick={() => {
                    setReschedulingKey(null);
                    void onPostpone(entry, customDate);
                  }}
                  title="Aplicar outra data"
                  type="button"
                >
                  <Check aria-hidden="true" size={17} />
                </button>
                <button
                  aria-label="Cancelar remarcação"
                  className="icon-button"
                  disabled={isSaving}
                  onClick={() => setReschedulingKey(null)}
                  title="Cancelar"
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
