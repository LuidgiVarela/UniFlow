"use client";

import { BookOpenCheck, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useAppData } from "@/components/data-provider";
import { Panel } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/date";
import { buildReviewEntries, dueReason, dueReviewEntries, futureReviewEntries } from "@/lib/reviews";

const OVERVIEW_REVIEW_LIMIT = 3;

export function ReviewQueue() {
  const appData = useAppData();
  const entries = buildReviewEntries(appData);
  const dueEntries = dueReviewEntries(entries);
  const visibleEntries = dueEntries.slice(0, OVERVIEW_REVIEW_LIMIT);
  const futureEntries = futureReviewEntries(entries);
  const overdueCount = dueEntries.filter((entry) => entry.nextReviewDate && daysUntil(entry.nextReviewDate) < 0).length;

  return (
    <Panel className="plain-section review-overview-panel">
      <header className="review-overview-header">
        <div>
          <div className="review-queue-title-line">
            <BookOpenCheck aria-hidden="true" size={19} />
            <h2>Revisões de hoje</h2>
          </div>
          <p className="review-queue-caption">
            {dueEntries.length
              ? `${dueEntries.length} ${dueEntries.length === 1 ? "prioridade" : "prioridades"}${overdueCount ? ` · ${overdueCount} ${overdueCount === 1 ? "atrasada" : "atrasadas"}` : ""}`
              : futureEntries[0]?.nextReviewDate
                ? `Tudo em dia · próxima em ${formatDate(futureEntries[0].nextReviewDate)}`
                : "Tudo em dia"}
          </p>
        </div>
        <Link className="ghost-action" href="/revisoes">
          Ver revisões<ChevronRight aria-hidden="true" size={16} />
        </Link>
      </header>

      {visibleEntries.length ? (
        <div className="review-overview-list">
          {visibleEntries.map((entry, index) => (
            <Link
              className="review-overview-row"
              href="/revisoes"
              key={entry.key}
              style={{ "--review-color": entry.subject.color } as CSSProperties}
            >
              <span className="review-priority-rank">{index + 1}</span>
              <span className="review-subject-code">{entry.subject.code}</span>
              <div>
                <strong>{entry.title}</strong>
                <small>{entry.kind === "topic" ? "Conteúdo" : "Material"}{entry.assessment ? ` · ${entry.assessment.name}` : ""}</small>
              </div>
              <small>{dueReason(entry)}</small>
              <ChevronRight aria-hidden="true" size={16} />
            </Link>
          ))}
          {dueEntries.length > OVERVIEW_REVIEW_LIMIT ? (
            <Link className="review-overview-more" href="/revisoes">
              Mais {dueEntries.length - OVERVIEW_REVIEW_LIMIT} na fila
              <ChevronRight aria-hidden="true" size={15} />
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="review-queue-empty">
          <Check aria-hidden="true" size={18} />
          <strong>Nenhuma revisão pendente.</strong>
        </div>
      )}
    </Panel>
  );
}
