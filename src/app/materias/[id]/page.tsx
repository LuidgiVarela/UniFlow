"use client";

import { Download, Edit, ExternalLink, FileText, Folder, FolderPlus, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AssessmentModal } from "@/components/assessment-modal";
import { DemandModal } from "@/components/demand-modal";
import { DemandDescriptionPreview } from "@/components/demand-description-preview";
import { useAppData } from "@/components/data-provider";
import { GradeCriteriaManager } from "@/components/grade-criteria-manager";
import { MaterialModal } from "@/components/material-modal";
import { SubjectModal } from "@/components/subject-modal";
import { getDetailedTaskProgress, TaskProgress } from "@/components/task-progress";
import { TopicManager } from "@/components/topic-manager";
import { EmptyState, Panel, StatusPill } from "@/components/ui";
import { assessmentDaysText, nextAssessment, topicProgress } from "@/lib/academic";
import { formatDate } from "@/lib/date";
import { supportsQuestionDashboard } from "@/lib/demands";
import { assessmentWeightText, isAssessmentUpcoming } from "@/lib/grades";
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

function sortMaterials(a: Material, b: Material) {
  const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function sortMaterialFolders(a: MaterialFolder, b: MaterialFolder) {
  const hasOrderA = a.sort_order !== null && a.sort_order !== undefined;
  const hasOrderB = b.sort_order !== null && b.sort_order !== undefined;
  if (hasOrderA && hasOrderB && a.sort_order !== b.sort_order) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (hasOrderA !== hasOrderB) return hasOrderA ? 1 : -1;
  return a.name.localeCompare(b.name);
}

function moveListItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function normalizedFolderParent(folder: MaterialFolder) {
  return folder.parent_folder_id ?? null;
}

function normalizedMaterialFolder(material: Material) {
  return material.folder_id ?? null;
}

function folderChildCount(folders: MaterialFolder[], folderId: string) {
  return folders.filter((folder) => normalizedFolderParent(folder) === folderId).length;
}

function zipSafeName(name: string, fallback: string) {
  const clean = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, " ");
  return clean || fallback;
}

function uniqueZipName(name: string, usedNames: Set<string>) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex > 0 ? name.slice(dotIndex) : "";
  let index = 2;
  let nextName = `${base} (${index})${extension}`;
  while (usedNames.has(nextName)) {
    index += 1;
    nextName = `${base} (${index})${extension}`;
  }
  usedNames.add(nextName);
  return nextName;
}

function isMiddleDrop(event: React.DragEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  return ratio > 0.28 && ratio < 0.72;
}

