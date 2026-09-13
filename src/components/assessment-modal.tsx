"use client";

import { FileText, Link2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { toIsoDate } from "@/lib/date";
import { assessmentStatusLabels, assessmentTypeLabels } from "@/lib/labels";
import type { Assessment, AssessmentStatus, AssessmentType, MaterialFolder } from "@/types/domain";

const types: AssessmentType[] = ["prova", "trabalho", "lista", "projeto", "seminario", "outro"];
const statuses: AssessmentStatus[] = ["futura", "realizada", "corrigida"];

function materialFolderPath(folderId: string | null | undefined, folders: MaterialFolder[]) {
  if (!folderId) return "Materiais";
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null | undefined = folderId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = foldersById.get(currentId);
    if (!folder) break;
    names.unshift(folder.name);
    currentId = folder.parent_folder_id;
  }
  return names.length ? `Materiais / ${names.join(" / ")}` : "Materiais";
}

function createBlankAssessment(subjectId: string): Assessment {
  return {
    id: crypto.randomUUID(),
    subject_id: subjectId,
    grade_component_id: null,
    name: "",
    type: "prova",
    date: toIsoDate(new Date()),
    weight: null,
    max_score: 10,
    score: null,
    description: "",
    status: "futura",
    created_at: new Date().toISOString(),
  };
}

