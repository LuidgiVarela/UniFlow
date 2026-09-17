"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAppData } from "@/components/data-provider";
import { StudyDocumentEditor } from "@/components/study-document-editor";

export default function StudyDocumentPage() {
  const params = useParams<{ id: string }>();
  const { demandQuestionItems, demandQuestions, demands, subjects } = useAppData();
  const demand = demands.find((item) => item.id === params.id);
  const subject = demand ? subjects.find((item) => item.id === demand.subject_id) : null;

  if (!demand) {
    return (
      <section className="study-document-missing">
        <h1>Lista não encontrada</h1>
        <Link className="ghost-action" href="/"><ArrowLeft size={16} />Voltar</Link>
      </section>
    );
  }

  const questions = demandQuestions
    .filter((question) => question.demand_id === demand.id)
    .sort((a, b) => a.order_index - b.order_index)
    .map((question) => ({
      id: question.id,
      label: question.label.replace(/^Questao\b/i, "Questão"),
      items: demandQuestionItems
        .filter((item) => item.question_id === question.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((item) => item.label),
    }));

  return <StudyDocumentEditor demand={demand} questions={questions} subject={subject ?? null} />;
}