export default function SubjectDetailPage() {
  const params = useParams<{ id: string }>();
  const {
    subjects,
    demands,
    demandQuestionItems,
    demandQuestions,
    assessments,
    assessmentTopics,
    gradeComponents,
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
    reorderMaterialFolders,
    reorderMaterials,
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
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [materialUrls, setMaterialUrls] = useState<Record<string, string>>({});
  const [draggedMaterialId, setDraggedMaterialId] = useState<string | null>(null);
  const [dragOverMaterialId, setDragOverMaterialId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
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
  const subjectMaterials = useMemo(
    () => materials.filter((material) => material.subject_id === params.id).sort(sortMaterials),
    [materials, params.id],
  );
  const subjectFolders = useMemo(
    () => materialFolders.filter((folder) => folder.subject_id === params.id).sort(sortMaterialFolders),
    [materialFolders, params.id],
  );
  const folderById = useMemo(() => new Map(subjectFolders.map((folder) => [folder.id, folder])), [subjectFolders]);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      setActiveFolderId(event.state?.uniflowMaterialFolderId ?? null);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (tab !== "materials") return;
    let active = true;

    async function loadMaterialUrls() {
      const entries = await Promise.all(
        subjectMaterials.map(async (material) => {
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
    const refreshTimer = window.setInterval(() => {
      void loadMaterialUrls();
    }, 1000 * 60 * 30);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [getMaterialUrl, subjectMaterials, tab]);

  if (loading) {
    return (
      <Panel className="plain-section loading-panel">
        <p className="eyebrow">UniFlow</p>
        <h1>Carregando matéria...</h1>
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
  const subjectCode = subject.code;
  const upcomingAssessment = nextAssessment(assessments, subject.id);
  const nextTask = subjectDemands.find((demand) => demand.status !== "concluido") ?? null;
  const progress = topicProgress(subjectTopics);
  const upcomingAssessments = subjectAssessments.filter(isAssessmentUpcoming);
  const completedAssessments = subjectAssessments.filter((assessment) => !isAssessmentUpcoming(assessment));
  const activeFolder = activeFolderId ? folderById.get(activeFolderId) ?? null : null;
  const currentFolderId = activeFolder?.id ?? null;
  const currentFolders = subjectFolders.filter((folder) => normalizedFolderParent(folder) === currentFolderId);
  const currentMaterials = subjectMaterials.filter((material) => normalizedMaterialFolder(material) === currentFolderId);
  const folderPath = activeFolder
    ? (() => {
        const path: MaterialFolder[] = [];
        const visited = new Set<string>();
        let current: MaterialFolder | undefined = activeFolder;
        while (current && !visited.has(current.id)) {
          path.unshift(current);
          visited.add(current.id);
          current = current.parent_folder_id ? folderById.get(current.parent_folder_id) : undefined;
        }
        return path;
      })()
    : [];
  const materialFolderOptions = subjectFolders.map((folder) => {
    const path: string[] = [];
    const visited = new Set<string>();
    let current: MaterialFolder | undefined = folder;
    while (current && !visited.has(current.id)) {
      path.unshift(current.name);
      visited.add(current.id);
      current = current.parent_folder_id ? folderById.get(current.parent_folder_id) : undefined;
    }
    return { ...folder, name: path.join(" / ") };
  });
  const currentDropTargetId = `current-folder:${currentFolderId ?? "root"}`;

  function assessmentTopicsText(assessment: Assessment) {
    const names = assessmentTopics
      .filter((item) => item.assessment_id === assessment.id)
      .map((item) => topics.find((topic) => topic.id === item.topic_id)?.title)
      .filter(Boolean);
    return names.join(", ");
  }

  function isFolderDescendant(folderId: string, possibleAncestorId: string) {
    const visited = new Set<string>();
    let current = folderById.get(folderId);
    while (current?.parent_folder_id && !visited.has(current.id)) {
      if (current.parent_folder_id === possibleAncestorId) return true;
      visited.add(current.id);
      current = folderById.get(current.parent_folder_id);
    }
    return false;
  }

  function openMaterialFolder(folderId: string) {
    window.history.pushState({ uniflowMaterialFolderId: folderId }, "", window.location.href);
    setActiveFolderId(folderId);
  }

  function goToMaterialFolder(folderId: string | null) {
    window.history.pushState({ uniflowMaterialFolderId: folderId }, "", window.location.href);
    setActiveFolderId(folderId);
  }

  function closeMaterialFolder() {
    if (window.history.state?.uniflowMaterialFolderId) {
      window.history.back();
      return;
    }
    setActiveFolderId(null);
  }

  function renderAssessment(assessment: Assessment, result = false) {
    const gradeComponent = gradeComponents.find((component) => component.id === assessment.grade_component_id) ?? null;
    return (
      <article className="simple-row assessment-list-row" key={assessment.id}>
        <div className="demand-main">
          <strong>{assessment.name}</strong>
          <div className="demand-meta">
            {[assessmentTypeLabels[assessment.type], formatDate(assessment.date), assessmentWeightText(assessment, gradeComponent)].filter(Boolean).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
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

  async function moveMaterialToFolder(materialId: string, folderId: string | null) {
    const material = subjectMaterials.find((item) => item.id === materialId);
    if (!material) return;
    if ((material.folder_id ?? null) === folderId) {
      setDraggedMaterialId(null);
      setDragOverMaterialId(null);
      setDropTargetId(null);
      return;
    }
    const targetItems = subjectMaterials.filter((item) => (item.folder_id ?? null) === folderId);
    setMaterialError(null);
    try {
      await upsertMaterial({ ...material, folder_id: folderId, sort_order: targetItems.length + 1 });
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Não foi possível mover o material.");
    } finally {
      setDraggedMaterialId(null);
      setDragOverMaterialId(null);
      setDropTargetId(null);
    }
  }

  async function reorderMaterialList(sourceId: string, targetId: string) {
    const source = subjectMaterials.find((material) => material.id === sourceId);
    const target = subjectMaterials.find((material) => material.id === targetId);
    if (!source || !target) return;
    const folderId = source.folder_id ?? null;
    if ((target.folder_id ?? null) !== folderId) return;

    const currentList = subjectMaterials.filter((material) => (material.folder_id ?? null) === folderId);
    const fromIndex = currentList.findIndex((material) => material.id === sourceId);
    const toIndex = currentList.findIndex((material) => material.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const orderedMaterials = moveListItem(currentList, fromIndex, toIndex).map((material, index) => ({
      ...material,
      sort_order: index + 1,
    }));

    setMaterialError(null);
    try {
      await reorderMaterials(orderedMaterials);
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Não foi possível reorganizar os materiais.");
    } finally {
      setDraggedMaterialId(null);
      setDragOverMaterialId(null);
      setDropTargetId(null);
    }
  }

  async function reorderFolderList(sourceId: string, targetId: string) {
    const source = subjectFolders.find((folder) => folder.id === sourceId);
    const target = subjectFolders.find((folder) => folder.id === targetId);
    if (!source || !target) return;
    const parentFolderId = normalizedFolderParent(source);
    if (normalizedFolderParent(target) !== parentFolderId) return;

    const currentList = subjectFolders.filter((folder) => normalizedFolderParent(folder) === parentFolderId);
    const fromIndex = currentList.findIndex((folder) => folder.id === sourceId);
    const toIndex = currentList.findIndex((folder) => folder.id === targetId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const orderedFolders = moveListItem(currentList, fromIndex, toIndex).map((folder, index) => ({
      ...folder,
      sort_order: index + 1,
    }));

    setMaterialError(null);
    try {
      await reorderMaterialFolders(orderedFolders);
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Não foi possível reorganizar as pastas.");
    } finally {
      setDraggedFolderId(null);
      setDragOverFolderId(null);
      setDropTargetId(null);
    }
  }

  async function moveFolderToParent(folderId: string, parentFolderId: string | null) {
    const folder = subjectFolders.find((item) => item.id === folderId);
    if (!folder) return;
    if (folder.id === parentFolderId || (parentFolderId && isFolderDescendant(parentFolderId, folder.id))) {
      setMaterialError("Não dá para mover uma pasta para dentro dela mesma.");
      setDraggedFolderId(null);
      setDragOverFolderId(null);
      setDropTargetId(null);
      return;
    }
    if (normalizedFolderParent(folder) === parentFolderId) {
      setDraggedFolderId(null);
      setDragOverFolderId(null);
      setDropTargetId(null);
      return;
    }

    const targetFolders = subjectFolders.filter((item) => normalizedFolderParent(item) === parentFolderId);
    setMaterialError(null);
    try {
      await upsertMaterialFolder({ ...folder, parent_folder_id: parentFolderId, sort_order: targetFolders.length + 1 });
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Não foi possível mover a pasta.");
    } finally {
      setDraggedFolderId(null);
      setDragOverFolderId(null);
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
        parent_folder_id: editingFolder ? editingFolder.parent_folder_id ?? null : currentFolderId,
        name: trimmed,
        sort_order: editingFolder?.sort_order ?? currentFolders.length + 1,
        created_at: editingFolder?.created_at ?? new Date().toISOString(),
      });
      setFolderName("");
      setEditingFolder(null);
      setFolderOpen(false);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Não foi possível salvar a pasta.");
    } finally {
      setSavingFolder(false);
    }
  }

  async function deleteFolder(folderId: string, folderName: string) {
    const ok = window.confirm(`Excluir a pasta "${folderName}"? Os materiais e subpastas diretos dela continuam soltos em Materiais.`);
    if (!ok) return;
    setMaterialError(null);
    try {
      await removeMaterialFolder(folderId);
      if (activeFolderId === folderId) closeMaterialFolder();
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Não foi possível excluir a pasta.");
    }
  }

  async function downloadCurrentFolderZip() {
    setMaterialError(null);
    setZipStatus("Preparando ZIP...");

    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const rootName = zipSafeName(activeFolder?.name ?? subjectCode, "materiais");
      const root = zip.folder(rootName);
      if (!root) throw new Error("Não foi possível criar o ZIP.");

      let fileCount = 0;
      let linkCount = 0;
      const folderIdsInZip = new Set<string>();

      async function addFolderToZip(parentFolderId: string | null, target: InstanceType<typeof JSZip>) {
        const usedNames = new Set<string>();
        const folderMaterials = subjectMaterials.filter((material) => normalizedMaterialFolder(material) === parentFolderId);
        const folderChildren = subjectFolders.filter((folder) => normalizedFolderParent(folder) === parentFolderId);
        const links: string[] = [];

        for (const folder of folderChildren) {
          if (folderIdsInZip.has(folder.id)) continue;
          folderIdsInZip.add(folder.id);
          const childName = uniqueZipName(zipSafeName(folder.name, "pasta"), usedNames);
          const childZip = target.folder(childName);
          if (childZip) await addFolderToZip(folder.id, childZip);
        }

        for (const material of folderMaterials) {
          const name = uniqueZipName(zipSafeName(material.name, "material"), usedNames);

          if (material.type === "link") {
            links.push(`${name}: ${material.url ?? ""}`);
            linkCount += 1;
            continue;
          }

          const href = materialUrls[material.id] || await getMaterialUrl(material);
          const response = await fetch(href, { cache: "no-store" });
          if (!response.ok) throw new Error(`Não foi possível baixar "${material.name}".`);
          target.file(name, await response.blob());
          fileCount += 1;
        }

        if (links.length) {
          target.file("links.txt", links.join("\n"));
        }
      }

      await addFolderToZip(currentFolderId, root);

      if (!fileCount && !linkCount) {
        setMaterialError("Esta pasta não tem arquivos para baixar.");
        return;
      }

      setZipStatus("Gerando arquivo...");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${rootName}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Não foi possível baixar o ZIP.");
    } finally {
      setZipStatus(null);
    }
  }

  function renderFolder(folder: MaterialFolder) {
    const folderMaterials = subjectMaterials.filter((material) => material.folder_id === folder.id);
    const folderChildren = folderChildCount(subjectFolders, folder.id);
    const canReorderFolder =
      draggedFolderId !== null &&
      draggedFolderId !== folder.id &&
      normalizedFolderParent(subjectFolders.find((item) => item.id === draggedFolderId) ?? folder) === normalizedFolderParent(folder);
    const canDropFolder =
      draggedFolderId !== null &&
      draggedFolderId !== folder.id &&
      !isFolderDescendant(folder.id, draggedFolderId);
    const canDropMaterial = draggedMaterialId !== null;

    return (
      <article
        className={`simple-row material-row material-folder-row ${draggedFolderId === folder.id ? "dragging" : ""} ${dragOverFolderId === folder.id || dropTargetId === folder.id ? "drag-over" : ""}`}
        draggable
        key={folder.id}
        onDragEnd={() => {
          setDraggedFolderId(null);
          setDragOverFolderId(null);
          setDraggedMaterialId(null);
          setDragOverMaterialId(null);
          setDropTargetId(null);
        }}
        onDragLeave={() => {
          setDragOverFolderId(null);
          setDropTargetId(null);
        }}
        onDragOver={(event) => {
          if (!canReorderFolder && !canDropFolder && !canDropMaterial) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          if (canReorderFolder) setDragOverFolderId(folder.id);
          if (canDropMaterial || canDropFolder) setDropTargetId(folder.id);
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", `folder:${folder.id}`);
          setDraggedFolderId(folder.id);
          setDraggedMaterialId(null);
          setDragOverFolderId(null);
          setMaterialError(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const source = event.dataTransfer.getData("text/plain");
          if (source.startsWith("material:")) {
            void moveMaterialToFolder(source.replace(/^material:/, ""), folder.id);
            return;
          }
          if (source.startsWith("folder:")) {
            const sourceId = source.replace(/^folder:/, "");
            const sourceFolder = subjectFolders.find((item) => item.id === sourceId);
            if (sourceFolder && normalizedFolderParent(sourceFolder) === normalizedFolderParent(folder) && !isMiddleDrop(event)) {
              void reorderFolderList(sourceId, folder.id);
              return;
            }
            void moveFolderToParent(sourceId, folder.id);
          }
        }}
        title="Arraste para reorganizar ou solte arquivos e pastas aqui"
      >
        <button className="material-folder-open explorer-entry-main" onClick={() => openMaterialFolder(folder.id)} type="button">
          <Folder size={18} />
          <span>
            <strong>{folder.name}</strong>
            <small>
              {[
                folderChildren ? `${folderChildren} ${folderChildren === 1 ? "pasta" : "pastas"}` : null,
                folderMaterials.length ? `${folderMaterials.length} ${folderMaterials.length === 1 ? "material" : "materiais"}` : null,
              ].filter(Boolean).join(" - ") || "Pasta vazia"}
            </small>
          </span>
        </button>
        <div className="row-actions">
          <button className="icon-button" onClick={() => openFolderModal(folder)} title="Renomear pasta" type="button">
            <Edit size={15} />
          </button>
          <button className="icon-button danger" onClick={() => deleteFolder(folder.id, folder.name)} title="Excluir pasta" type="button">
            <Trash2 size={15} />
          </button>
        </div>
      </article>
    );
  }

  function renderMaterial(material: Material) {
    const href = materialUrls[material.id] || `/materiais/abrir/${material.id}`;
    const canReorderHere =
      draggedMaterialId !== null &&
      draggedMaterialId !== material.id &&
      subjectMaterials.some(
        (item) => item.id === draggedMaterialId && (item.folder_id ?? null) === (material.folder_id ?? null),
      );
    return (
      <article
        className={`simple-row material-row ${draggedMaterialId === material.id ? "dragging" : ""} ${dragOverMaterialId === material.id ? "drag-over" : ""}`}
        draggable
        key={material.id}
        onDragEnd={() => {
          setDraggedMaterialId(null);
          setDragOverMaterialId(null);
          setDraggedFolderId(null);
          setDragOverFolderId(null);
          setDropTargetId(null);
        }}
        onDragLeave={() => setDragOverMaterialId(null)}
        onDragOver={(event) => {
          if (!canReorderHere) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDragOverMaterialId(material.id);
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", `material:${material.id}`);
          setDraggedMaterialId(material.id);
          setDraggedFolderId(null);
          setDragOverMaterialId(null);
          setMaterialError(null);
        }}
        onDrop={(event) => {
          if (!canReorderHere) return;
          event.preventDefault();
          event.stopPropagation();
          const source = event.dataTransfer.getData("text/plain").replace(/^material:/, "");
          void reorderMaterialList(source, material.id);
        }}
        title="Arraste para reorganizar ou mover"
      >
        {material.type === "file" ? <FileText size={18} /> : <LinkIcon size={18} />}
        <strong>{material.name}</strong>
        <div className="row-actions">
          <a
            className="icon-button"
            href={href}
            rel="noreferrer"
            target="_blank"
            title="Abrir"
          >
            <ExternalLink size={15} />
          </a>
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
                  <DemandDescriptionPreview description={nextTask.description} />
                  <TaskProgress demand={nextTask} progress={getDetailedTaskProgress(nextTask, demandQuestions, demandQuestionItems)} />
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
                  {supportsQuestionDashboard(demand.type) ? (
                    <Link className="task-title-button" href={`/tarefas/${demand.id}`} target="_blank">
                      {demand.title}
                    </Link>
                  ) : (
                    <strong className="task-title-static">{demand.title}</strong>
                  )}
                  <small>{[demand.due_date ? formatDate(demand.due_date) : null, demandTypeLabels[demand.type], demandStatusLabels[demand.status]].filter(Boolean).join(" - ")}</small>
                  <DemandDescriptionPreview description={demand.description} />
                  <TaskProgress demand={demand} progress={getDetailedTaskProgress(demand, demandQuestions, demandQuestionItems)} />
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
          <GradeCriteriaManager assessments={subjectAssessments} subjectId={subject.id} />
        </Panel>
      ) : null}

      {tab === "materials" ? (
        <Panel className="plain-section">
          <div className="material-explorer-toolbar">
            <div>
              <h2>Materiais</h2>
              <div className="material-breadcrumb">
                <button
                  className={dropTargetId === "root" ? "drop-active" : ""}
                  onClick={() => goToMaterialFolder(null)}
                  onDragEnter={() => setDropTargetId("root")}
                  onDragLeave={() => setDropTargetId(null)}
                  onDragOver={(event) => {
                    if (!draggedMaterialId && !draggedFolderId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const source = event.dataTransfer.getData("text/plain");
                    if (source.startsWith("material:")) void moveMaterialToFolder(source.replace(/^material:/, ""), null);
                    if (source.startsWith("folder:")) void moveFolderToParent(source.replace(/^folder:/, ""), null);
                  }}
                  type="button"
                >
                  Materiais
                </button>
                {folderPath.map((folder) => (
                  <span className="material-breadcrumb-segment" key={folder.id}>
                    <span>/</span>
                    <button
                      className={dropTargetId === folder.id ? "drop-active" : ""}
                      onClick={() => goToMaterialFolder(folder.id)}
                      onDragEnter={() => setDropTargetId(folder.id)}
                      onDragLeave={() => setDropTargetId(null)}
                      onDragOver={(event) => {
                        if (!draggedMaterialId && !draggedFolderId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const source = event.dataTransfer.getData("text/plain");
                        if (source.startsWith("material:")) void moveMaterialToFolder(source.replace(/^material:/, ""), folder.id);
                        if (source.startsWith("folder:")) void moveFolderToParent(source.replace(/^folder:/, ""), folder.id);
                      }}
                      type="button"
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className="section-actions">
              <button className="ghost-action" onClick={() => openFolderModal()} type="button"><FolderPlus size={16} />Nova pasta</button>
              <button className="ghost-action" onClick={() => setMaterialOpen(true)} type="button"><Plus size={16} />Adicionar material</button>
              <button
                className={`ghost-action ${zipStatus ? "is-loading" : ""}`}
                disabled={Boolean(zipStatus)}
                onClick={() => void downloadCurrentFolderZip()}
                type="button"
              >
                <Download size={16} />{activeFolder ? "Baixar pasta" : "Baixar materiais"}
              </button>
              {activeFolder ? (
                <>
                  <button className="ghost-action" onClick={() => openFolderModal(activeFolder)} type="button">
                    <Edit size={15} />Renomear
                  </button>
                  <button className="ghost-action danger" onClick={() => deleteFolder(activeFolder.id, activeFolder.name)} type="button">
                    <Trash2 size={15} />Excluir pasta
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {zipStatus ? <p className="form-message material-zip-status">{zipStatus}</p> : null}
          {materialError ? <p className="form-message error-message">{materialError}</p> : null}
          <div
            className={`material-explorer-list ${dropTargetId === currentDropTargetId ? "drop-active" : ""}`}
            onDragOver={(event) => {
              if (!draggedMaterialId && !draggedFolderId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTargetId(currentDropTargetId);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const source = event.dataTransfer.getData("text/plain");
              if (source.startsWith("material:")) void moveMaterialToFolder(source.replace(/^material:/, ""), currentFolderId);
              if (source.startsWith("folder:")) void moveFolderToParent(source.replace(/^folder:/, ""), currentFolderId);
            }}
          >
            {currentFolders.map((folder) => renderFolder(folder))}
            {currentMaterials.map((material) => renderMaterial(material))}
            {!currentFolders.length && !currentMaterials.length ? (
              <p className="muted compact-note">{activeFolder ? "Pasta vazia." : "Nenhum material ainda."}</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <SubjectModal open={editSubjectOpen} subject={subject} onClose={() => setEditSubjectOpen(false)} />
      <DemandModal open={demandOpen} subjectId={subject.id} onClose={() => setDemandOpen(false)} />
      <DemandModal open={Boolean(editingDemand)} demand={editingDemand} onClose={() => setEditingDemand(null)} />
      <AssessmentModal open={assessmentOpen} subjectId={subject.id} onClose={() => setAssessmentOpen(false)} />
      <AssessmentModal open={Boolean(editingAssessment)} assessment={editingAssessment} onClose={() => setEditingAssessment(null)} />
      <MaterialModal
        folders={materialFolderOptions}
        initialFolderId={currentFolderId}
        key={`material-modal:${currentFolderId ?? "root"}`}
        open={materialOpen}
        subjectId={subject.id}
        onClose={() => setMaterialOpen(false)}
      />
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
