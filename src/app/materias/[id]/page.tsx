"use client";

import { ArrowLeft, Edit, ExternalLink, FileText, Folder, FolderPlus, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AssessmentModal } from "@/components/assessment-modal";
import { DemandModal } from "@/components/demand-modal";
import { useAppData } from "@/components/data-provider";
import { MaterialModal } from "@/components/material-modal";
import { SubjectModal } from "@/components/subject-modal";
import { TaskProgress, type TaskProgressValue } from "@/components/task-progress";
import { TopicManager } from "@/components/topic-manager";
import { EmptyState, Panel, StatusPill } from "@/components/ui";
import { assessmentDaysText, nextAssessment, topicProgress } from "@/lib/academic";
import { formatDate } from "@/lib/date";
import {
  assessmentStatusLabels,
  assessmentTypeLabels,
  demandStatusLabels,
  demandTypeLabels,
  priorityLabels,
} from "@/lib/labels";
import { sortDemandsByPriorityAndDate } from "@/lib/priority";
import type { Assessment, Demand, Material, MaterialFolder } from "@/types/domain";

type SubjectTab = "overview" | "tasks" | "content" | "assessments" | "grades" | "materials";

const tabs: Array<{ id: SubjectTab; label: string }> = [
  { id: "overview", label: "Visão geral" },
  { id: "tasks", label: "Tarefas" },
  { id: "content", label: "Conteúdo" },
  { id: "assessments", label: "Avaliações" },
  { id: "grades", label: "Notas" },
  { id: "materials", label: "Materiais" },
];