export function AssessmentModal({
  open,
  onClose,
  assessment,
  subjectId,
}: {
  open: boolean;
  onClose: () => void;
  assessment?: Assessment | null;
  subjectId?: string;
}) {
  const {
    subjects,
    gradeComponents,
    topics,
    assessmentTopics,
    assessmentMaterials,
    materials,
    materialFolders,
    upsertAssessment,
  } = useAppData();
  const fallbackSubjectId = subjectId ?? subjects[0]?.id ?? "";
  const [form, setForm] = useState<Assessment>(createBlankAssessment(fallbackSubjectId));
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [scopeTab, setScopeTab] = useState<"topics" | "materials">("topics");
  const [materialSearch, setMaterialSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (assessment) {
        setForm(assessment);
        setSelectedTopics(
          assessmentTopics
            .filter((item) => item.assessment_id === assessment.id)
            .map((item) => item.topic_id),
        );
        setSelectedMaterials(
          assessmentMaterials
            .filter((item) => item.assessment_id === assessment.id)
            .map((item) => item.material_id),
        );
        setScopeTab("topics");
        setMaterialSearch("");
        return;
      }
      setForm(createBlankAssessment(fallbackSubjectId));
      setSelectedTopics([]);
      setSelectedMaterials([]);
      setScopeTab("topics");
      setMaterialSearch("");
      setError(null);
      setSaving(false);
    });
  }, [assessment, assessmentMaterials, assessmentTopics, fallbackSubjectId, open]);

  const availableTopics = useMemo(
    () => topics.filter((topic) => topic.subject_id === form.subject_id).sort((a, b) => a.order_index - b.order_index),
    [form.subject_id, topics],
  );
  const availableGradeComponents = useMemo(
    () => gradeComponents.filter((component) => component.subject_id === form.subject_id),
    [form.subject_id, gradeComponents],
  );
  const availableMaterials = useMemo(
    () => materials
      .filter((material) => material.subject_id === form.subject_id && (material.type === "file" || Boolean(material.url)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [form.subject_id, materials],
  );
  const filteredMaterials = useMemo(() => {
    const query = materialSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return availableMaterials;
    return availableMaterials.filter((material) => material.name.toLocaleLowerCase("pt-BR").includes(query));
  }, [availableMaterials, materialSearch]);
  const selectedGradeComponent = availableGradeComponents.find((component) => component.id === form.grade_component_id) ?? null;
  const showAssessmentWeight = !selectedGradeComponent || selectedGradeComponent.calculation === "weighted";

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertAssessment(
        {
          ...form,
          grade_component_id: form.grade_component_id || null,
          status: form.score !== null ? "corrigida" : form.status,
        },
        selectedTopics,
        selectedMaterials,
      );
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar a avaliação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal form-stack assessment-modal" onSubmit={submit}>
        <div className="modal-header">
          <h2>{assessment ? "Editar avaliação" : "Nova avaliação"}</h2>
          <button className="icon-button" onClick={onClose} type="button">x</button>
        </div>
        <label>Matéria<select value={form.subject_id} onChange={(e) => {
          setForm({ ...form, subject_id: e.target.value, grade_component_id: null });
          setSelectedTopics([]);
          setSelectedMaterials([]);
          setMaterialSearch("");
        }}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} - {subject.name}</option>)}</select></label>
        <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <div className="form-grid">
          <label>Tipo<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AssessmentType })}>{types.map((type) => <option key={type} value={type}>{assessmentTypeLabels[type]}</option>)}</select></label>
          <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AssessmentStatus })}>{statuses.map((status) => <option key={status} value={status}>{assessmentStatusLabels[status]}</option>)}</select></label>
        </div>
        <label>Critério de nota<select value={form.grade_component_id ?? ""} onChange={(e) => setForm({ ...form, grade_component_id: e.target.value || null })}>
          <option value="">Sem critério</option>
          {availableGradeComponents.map((component) => <option key={component.id} value={component.id}>{component.name}</option>)}
        </select></label>
        <div className="form-grid">
          <label>Data<input type="date" value={form.date ?? ""} onChange={(e) => setForm({ ...form, date: e.target.value || null })} /></label>
          {showAssessmentWeight ? (
            <label>{selectedGradeComponent ? "Peso dentro do critério" : "Peso (%)"}<input type="number" step="0.01" value={form.weight ?? ""} onChange={(e) => setForm({ ...form, weight: e.target.value ? Number(e.target.value) : null })} /></label>
          ) : (
            <div className="field-note">
              <span>Incluso no critério</span>
              <strong>{selectedGradeComponent.weight === null ? "Sem peso definido" : `${selectedGradeComponent.name} vale ${selectedGradeComponent.weight}% da nota`}</strong>
            </div>
          )}
        </div>
        <div className="form-grid">
          <label>Nota máxima<input type="number" step="0.01" value={form.max_score ?? ""} onChange={(e) => setForm({ ...form, max_score: e.target.value ? Number(e.target.value) : null })} /></label>
          <label>Nota obtida<input type="number" step="0.01" value={form.score ?? ""} onChange={(e) => setForm({ ...form, score: e.target.value ? Number(e.target.value) : null })} placeholder="Opcional" /></label>
        </div>
        <label>Descrição<textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <fieldset className="assessment-scope-picker">
          <legend>Preparação da avaliação</legend>
          <div aria-label="Tipo de conteúdo" className="assessment-scope-tabs" role="tablist">
            <button
              aria-selected={scopeTab === "topics"}
              className={scopeTab === "topics" ? "active" : ""}
              onClick={() => setScopeTab("topics")}
              role="tab"
              type="button"
            >
              Conteúdos <span>{selectedTopics.length}</span>
            </button>
            <button
              aria-selected={scopeTab === "materials"}
              className={scopeTab === "materials" ? "active" : ""}
              onClick={() => setScopeTab("materials")}
              role="tab"
              type="button"
            >
              Slides e materiais <span>{selectedMaterials.length}</span>
            </button>
          </div>

          {scopeTab === "topics" ? (
            <div className="assessment-picker-list" role="tabpanel">
              {availableTopics.length ? availableTopics.map((topic) => (
                <label className="checkbox-row assessment-picker-row" key={topic.id}>
                  <input
                    checked={selectedTopics.includes(topic.id)}
                    onChange={(e) => {
                      setSelectedTopics((current) =>
                        e.target.checked ? [...current, topic.id] : current.filter((id) => id !== topic.id),
                      );
                    }}
                    type="checkbox"
                  />
                  <span>{topic.title}</span>
                </label>
              )) : <p className="muted compact-note">Cadastre tópicos nesta matéria para vincular conteúdo.</p>}
            </div>
          ) : (
            <div className="assessment-material-picker" role="tabpanel">
              <label className="assessment-material-search">
                <Search size={15} />
                <input
                  aria-label="Buscar slide ou material"
                  onChange={(event) => setMaterialSearch(event.target.value)}
                  placeholder="Buscar pelo nome do arquivo"
                  value={materialSearch}
                />
              </label>
              <div className="assessment-picker-list">
                {filteredMaterials.length ? filteredMaterials.map((material) => (
                  <label className="checkbox-row assessment-picker-row material" key={material.id}>
                    <input
                      checked={selectedMaterials.includes(material.id)}
                      onChange={(event) => {
                        setSelectedMaterials((current) => event.target.checked
                          ? [...current, material.id]
                          : current.filter((id) => id !== material.id));
                      }}
                      type="checkbox"
                    />
                    {material.type === "file" ? <FileText size={16} /> : <Link2 size={16} />}
                    <span>
                      <strong>{material.name}</strong>
                      <small>{material.type === "file" ? materialFolderPath(material.folder_id, materialFolders) : "Link externo"}</small>
                    </span>
                  </label>
                )) : (
                  <p className="muted compact-note">
                    {availableMaterials.length ? "Nenhum material encontrado." : "Adicione materiais nesta matéria para vinculá-los."}
                  </p>
                )}
              </div>
            </div>
          )}
        </fieldset>
        {error ? <p className="form-message error-message">{error}</p> : null}
        <button className={`primary-button full ${saving ? "is-loading" : ""}`} disabled={!subjects.length || saving} type="submit">
          {saving ? "Salvando..." : "Salvar avaliação"}
        </button>
      </form>
    </div>
  );
}
