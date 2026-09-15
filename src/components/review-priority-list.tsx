"use client";

import {
  BookOpenCheck,
  EyeOff,
  ExternalLink,
  FileText,
  Plus,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { dueReason, reviewHref, reviewPriority, type ReviewEntry } from "@/lib/reviews";

type ReviewPriorityListProps = {
  entries: ReviewEntry[];
  savingKey: string | null;
  onAdd: (entry: ReviewEntry) => Promise<void>;
  onDismiss: (entry: ReviewEntry) => Promise<void>;
};

export function ReviewPriorityList({ entries, savingKey, onAdd, onDismiss }: ReviewPriorityListProps) {
  return (
    <div className="review-priority-list">
      {entries.map((entry, index) => {
        const priority = reviewPriority(entry);
        const isSaving = savingKey === entry.key;
        const title = (
          <>
            <strong>{entry.title}</strong>
            {entry.kind === "material" ? <ExternalLink aria-hidden="true" size={13} /> : null}
          </>
        );

        return (
          <article
            aria-busy={isSaving}
            className={`review-priority-row${priority.blocked ? " has-prerequisite" : ""}`}
            key={entry.key}
            style={{ "--review-color": entry.subject.color } as CSSProperties}
          >
            <span aria-label={`Prioridade ${index + 1}`} className="review-priority-rank">{index + 1}</span>
            <span className="review-kind-icon" title={entry.kind === "topic" ? "Conteúdo" : "Material"}>
              {entry.kind === "topic"
                ? <BookOpenCheck aria-hidden="true" size={16} />
                : <FileText aria-hidden="true" size={16} />}
            </span>
            <div className="review-priority-copy">
              <div className="review-entry-heading">
                <span className="review-subject-code">{entry.subject.code}</span>
                {entry.kind === "topic" ? (
                  <Link href={reviewHref(entry)}>{title}</Link>
                ) : (
                  <a href={reviewHref(entry)} rel="noreferrer" target="_blank">{title}</a>
                )}
              </div>
              <div className="review-priority-reasons">
                {priority.reasons.map((reason) => (
                  <span className={reason.startsWith("Antes:") ? "dependency" : ""} key={reason}>
                    {reason.startsWith("Antes:") ? <TriangleAlert aria-hidden="true" size={12} /> : null}
                    {reason}
                  </span>
                ))}
              </div>
            </div>
            <div className="review-priority-timing">
              <strong>{dueReason(entry)}</strong>
              <span>{entry.assessment?.name ?? (entry.kind === "topic" ? "Conteúdo" : "Material")}</span>
            </div>
            <div className="review-priority-actions">
              <button
                className={`primary-button small${isSaving ? " is-loading" : ""}`}
                disabled={isSaving}
                onClick={() => void onAdd(entry)}
                type="button"
              >
                {!isSaving ? <Plus aria-hidden="true" size={15} /> : null}
                {isSaving ? "Adicionando" : "Hoje"}
              </button>
              <button
                aria-label="Não sugerir hoje"
                className="icon-button"
                disabled={isSaving}
                onClick={() => void onDismiss(entry)}
                title="Não sugerir hoje"
                type="button"
              >
                <EyeOff aria-hidden="true" size={15} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