export default function SubjectDetailPage() {
  const params = useParams<{ id: string }>();
  const {
    subjects,
    demands,
    demandQuestionItems,
    demandQuestions,
    assessments,
    assessmentTopics,
    materialFolders,
    materials,
    topics,
    loading,
    completeDemand,
    getMaterialUrl,
    removeDemand,
    removeAssessment,
    removeMaterial,
    removeMaterialFolder,
    upsertMaterial,
    upsertMaterialFolder,
  } = useAppData();
  const [tab, setTab] = useState<SubjectTab>("overview");
  const [editSubjectOpen, setEditSubjectOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  const [editingDemand, setEditingDemand] = useState<Demand | null>(null);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [materialUrls, setMaterialUrls] = useState<Record<string, string>>({});
  const [draggedMaterialId, setDraggedMaterialId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<MaterialFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const subject = subjects.find((item) => item.id === params.id);

  const subjectDemands = useMemo(
    () => sortDemandsByPriorityAndDate(demands.filter((demand) => demand.subject_id === params.id)),
    [demands, params.id],
  );
  const subjectTopics = useMemo(
    () => topics.filter((topic) => topic.subject_id === params.id).sort((a, b) => a.order_index - b.order_index),
    [params.id, topics],
  );
  const subjectAssessments = useMemo(
    () =>
      assessments
        .filter((assessment) => assessment.subject_id === params.id)
        .sort((a, b) => new Date(`${a.date ?? "2999-12-31"}T12:00:00`).getTime() - new Date(`${b.date ?? "2999-12-31"}T12:00:00`).getTime()),
    [assessments, params.id],
  );

  useEffect(() => {
    if (tab !== "materials") return;
    const pageMaterials = materials.filter((material) => material.subject_id === params.id);
    let active = true;

    async function loadMaterialUrls() {
      const entries = await Promise.all(
        pageMaterials.map(async (material) => {
          try {
            return [material.id, await getMaterialUrl(material)] as const;
          } catch {
            return [material.id, ""] as const;
          }
        }),
      );
      if (!active) return;
      setMaterialUrls(Object.fromEntries(entries));
    }

    void loadMaterialUrls();
    return () => {
      active = false;
    };
  }, [getMaterialUrl, materials, params.id, tab]);

  if (loading) {
    return (
      <Panel className="plain-section loading-panel">
        <p className="eyebrow">UniFlow</p>
        <h1>Carregando materia...</h1>
      </Panel>
    );
  }

  if (!subject) {
    return (
      <Panel className="plain-section">
        <h1>Matéria não encontrada</h1>
        <Link className="link-button" href="/">Voltar</Link>
      </Panel>
    );
  }

  const subjectId = subject.id;
  const upcomingAssessment = nextAssessment(assessments, subject.id);
  const nextTask = subjectDemands.find((demand) => demand.status !== "concluido") ?? null;
  const progress = topicProgress(subjectTopics);
  const upcomingAssessments = subjectAssessments.filter((assessment) => assessment.status === "futura");
  const completedAssessments = subjectAssessments.filter((assessment) => assessment.status !== "futura");
  const gradedAssessments = subjectAssessments.filter((assessment) => assessment.score !== null && assessment.max_score);
  const subjectMaterials = materials.filter((material) => material.subject_id === subject.id);
  const subjectFolders = materialFolders
    .filter((folder) => folder.subject_id === subject.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const looseMaterials = subjectMaterials.filter((material) => !material.folder_id);
  const activeFolder = activeFolderId ? subjectFolders.find((folder) => folder.id === activeFolderId) ?? null : null;
  const activeFolderName = activeFolder?.name ?? "";
  const activeMaterials = activeFolderId
    ? subjectMaterials.filter((material) => material.folder_id === activeFolderId)
    : [];
  const gradeAverage = gradedAssessments.length
    ? gradedAssessments.reduce((sum, assessment) => sum + ((assessment.score ?? 0) / (assessment.max_score || 1)) * 10, 0) / gradedAssessments.length
    : null;

  function assessmentTopicsText(assessment: Assessment) {
    const names = assessmentTopics
      .filter((item) => item.assessment_id === assessment.id)
      .map((item) => topics.find((topic) => topic.id === item.topic_id)?.title)
      .filter(Boolean);
    return names.join(", ");
  }

  function renderAssessment(assessment: Assessment, result = false) {
    return (
      <article className="simple-row" key={assessment.id}>
        <div>
          <strong>{assessment.name}</strong>
          <small>{assessmentTypeLabels[assessment.type]} - {formatDate(assessment.date)} - Peso {assessment.weight ?? "-"}%</small>
          {result ? <small>{assessment.score ?? "-"} / {assessment.max_score ?? "-"}</small> : null}
          {assessmentTopicsText(assessment) ? <small>Conteúdo: {assessmentTopicsText(assessment)}</small> : null}
        </div>
        <StatusPill tone={assessment.status}>{assessmentStatusLabels[assessment.status]}</StatusPill>
        <div className="row-actions">
          <button className="icon-button" onClick={() => setEditingAssessment(assessment)} type="button"><Edit size={15} /></button>
          <button className="icon-button danger" onClick={() => removeAssessment(assessment.id)} type="button"><Trash2 size={15} /></button>
        </div>
      </article>
    );
  }

  function detailedDemandProgress(demand: Demand): TaskProgressValue | null {
    const questionIds = demandQuestions
      .filter((question) => question.demand_id === demand.id)
      .map((question) => question.id);
    if (!questionIds.length) return null;
    const items = demandQuestionItems.filter((item) => questionIds.includes(item.question_id));
    if (!items.length) return null;
    const completed = items.filter((item) => item.done).length;
    return {
      total: items.length,
      completed,
      percent: Math.min(100, Math.round((completed / items.length) * 100)),
      label: "itens",
    };
  }

  async function moveMaterialToFolder(materialId: string, folderId: string | null) {
    const material = subjectMaterials.find((item) => item.id === materialId);
    if (!material) return;
    if ((material.folder_id ?? null) === folderId) return;
    setMaterialError(null);
    try {
      await upsertMaterial({ ...material, folder_id: folderId });
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Nao foi possivel mover o material.");
    } finally {
      setDraggedMaterialId(null);
      setDropTargetId(null);
    }
  }

  function openFolderModal(folder?: MaterialFolder) {
    setEditingFolder(folder ?? null);
    setFolderName(folder?.name ?? "");
    setFolderError(null);
    setFolderOpen(true);
  }

  async function saveFolder(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = folderName.trim();
    if (!trimmed) return;
    setSavingFolder(true);
    setFolderError(null);
    try {
      await upsertMaterialFolder({
        id: editingFolder?.id ?? crypto.randomUUID(),
        subject_id: subjectId,
        name: trimmed,
        created_at: editingFolder?.created_at ?? new Date().toISOString(),
      });
      setFolderName("");
      setEditingFolder(null);
      setFolderOpen(false);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Nao foi possivel salvar a pasta.");
    } finally {
      setSavingFolder(false);
    }
  }

  async function deleteFolder(folderId: string, folderName: string) {
    const ok = window.confirm(`Excluir a pasta "${folderName}"? Os materiais dela continuam soltos em Materiais.`);
    if (!ok) return;
    setMaterialError(null);
    try {
      await removeMaterialFolder(folderId);
      if (activeFolderId === folderId) setActiveFolderId(null);
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Nao foi possivel excluir a pasta.");
    }
  }

  function renderDropTarget(id: string | null, label: string) {
    const targetId = id ?? "root";
    return (
      <button
        className={`folder-drop-target ${dropTargetId === targetId ? "drop-active" : ""}`}
        onDragEnter={() => setDropTargetId(targetId)}
        onDragLeave={() => setDropTargetId(null)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          void moveMaterialToFolder(event.dataTransfer.getData("text/plain"), id);
        }}
        type="button"
      >
        <Folder size={15} />
        {label}
      </button>
    );
  }

  function renderMaterial(material: Material) {
    const href = materialUrls[material.id] || undefined;
    return (
      <article
        className={`simple-row material-row ${draggedMaterialId === material.id ? "dragging" : ""}`}
        draggable
        key={material.id}
        onDragEnd={() => setDraggedMaterialId(null)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", material.id);
          setDraggedMaterialId(material.id);
          setMaterialError(null);
        }}
      >
        {material.type === "file" ? <FileText size={18} /> : <LinkIcon size={18} />}
        <strong>{material.name}</strong>
        <div className="row-actions">
          {href ? (
            <a className="icon-button" href={href} rel="noreferrer" target="_blank" title="Abrir"><ExternalLink size={15} /></a>
          ) : (
            <button className="icon-button" disabled title="Preparando link" type="button"><ExternalLink size={15} /></button>
          )}
          <button className="icon-button danger" onClick={() => removeMaterial(material)} title="Excluir" type="button"><Trash2 size={15} /></button>
        </div>
      </article>
    );
  }

  return (
    <>
      <header className="subject-page-header">
        <div>
          <p className="subject-kicker" style={{ color: subject.color }}>{subject.code}</p>
          <h1>{subject.name}</h1>
          {subject.notes ? <p className="subject-note">{subject.notes}</p> : null}
        </div>
        <button className="ghost-action" onClick={() => setEditSubjectOpen(true)} type="button">
          <Edit size={16} />Editar
        </button>
      </header>

      <nav className="subject-tabs">
        {tabs.map((item) => (
          <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button">
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <Panel className="plain-section">
          <div className="subject-overview">
            <section>
              <h2>Próximo prazo</h2>
              {nextTask ? (
                <div className="line-block">
                  <strong>{nextTask.title}</strong>
                  <small>{[nextTask.due_date ? formatDate(nextTask.due_date) : null, demandTypeLabels[nextTask.type]].filter(Boolean).join(" - ")}</small>
                  <TaskProgress demand={nextTask} progress={detailedDemandProgress(nextTask)} />
                </div>
              ) : <p className="muted compact-note">Nenhuma tarefa pendente.</p>}
            </section>
            <section>
              <h2>Próxima avaliação</h2>
              {upcomingAssessment ? (
                <div className="line-block">
                  <strong>{upcomingAssessment.name}</strong>
                  <small>{formatDate(upcomingAssessment.date)} - {assessmentDaysText(upcomingAssessment)}</small>
                </div>
              ) : <p className="muted compact-note">Nenhuma avaliação futura.</p>}
            </section>
            <section>
              <h2>Conteúdo</h2>
              <div className="line-block">
                <strong>{progress.done} de {progress.total} tópicos concluídos</strong>
                <div className="progress-track subtle"><span style={{ width: `${progress.percent}%` }} /></div>
              </div>
            </section>
            <section>
              <h2>Tarefas</h2>
              <div className="line-block">
                <strong>{subjectDemands.filter((demand) => demand.status !== "concluido").length} pendentes</strong>
              </div>
            </section>
          </div>
        </Panel>
      ) : null}

      {tab === "tasks" ? (
        <Panel className="plain-section">
          <div className="section-tools">
            <h2>Tarefas</h2>
            <button className="ghost-action" onClick={() => setDemandOpen(true)} type="button"><Plus size={16} />Nova tarefa</button>
          </div>
          <div className="quiet-list">
            {subjectDemands.map((demand) => (
              <article className={`simple-row task-row ${demand.status === "concluido" ? "done" : ""}`} key={demand.id}>
                <button aria-label={demand.status === "concluido" ? "Marcar como pendente" : "Marcar como concluída"} className={`check-button ${demand.status === "concluido" ? "checked" : ""}`} onClick={() => completeDemand(demand)} type="button">
                  {demand.status === "concluido" ? "✓" : ""}
                </button>
                <div>
                  <Link className="task-title-button" href={`/tarefas/${demand.id}`} target="_blank">
                    {demand.title}
                  </Link>
                  <small>{[demand.due_date ? formatDate(demand.due_date) : null, demandTypeLabels[demand.type], demandStatusLabels[demand.status]].filter(Boolean).join(" - ")}</small>
                  <TaskProgress demand={demand} progress={detailedDemandProgress(demand)} />
                </div>
                <StatusPill tone={demand.priority}>{priorityLabels[demand.priority]}</StatusPill>
                <div className="row-actions">
                  <button className="icon-button" onClick={() => setEditingDemand(demand)} type="button"><Edit size={15} /></button>
                  <button className="icon-button danger" onClick={() => removeDemand(demand.id)} type="button"><Trash2 size={15} /></button>
                </div>
              </article>
            ))}
            {!subjectDemands.length ? <EmptyState text="Nenhuma tarefa ainda." /> : null}
          </div>
        </Panel>
      ) : null}

      {tab === "content" ? (
        <Panel className="plain-section">
          <h2>Conteúdo</h2>
          <div className="compact-progress">
            <strong>{progress.done} de {progress.total} concluídos</strong>
          </div>
          <TopicManager subject={subject} />
        </Panel>
      ) : null}

      {tab === "assessments" ? (
        <Panel className="plain-section">
          <div className="section-tools">
          <h2>Avaliações</h2>
            <button className="ghost-action" onClick={() => setAssessmentOpen(true)} type="button"><Plus size={16} />Nova avaliação</button>
          </div>
          <h3 className="subsection-title">Próximas</h3>
          <div className="quiet-list">
            {upcomingAssessments.length ? upcomingAssessments.map((assessment) => renderAssessment(assessment)) : <p className="muted compact-note">Nenhuma avaliação futura.</p>}
          </div>
          <h3 className="subsection-title">Realizadas</h3>
          <div className="quiet-list">
            {completedAssessments.length ? completedAssessments.map((assessment) => renderAssessment(assessment, true)) : <p className="muted compact-note">Nenhuma avaliação realizada.</p>}
          </div>
        </Panel>
      ) : null}

      {tab === "grades" ? (
        <Panel className="plain-section">
          <h2>Notas</h2>
          <div className="quiet-list">
            {gradedAssessments.map((assessment) => (
              <article className="simple-row" key={assessment.id}>
                <strong>{assessment.name}</strong>
                <small>{assessment.score} / {assessment.max_score}</small>
              </article>
            ))}
            {!gradedAssessments.length ? <p className="muted compact-note">Nenhuma nota ainda.</p> : null}
          </div>
          <div className="partial-average">
            <span>Média parcial</span>
            <strong>{gradeAverage === null ? "-" : gradeAverage.toFixed(1)}</strong>
          </div>
        </Panel>
      ) : null}

      {tab === "materials" ? (
        <Panel className="plain-section">
          <div className="section-tools">
            <h2>Materiais</h2>
            <div className="section-actions">
              <button className="ghost-action" onClick={() => openFolderModal()} type="button"><FolderPlus size={16} />Nova pasta</button>
              <button className="ghost-action" onClick={() => setMaterialOpen(true)} type="button"><Plus size={16} />Adicionar material</button>
            </div>
          </div>
          {materialError ? <p className="form-message error-message">{materialError}</p> : null}
          <div className="material-browser">
            {!activeFolderId ? (
              <>
                {subjectFolders.map((folder) => {
                  const folderMaterials = subjectMaterials.filter((material) => material.folder_id === folder.id);
                  return (
                    <section
                      className={`material-folder material-folder-card ${dropTargetId === folder.id ? "drop-active" : ""}`}
                      key={folder.id}
                      onDragEnter={() => setDropTargetId(folder.id)}
                      onDragLeave={() => setDropTargetId(null)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void moveMaterialToFolder(event.dataTransfer.getData("text/plain"), folder.id);
                      }}
                    >
                      <button className="material-folder-open" onClick={() => setActiveFolderId(folder.id)} type="button">
                        <Folder size={18} />
                        <strong>{folder.name}</strong>
                        <span>{folderMaterials.length}</span>
                      </button>
                      <div className="row-actions">
                        <button className="icon-button" onClick={() => openFolderModal(folder)} title="Renomear pasta" type="button">
                          <Edit size={15} />
                        </button>
                        <button className="icon-button danger" onClick={() => deleteFolder(folder.id, folder.name)} title="Excluir pasta" type="button">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </section>
                  );
                })}
                {looseMaterials.length ? (
                  <div className={`loose-materials ${dropTargetId === "root" ? "drop-active" : ""}`}>
                    <div className="loose-materials-header">
                      <strong>Materiais soltos</strong>
                      <span>{looseMaterials.length}</span>
                    </div>
                    <div className="quiet-list">
                      {looseMaterials.map((material) => renderMaterial(material))}
                    </div>
                  </div>
                ) : null}
                {!subjectMaterials.length && !subjectFolders.length ? <p className="muted compact-note">Nenhum material ainda.</p> : null}
              </>
            ) : (
              <section className="material-folder-detail">
                <div className="material-folder-detail-header">
                  <button className="ghost-action" onClick={() => setActiveFolderId(null)} type="button"><ArrowLeft size={16} />Voltar</button>
                  <div>
                    <strong>{activeFolderName}</strong>
                    <small>{activeMaterials.length} materiais</small>
                  </div>
                  {activeFolder ? (
                    <div className="row-actions">
                      <button className="icon-button" onClick={() => openFolderModal(activeFolder)} title="Renomear pasta" type="button">
                        <Edit size={15} />
                      </button>
                      <button className="icon-button danger" onClick={() => deleteFolder(activeFolder.id, activeFolder.name)} title="Excluir pasta" type="button">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
                {subjectFolders.length > 1 || activeFolderId ? (
                  <div className="folder-drop-row">
                    <span>Mover para</span>
                    {subjectFolders.filter((folder) => folder.id !== activeFolderId).map((folder) => renderDropTarget(folder.id, folder.name))}
                    {renderDropTarget(null, "Materiais")}
                  </div>
                ) : null}
                <div className="quiet-list">
                  {activeMaterials.map((material) => renderMaterial(material))}
                  {!activeMaterials.length ? <p className="muted compact-note">Pasta vazia.</p> : null}
                </div>
              </section>
            )}
          </div>
        </Panel>
      ) : null}

      <SubjectModal open={editSubjectOpen} subject={subject} onClose={() => setEditSubjectOpen(false)} />
      <DemandModal open={demandOpen} subjectId={subject.id} onClose={() => setDemandOpen(false)} />
      <DemandModal open={Boolean(editingDemand)} demand={editingDemand} onClose={() => setEditingDemand(null)} />
      <AssessmentModal open={assessmentOpen} subjectId={subject.id} onClose={() => setAssessmentOpen(false)} />
      <AssessmentModal open={Boolean(editingAssessment)} assessment={editingAssessment} onClose={() => setEditingAssessment(null)} />
      <MaterialModal folders={subjectFolders} open={materialOpen} subjectId={subject.id} onClose={() => setMaterialOpen(false)} />
      {folderOpen ? (
        <div className="modal-backdrop">
          <form className="modal form-stack compact-modal" onSubmit={saveFolder}>
            <div className="modal-header">
              <h2>{editingFolder ? "Renomear pasta" : "Nova pasta"}</h2>
              <button className="icon-button" onClick={() => {
                setFolderOpen(false);
                setEditingFolder(null);
              }} type="button">x</button>
            </div>
            <label>Nome<input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} required /></label>
            {folderError ? <p className="form-message error-message">{folderError}</p> : null}
            <button className={`primary-button full ${savingFolder ? "is-loading" : ""}`} disabled={savingFolder} type="submit">
              {savingFolder ? "Salvando..." : editingFolder ? "Salvar nome" : "Criar pasta"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
