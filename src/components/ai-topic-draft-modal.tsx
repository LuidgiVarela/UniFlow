"use client";

import { Check, FileText, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { extractPdfText } from "@/lib/pdf-text";
import { supabase } from "@/lib/supabase/client";
import type { Assessment, Material, Subject, Topic } from "@/types/domain";

type DraftTopic = {
  id: string;
  selected: boolean;
  title: string;
  summary: string;
  sourceReferences: string[];
  duplicate: boolean;
};

type AiTopicDraftModalProps = {
  assessment: Assessment;
  linkedMaterialIds: string[];
  materials: Material[];
  subject: Subject;
  topics: Topic[];
  onClose: () => void;
};

function isPdf(material: Material) {
  return material.type === "file" && (/\.pdf$/i.test(material.name) || /\.pdf(?:$|\?)/i.test(material.file_path ?? ""));
}

export function AiTopicDraftModal({
  assessment,
  linkedMaterialIds,
  materials,
  subject,
  topics,
  onClose,
}: AiTopicDraftModalProps) {
  const { addAssessmentTopics, getMaterialUrl, upsertTopic } = useAppData();
  const pdfMaterials = useMemo(() => materials.filter(isPdf), [materials]);
  const linkedPdfIds = linkedMaterialIds.filter((id) => pdfMaterials.some((material) => material.id === id));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(linkedPdfIds.length ? linkedPdfIds : pdfMaterials.map((material) => material.id)),
  );
  const [desiredCount, setDesiredCount] = useState(10);
  const [drafts, setDrafts] = useState<DraftTopic[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [extractionNote, setExtractionNote] = useState<string | null>(null);

  async function generateDraft() {
    const selected = pdfMaterials.filter((material) => selectedIds.has(material.id));
    if (!selected.length) {
      setError("Selecione ao menos um PDF.");
      return;
    }
    setError(null);
    setDrafts(null);
    setExtractionNote(null);
    try {
      const sources = [];
      let truncatedCount = 0;
      for (const [index, material] of selected.entries()) {
        setProgress(`Lendo ${index + 1} de ${selected.length}: ${material.name}`);
        const href = await getMaterialUrl(material);
        const source = await extractPdfText(material.name, href);
        if (source.text.trim()) sources.push({ name: source.name, text: source.text });
        if (source.truncated) truncatedCount += 1;
      }
      if (!sources.length) throw new Error("Os PDFs selecionados não possuem texto pesquisável. Arquivos escaneados precisam de OCR.");

      setProgress("Organizando o rascunho...");
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Entre novamente no UniFlow para usar a geração por IA.");
      const response = await fetch("/api/ai/topics", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subjectName: subject.name,
          assessmentName: assessment.name,
          count: desiredCount,
          sources,
        }),
      });
      const result = await response.json() as {
        error?: string;
        topics?: Array<{ title: string; summary: string; sourceReferences: string[] }>;
      };
      if (!response.ok || !result.topics) throw new Error(result.error || "Não foi possível gerar os tópicos.");
      const existingTitles = new Set(topics.map((topic) => topic.title.trim().toLocaleLowerCase("pt-BR")));
      setDrafts(result.topics.map((topic) => {
        const duplicate = existingTitles.has(topic.title.trim().toLocaleLowerCase("pt-BR"));
        return {
          id: crypto.randomUUID(),
          selected: !duplicate,
          title: topic.title,
          summary: topic.summary,
          sourceReferences: topic.sourceReferences,
          duplicate,
        };
      }));
      if (truncatedCount) {
        setExtractionNote(`${truncatedCount} ${truncatedCount === 1 ? "PDF foi parcialmente lido" : "PDFs foram parcialmente lidos"} por serem muito extensos.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível analisar os PDFs.");
    } finally {
      setProgress(null);
    }
  }

  async function saveDrafts() {
    const selected = drafts?.filter((draft) => draft.selected && draft.title.trim()) ?? [];
    if (!selected.length) {
      setError("Selecione ao menos um tópico do rascunho.");
      return;
    }
    setSaving(true);
    setError(null);
    const createdIds: string[] = [];
    const firstOrder = Math.max(0, ...topics.map((topic) => topic.order_index)) + 1;
    try {
      for (const [index, draft] of selected.entries()) {
        const id = crypto.randomUUID();
        const references = draft.sourceReferences.length ? `\n\nFontes: ${draft.sourceReferences.join("; ")}` : "";
        await upsertTopic({
          id,
          subject_id: subject.id,
          title: draft.title.trim(),
          status: "nao_iniciado",
          order_index: firstOrder + index,
          notes: `${draft.summary.trim()}${references}`.trim(),
          mastery_level: 0,
          last_reviewed_at: null,
          next_review_date: null,
          created_at: new Date().toISOString(),
        });
        createdIds.push(id);
      }
      await addAssessmentTopics(assessment.id, createdIds);
      onClose();
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "Não foi possível concluir o vínculo com a avaliação.";
      setError(createdIds.length
        ? `${createdIds.length} ${createdIds.length === 1 ? "tópico foi salvo" : "tópicos foram salvos"}, mas a operação não terminou. ${reason}`
        : reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section aria-labelledby="ai-topic-title" className="modal ai-topic-modal">
        <header className="modal-header">
          <div>
            <h2 id="ai-topic-title"><Sparkles aria-hidden="true" size={18} />Gerar tópicos dos PDFs</h2>
            <p>{assessment.name} · rascunho revisável antes de salvar</p>
          </div>
          <button aria-label="Fechar" className="icon-button" disabled={Boolean(progress) || saving} onClick={onClose} type="button"><X size={17} /></button>
        </header>

        {!drafts ? (
          <div className="ai-topic-source-step">
            <div className="ai-topic-source-heading">
              <strong>Materiais para analisar</strong>
              <label>
                <span>Quantidade aproximada</span>
                <input max={20} min={3} onChange={(event) => setDesiredCount(Number(event.target.value))} type="number" value={desiredCount} />
              </label>
            </div>
            <div className="ai-topic-material-list">
              {pdfMaterials.map((material) => (
                <label key={material.id}>
                  <input
                    checked={selectedIds.has(material.id)}
                    disabled={Boolean(progress)}
                    onChange={(event) => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(material.id);
                      else next.delete(material.id);
                      return next;
                    })}
                    type="checkbox"
                  />
                  <FileText aria-hidden="true" size={16} />
                  <span>{material.name}</span>
                  {linkedPdfIds.includes(material.id) ? <small>Nesta avaliação</small> : null}
                </label>
              ))}
              {!pdfMaterials.length ? <p className="muted compact-note">Nenhum PDF foi enviado nesta matéria.</p> : null}
            </div>
            <p className="ai-topic-cost-note">O texto extraído dos PDFs selecionados será enviado à API configurada no servidor e pode consumir créditos da conta vinculada.</p>
          </div>
        ) : (
          <div className="ai-topic-draft-step">
            {extractionNote ? <p className="form-message">{extractionNote}</p> : null}
            <div className="ai-topic-draft-list">
              {drafts.map((draft, index) => (
                <article className={draft.selected ? "selected" : ""} key={draft.id}>
                  <label className="ai-topic-draft-check">
                    <input
                      checked={draft.selected}
                      disabled={saving}
                      onChange={(event) => setDrafts((current) => current?.map((item) => item.id === draft.id ? { ...item, selected: event.target.checked } : item) ?? null)}
                      type="checkbox"
                    />
                    <span>{index + 1}</span>
                  </label>
                  <div>
                    <input
                      aria-label={`Título do tópico ${index + 1}`}
                      disabled={saving}
                      onChange={(event) => setDrafts((current) => current?.map((item) => item.id === draft.id ? { ...item, title: event.target.value, duplicate: false } : item) ?? null)}
                      value={draft.title}
                    />
                    <textarea
                      aria-label={`Observação do tópico ${index + 1}`}
                      disabled={saving}
                      onChange={(event) => setDrafts((current) => current?.map((item) => item.id === draft.id ? { ...item, summary: event.target.value } : item) ?? null)}
                      rows={3}
                      value={draft.summary}
                    />
                    <small>{draft.duplicate ? "Já existe um tópico com este nome" : draft.sourceReferences.join(" · ") || "Sem referência de página"}</small>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {error ? <p className="form-message error-message ai-topic-error" role="alert">{error}</p> : null}
        {progress ? <p className="ai-topic-progress" role="status"><span aria-hidden="true" className="app-operation-spinner" />{progress}</p> : null}

        <footer className="review-plan-footer">
          {drafts ? <button className="ghost-action" disabled={saving} onClick={() => setDrafts(null)} type="button">Voltar aos PDFs</button> : null}
          <button
            className={`primary-button${progress || saving ? " is-loading" : ""}`}
            disabled={Boolean(progress) || saving || (!drafts && !pdfMaterials.length)}
            onClick={() => void (drafts ? saveDrafts() : generateDraft())}
            type="button"
          >
            {!progress && !saving ? drafts ? <Check aria-hidden="true" size={16} /> : <Sparkles aria-hidden="true" size={16} /> : null}
            {progress ? "Analisando" : saving ? "Salvando" : drafts ? "Adicionar tópicos selecionados" : "Gerar rascunho"}
          </button>
        </footer>
      </section>
    </div>
  );
}
