"use client";

import { BookOpenCheck, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useAppData } from "@/components/data-provider";
import { Panel } from "@/components/ui";
import { daysUntil } from "@/lib/date";
import {
  buildReviewEntries,
  completedReviewsOn,
  dueReason,
  localIsoDate,
  sortReviewEntries,
} from "@/lib/reviews";

const OVERVIEW_REVIEW_LIMIT = 3;

export function ReviewQueue() {
  const appData = useAppData();
  const entries = buildReviewEntries(appData);
  const today = localIsoDate();
  const entryByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const todayItems = appData.reviewQueueItems
    .filter((item) => item.queue_date === today)
    .sort((a, b) => a.sort_order - b.sort_order);
  const selectedEntries = todayItems
    .filter((item) => item.state === "planned")
    .map((item) => entryByKey.get(item.target_key))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const hiddenKeys = new Set(todayItems.filter((item) => item.state !== "available").map((item) => item.target_key));
  const suggestedEntries = sortReviewEntries(entries).filter((entry) => !hiddenKeys.has(entry.key));
  const visibleEntries = (selectedEntries.length ? selectedEntries : suggestedEntries).slice(0, OVERVIEW_REVIEW_LIMIT);
  const overdueCount = entries.filter((entry) => entry.nextReviewDate && daysUntil(entry.nextReviewDate) < 0).length;
  const completedToday = completedReviewsOn(today, appData.reviewEvents);

  return (
    <Panel className="plain-section review-overview-panel">
      <header className="review-overview-header">
        <div>
          <div className="review-queue-title-line">
            <BookOpenCheck aria-hidden="true" size={19} />
            <h2>{selectedEntries.length ? "Minha fila de hoje" : "Prioridades de revisão"}</h2>
          </div>
          <p className="review-queue-caption">
            {selectedEntries.length
              ? `${selectedEntries.length} ${selectedEntries.length === 1 ? "item escolhido" : "itens escolhidos"} · ${completedToday} concluídos`
              : `${suggestedEntries.length} ${suggestedEntries.length === 1 ? "opção priorizada" : "opções priorizadas"}${overdueCount ? ` · ${overdueCount} ${overdueCount === 1 ? "atrasada" : "atrasadas"}` : ""}`}
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
          {(selectedEntries.length ? selectedEntries.length : suggestedEntries.length) > OVERVIEW_REVIEW_LIMIT ? (
            <Link className="review-overview-more" href="/revisoes">
              Mais {(selectedEntries.length ? selectedEntries.length : suggestedEntries.length) - OVERVIEW_REVIEW_LIMIT}
              <ChevronRight aria-hidden="true" size={15} />
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="review-queue-empty">
          <Check aria-hidden="true" size={18} />
          <strong>Nenhuma revisão disponível.</strong>
        </div>
      )}
    </Panel>
  );
}
