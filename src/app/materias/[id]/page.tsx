"use client";

import {
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Download,
  Edit,
  Ellipsis,
  ExternalLink,
  FilePenLine,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Link as LinkIcon,
  Plus,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AssessmentModal } from "@/components/assessment-modal";
import { DemandModal } from "@/components/demand-modal";
import { DemandDescriptionPreview } from "@/components/demand-description-preview";
import { useAppData } from "@/components/data-provider";
import { GradeCriteriaManager } from "@/components/grade-criteria-manager";
import { MaterialModal } from "@/components/material-modal";
import { StudyPreparation } from "@/components/study-preparation";
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

type SubjectTab = "overview" | "tasks" | "content" | "assessments" | "preparation" | "grades" | "materials";

const MATERIAL_TREE_DEFAULT_WIDTH = 242;
const MATERIAL_TREE_MIN_WIDTH = 190;
const MATERIAL_TREE_MAX_WIDTH = 460;
const MATERIAL_TREE_CONTENT_MIN_WIDTH = 440;
const MATERIAL_TREE_WIDTH_STORAGE_KEY = "uniflow:material-tree-width";

const tabs: Array<{ id: SubjectTab; label: string; query: string }> = [
  { id: "overview", label: "Visão geral", query: "visao-geral" },
  { id: "tasks", label: "Tarefas", query: "tarefas" },
  { id: "content", label: "Conteúdo", query: "conteudo" },
  { id: "assessments", label: "Avaliações", query: "avaliacoes" },
  { id: "preparation", label: "Preparação", query: "preparacao" },
  { id: "grades", label: "Notas", query: "notas" },
  { id: "materials", label: "Materiais", query: "materiais" },
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

function isPdfMaterial(material: Material) {
  if (material.type !== "file") return false;
  return /\.pdf$/i.test(material.name) || /\.pdf(?:$|\?)/i.test(material.file_path ?? "");
}

function clampMaterialTreeWidth(width: number, browserWidth?: number) {
  const availableMaximum = browserWidth
    ? Math.max(MATERIAL_TREE_MIN_WIDTH, browserWidth - MATERIAL_TREE_CONTENT_MIN_WIDTH)
    : MATERIAL_TREE_MAX_WIDTH;
  return Math.min(Math.min(MATERIAL_TREE_MAX_WIDTH, availableMaximum), Math.max(MATERIAL_TREE_MIN_WIDTH, width));
}

export default function SubjectDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
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
  const tab = tabs.find((item) => item.query === searchParams.get("aba"))?.id ?? "overview";
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
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const [deletingFolderIds, setDeletingFolderIds] = useState<Set<string>>(() => new Set());
  const [deletingMaterialIds, setDeletingMaterialIds] = useState<Set<string>>(() => new Set());
  const [folderOpen, setFolderOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<MaterialFolder | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [renamingMaterial, setRenamingMaterial] = useState<Material | null>(null);
  const [materialName, setMaterialName] = useState("");
  const [materialNameError, setMaterialNameError] = useState<string | null>(null);
  const [savingMaterialName, setSavingMaterialName] = useState(false);
  const [materialTreeWidth, setMaterialTreeWidth] = useState(MATERIAL_TREE_DEFAULT_WIDTH);
  const breadcrumbRef = useRef<HTMLElement | null>(null);
  const folderActionsRef = useRef<HTMLDetailsElement | null>(null);
  const materialBrowserRef = useRef<HTMLDivElement | null>(null);
  const materialTreeWidthRef = useRef(MATERIAL_TREE_DEFAULT_WIDTH);
  const materialTreeResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
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

  useEffect(() => {
    const breadcrumb = breadcrumbRef.current;
    if (!breadcrumb) return;
    breadcrumb.scrollLeft = breadcrumb.scrollWidth;
  }, [activeFolderId]);

  useEffect(() => {
    function closeActionsMenu(event: PointerEvent | KeyboardEvent) {
      const menu = folderActionsRef.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent && event.key === "Escape") {
        menu.removeAttribute("open");
        return;
      }
      if (event instanceof PointerEvent && !menu.contains(event.target as Node)) menu.removeAttribute("open");
    }

    document.addEventListener("pointerdown", closeActionsMenu);
    document.addEventListener("keydown", closeActionsMenu);
    return () => {
      document.removeEventListener("pointerdown", closeActionsMenu);
      document.removeEventListener("keydown", closeActionsMenu);
    };
  }, []);

  useEffect(() => {
    try {
      const storedWidth = Number(window.localStorage.getItem(MATERIAL_TREE_WIDTH_STORAGE_KEY));
      if (!Number.isFinite(storedWidth) || storedWidth <= 0) return;
      const browserWidth = window.matchMedia("(min-width: 721px)").matches
        ? materialBrowserRef.current?.getBoundingClientRect().width
        : undefined;
      const nextWidth = clampMaterialTreeWidth(storedWidth, browserWidth);
      materialTreeWidthRef.current = nextWidth;
      setMaterialTreeWidth(nextWidth);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    function resizeMaterialTree(event: PointerEvent) {
      const resize = materialTreeResizeRef.current;
      if (!resize) return;
      const browserWidth = materialBrowserRef.current?.getBoundingClientRect().width;
      const nextWidth = clampMaterialTreeWidth(resize.startWidth + event.clientX - resize.startX, browserWidth);
      materialTreeWidthRef.current = nextWidth;
      setMaterialTreeWidth(nextWidth);
    }

    function finishMaterialTreeResize() {
      if (!materialTreeResizeRef.current) return;
      materialTreeResizeRef.current = null;
      document.body.classList.remove("is-resizing-material-tree");
      try {
        window.localStorage.setItem(MATERIAL_TREE_WIDTH_STORAGE_KEY, String(materialTreeWidthRef.current));
      } catch {
        return;
      }
    }

    function constrainMaterialTree() {
      if (!window.matchMedia("(min-width: 721px)").matches) return;
      const browserWidth = materialBrowserRef.current?.getBoundingClientRect().width;
      const nextWidth = clampMaterialTreeWidth(materialTreeWidthRef.current, browserWidth);
      if (nextWidth === materialTreeWidthRef.current) return;
      materialTreeWidthRef.current = nextWidth;
      setMaterialTreeWidth(nextWidth);
    }

    window.addEventListener("pointermove", resizeMaterialTree);
    window.addEventListener("pointerup", finishMaterialTreeResize);
    window.addEventListener("pointercancel", finishMaterialTreeResize);
    window.addEventListener("resize", constrainMaterialTree);
    return () => {
      window.removeEventListener("pointermove", resizeMaterialTree);
      window.removeEventListener("pointerup", finishMaterialTreeResize);
      window.removeEventListener("pointercancel", finishMaterialTreeResize);
      window.removeEventListener("resize", constrainMaterialTree);
      document.body.classList.remove("is-resizing-material-tree");
    };
  }, []);

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
  const currentItemCount = currentFolders.length + currentMaterials.length;

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

  function expandFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      if (current.has(folderId)) return current;
      const next = new Set(current);
      next.add(folderId);
      return next;
    });
  }

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  function openMaterialFolder(folderId: string) {
    expandFolder(folderId);
    window.history.pushState({ uniflowMaterialFolderId: folderId }, "", window.location.href);
    setActiveFolderId(folderId);
  }

  function goToMaterialFolder(folderId: string | null) {
    if (folderId) expandFolder(folderId);
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

  function canDropIntoFolder(folderId: string | null) {
    if (draggedMaterialId) return true;
    if (!draggedFolderId || draggedFolderId === folderId) return false;
    return !folderId || !isFolderDescendant(folderId, draggedFolderId);
  }

  function handleFolderTargetDragOver(event: React.DragEvent<HTMLElement>, folderId: string | null, targetId: string) {
    if (!canDropIntoFolder(folderId)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
  }

  function handleFolderTargetDrop(event: React.DragEvent<HTMLElement>, folderId: string | null) {
    event.preventDefault();
    event.stopPropagation();
    const source = event.dataTransfer.getData("text/plain");
    if (folderId) expandFolder(folderId);
    if (source.startsWith("material:")) void moveMaterialToFolder(source.replace(/^material:/, ""), folderId);
    if (source.startsWith("folder:")) void moveFolderToParent(source.replace(/^folder:/, ""), folderId);
  }

  function closeFolderActions() {
    folderActionsRef.current?.removeAttribute("open");
  }

  function saveMaterialTreeWidth(nextWidth: number) {
    const browserWidth = materialBrowserRef.current?.getBoundingClientRect().width;
    const width = clampMaterialTreeWidth(nextWidth, browserWidth);
    materialTreeWidthRef.current = width;
    setMaterialTreeWidth(width);
    try {
      window.localStorage.setItem(MATERIAL_TREE_WIDTH_STORAGE_KEY, String(width));
    } catch {
      return;
    }
  }

  function beginMaterialTreeResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    materialTreeResizeRef.current = {
      startX: event.clientX,
      startWidth: materialTreeWidthRef.current,
    };
    document.body.classList.add("is-resizing-material-tree");
  }

  function renderFolderTree(parentFolderId: string | null, depth = 0): React.ReactNode {
    return subjectFolders
      .filter((folder) => normalizedFolderParent(folder) === parentFolderId)
      .map((folder) => {
        const childFolders = subjectFolders.filter((item) => normalizedFolderParent(item) === folder.id);
        const hasChildren = childFolders.length > 0;
        const isActive = activeFolderId === folder.id;
        const isActiveAncestor = folderPath.slice(0, -1).some((item) => item.id === folder.id);
        const isExpanded = hasChildren && (expandedFolderIds.has(folder.id) || isActiveAncestor);
        const canDrop = canDropIntoFolder(folder.id);

        return (
          <div
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={isActive}
            className="material-tree-item"
            key={folder.id}
            role="treeitem"
          >
            <div
              className={`material-tree-row ${isActive ? "active" : ""} ${dropTargetId === folder.id ? "drop-active" : ""}`}
              onDragLeave={() => setDropTargetId((current) => current === folder.id ? null : current)}
              onDragOver={(event) => {
                if (canDrop) handleFolderTargetDragOver(event, folder.id, folder.id);
              }}
              onDrop={(event) => {
                if (canDrop) handleFolderTargetDrop(event, folder.id);
              }}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
            >
              {hasChildren ? (
                <button
                  aria-label={`${isExpanded ? "Recolher" : "Expandir"} ${folder.name}`}
                  className="material-tree-toggle"
                  onClick={() => toggleFolder(folder.id)}
                  title={isExpanded ? "Recolher pasta" : "Expandir pasta"}
                  type="button"
                >
                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              ) : <span aria-hidden className="material-tree-toggle-spacer" />}
              <button
                className="material-tree-open"
                onClick={() => openMaterialFolder(folder.id)}
                title={folder.name}
                type="button"
              >
                {isActive || isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                <span>{folder.name}</span>
              </button>
            </div>
            {isExpanded ? <div role="group">{renderFolderTree(folder.id, depth + 1)}</div> : null}
          </div>
        );
      });
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
    setDeletingFolderIds((current) => new Set(current).add(folderId));
    try {
      await removeMaterialFolder(folderId);
      if (activeFolderId === folderId) closeMaterialFolder();
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Não foi possível excluir a pasta.");
    } finally {
      setDeletingFolderIds((current) => {
        const next = new Set(current);
        next.delete(folderId);
        return next;
      });
    }
  }

  function openMaterialNameModal(material: Material) {
    setRenamingMaterial(material);
    setMaterialName(material.name);
    setMaterialNameError(null);
  }

  async function saveMaterialName(event: React.FormEvent) {
    event.preventDefault();
    if (!renamingMaterial) return;
    let nextName = materialName.trim();
    if (!nextName) {
      setMaterialNameError("Digite um nome para o material.");
      return;
    }
    if (isPdfMaterial(renamingMaterial) && !/\.pdf$/i.test(nextName)) nextName = `${nextName}.pdf`;

    setSavingMaterialName(true);
    setMaterialNameError(null);
    try {
      await upsertMaterial({ ...renamingMaterial, name: nextName });
      setRenamingMaterial(null);
      setMaterialName("");
    } catch (error) {
      setMaterialNameError(error instanceof Error ? error.message : "Não foi possível renomear o material.");
    } finally {
      setSavingMaterialName(false);
    }
  }

  async function deleteMaterial(material: Material) {
    setMaterialError(null);
    setDeletingMaterialIds((current) => new Set(current).add(material.id));
    try {
      await removeMaterial(material);
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : "Nao foi possivel excluir o material.");
    } finally {
      setDeletingMaterialIds((current) => {
        const next = new Set(current);
        next.delete(material.id);
        return next;
      });
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
    const isDeleting = deletingFolderIds.has(folder.id);
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
        draggable={!isDeleting}
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
          <button className="icon-button" disabled={isDeleting} onClick={() => openFolderModal(folder)} title="Renomear pasta" type="button">
            <Edit size={15} />
          </button>
          <button className={`icon-button danger ${isDeleting ? "is-loading" : ""}`} disabled={isDeleting} onClick={() => deleteFolder(folder.id, folder.name)} title="Excluir pasta" type="button">
            {isDeleting ? null : <Trash2 size={15} />}
          </button>
        </div>
      </article>
    );
  }

  function renderMaterial(material: Material) {
    const href = materialUrls[material.id] || `/materiais/abrir/${material.id}`;
    const isDeleting = deletingMaterialIds.has(material.id);
    const canReorderHere =
      draggedMaterialId !== null &&
      draggedMaterialId !== material.id &&
      subjectMaterials.some(
        (item) => item.id === draggedMaterialId && (item.folder_id ?? null) === (material.folder_id ?? null),
      );
    return (
      <article
        className={`simple-row material-row ${draggedMaterialId === material.id ? "dragging" : ""} ${dragOverMaterialId === material.id ? "drag-over" : ""}`}
        draggable={!isDeleting}
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
          {isPdfMaterial(material) ? (
            <a
              className="icon-button"
              href={`/materiais/editar/${material.id}`}
              rel="noreferrer"
              target="_blank"
              title="Editar PDF"
            >
              <FilePenLine size={15} />
            </a>
          ) : null}
          <button
            className="icon-button"
            disabled={isDeleting}
            onClick={() => openMaterialNameModal(material)}
            title="Renomear"
            type="button"
          >
            <TextCursorInput size={15} />
          </button>
          <button className={`icon-button danger ${isDeleting ? "is-loading" : ""}`} disabled={isDeleting} onClick={() => deleteMaterial(material)} title="Excluir" type="button">
            {isDeleting ? null : <Trash2 size={15} />}
          </button>
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
          <Link
            aria-current={tab === item.id ? "page" : undefined}
            className={tab === item.id ? "active" : ""}
            href={`/materias/${encodeURIComponent(params.id)}?aba=${item.query}`}
            key={item.id}
            scroll={false}
          >
            {item.label}
          </Link>
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

      {tab === "preparation" ? (
        <Panel className="plain-section preparation-panel">
          <StudyPreparation
            assessments={subjectAssessments}
            assessmentTopics={assessmentTopics}
            demands={subjectDemands}
            materials={subjectMaterials}
            onEditAssessment={setEditingAssessment}
            subject={subject}
            topics={subjectTopics}
          />
        </Panel>
      ) : null}

      {tab === "grades" ? (
        <Panel className="plain-section">
          <GradeCriteriaManager assessments={subjectAssessments} subjectId={subject.id} />
        </Panel>
      ) : null}

      {tab === "materials" ? (
        <Panel className="plain-section material-manager-panel">
          <div className="material-explorer-toolbar">
            <h2 className="visually-hidden">Materiais</h2>
            <div className="section-actions">
              <button className="ghost-action" onClick={() => openFolderModal()} type="button"><FolderPlus size={16} />Nova pasta</button>
              <button className="ghost-action" onClick={() => setMaterialOpen(true)} type="button"><Plus size={16} />Adicionar material</button>
              <button
                aria-label={activeFolder ? "Baixar conteúdo desta pasta" : "Baixar todos os materiais"}
                className={`icon-button material-command-button ${zipStatus ? "is-loading" : ""}`}
                disabled={Boolean(zipStatus)}
                onClick={() => void downloadCurrentFolderZip()}
                title={activeFolder ? "Baixar conteúdo desta pasta" : "Baixar todos os materiais"}
                type="button"
              >
                {zipStatus ? null : <Download size={17} />}
              </button>
              {activeFolder ? (
                <details className="material-actions-menu" key={activeFolder.id} ref={folderActionsRef}>
                  <summary aria-label="Mais ações da pasta" className="icon-button material-command-button" title="Mais ações">
                    <Ellipsis size={18} />
                  </summary>
                  <div className="material-actions-popover" role="menu">
                    <button onClick={() => {
                      closeFolderActions();
                      openFolderModal(activeFolder);
                    }} role="menuitem" type="button">
                      <Edit size={15} /><span>Renomear pasta</span>
                    </button>
                  <button
                    className={`danger ${deletingFolderIds.has(activeFolder.id) ? "is-loading" : ""}`}
                    disabled={deletingFolderIds.has(activeFolder.id)}
                    onClick={() => {
                      closeFolderActions();
                      void deleteFolder(activeFolder.id, activeFolder.name);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {deletingFolderIds.has(activeFolder.id) ? null : <Trash2 size={15} />}<span>Excluir pasta</span>
                  </button>
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          <div className="material-location-row">
            <div className="material-navigation-buttons">
              <button
                aria-label="Voltar para a pasta anterior"
                className="icon-button"
                disabled={!activeFolder}
                onClick={closeMaterialFolder}
                title="Voltar"
                type="button"
              >
                <ArrowLeft size={17} />
              </button>
              <button
                aria-label="Subir um nível"
                className="icon-button"
                disabled={!activeFolder}
                onClick={() => goToMaterialFolder(activeFolder?.parent_folder_id ?? null)}
                title="Subir um nível"
                type="button"
              >
                <ArrowUp size={17} />
              </button>
            </div>
            <nav aria-label="Caminho da pasta" className="material-breadcrumb" ref={breadcrumbRef}>
              {activeFolder ? (
                <button
                  className={dropTargetId === "root" ? "drop-active" : ""}
                  onClick={() => goToMaterialFolder(null)}
                  onDragLeave={() => setDropTargetId(null)}
                  onDragOver={(event) => handleFolderTargetDragOver(event, null, "root")}
                  onDrop={(event) => handleFolderTargetDrop(event, null)}
                  title="Materiais"
                  type="button"
                >
                  Materiais
                </button>
              ) : <span aria-current="page" className="current">Materiais</span>}
              {folderPath.map((folder, index) => {
                const isCurrent = index === folderPath.length - 1;
                return (
                  <span className="material-breadcrumb-segment" key={folder.id}>
                    <ChevronRight aria-hidden size={14} />
                    {isCurrent ? (
                      <span aria-current="page" className="current" title={folder.name}>{folder.name}</span>
                    ) : (
                      <button
                        className={dropTargetId === folder.id ? "drop-active" : ""}
                        onClick={() => goToMaterialFolder(folder.id)}
                        onDragLeave={() => setDropTargetId(null)}
                        onDragOver={(event) => handleFolderTargetDragOver(event, folder.id, folder.id)}
                        onDrop={(event) => handleFolderTargetDrop(event, folder.id)}
                        title={folder.name}
                        type="button"
                      >
                        {folder.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>

          {zipStatus ? <p className="form-message material-zip-status">{zipStatus}</p> : null}
          {materialError ? <p className="form-message error-message">{materialError}</p> : null}

          <div
            className="material-browser"
            ref={materialBrowserRef}
            style={{ "--material-tree-width": `${materialTreeWidth}px` } as React.CSSProperties}
          >
            <aside aria-label="Árvore de pastas" className="material-tree-panel">
              <div className="material-tree-heading">Pastas</div>
              <div className="material-tree" role="tree">
                <div aria-expanded aria-selected={!activeFolder} role="treeitem">
                  <div
                    className={`material-tree-row material-tree-root ${activeFolder ? "" : "active"} ${dropTargetId === "root" ? "drop-active" : ""}`}
                    onDragLeave={() => setDropTargetId((current) => current === "root" ? null : current)}
                    onDragOver={(event) => handleFolderTargetDragOver(event, null, "root")}
                    onDrop={(event) => handleFolderTargetDrop(event, null)}
                  >
                    <span aria-hidden className="material-tree-toggle-spacer" />
                    <button className="material-tree-open" onClick={() => goToMaterialFolder(null)} title="Materiais" type="button">
                      <FolderOpen size={16} /><span>Materiais</span>
                    </button>
                  </div>
                  <div role="group">{renderFolderTree(null, 1)}</div>
                </div>
              </div>
            </aside>

            <div
              aria-label="Redimensionar árvore de pastas"
              aria-orientation="vertical"
              aria-valuemax={MATERIAL_TREE_MAX_WIDTH}
              aria-valuemin={MATERIAL_TREE_MIN_WIDTH}
              aria-valuenow={Math.round(materialTreeWidth)}
              className="material-tree-resizer"
              onDoubleClick={() => saveMaterialTreeWidth(MATERIAL_TREE_DEFAULT_WIDTH)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  saveMaterialTreeWidth(materialTreeWidthRef.current - 16);
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  saveMaterialTreeWidth(materialTreeWidthRef.current + 16);
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  saveMaterialTreeWidth(MATERIAL_TREE_MIN_WIDTH);
                }
                if (event.key === "End") {
                  event.preventDefault();
                  saveMaterialTreeWidth(MATERIAL_TREE_MAX_WIDTH);
                }
              }}
              onPointerDown={beginMaterialTreeResize}
              role="separator"
              tabIndex={0}
              title="Arraste para redimensionar; clique duas vezes para restaurar"
            />

            <section aria-label={activeFolder?.name ?? "Materiais"} className="material-file-pane">
              <header className="material-file-pane-header">
                <strong>Nome</strong>
                <span>{currentItemCount} {currentItemCount === 1 ? "item" : "itens"}</span>
              </header>
              <div
                className={`material-explorer-list ${dropTargetId === currentDropTargetId ? "drop-active" : ""}`}
                onDragLeave={() => setDropTargetId((current) => current === currentDropTargetId ? null : current)}
                onDragOver={(event) => handleFolderTargetDragOver(event, currentFolderId, currentDropTargetId)}
                onDrop={(event) => handleFolderTargetDrop(event, currentFolderId)}
              >
                {currentFolders.map((folder) => renderFolder(folder))}
                {currentMaterials.map((material) => renderMaterial(material))}
                {!currentFolders.length && !currentMaterials.length ? (
                  <p className="muted compact-note">{activeFolder ? "Pasta vazia." : "Nenhum material ainda."}</p>
                ) : null}
              </div>
            </section>
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
      {renamingMaterial ? (
        <div className="modal-backdrop">
          <form className="modal form-stack compact-modal" onSubmit={saveMaterialName}>
            <div className="modal-header">
              <h2>{isPdfMaterial(renamingMaterial) ? "Renomear PDF" : "Renomear material"}</h2>
              <button className="icon-button" onClick={() => setRenamingMaterial(null)} type="button">x</button>
            </div>
            <label>
              Nome
              <input
                autoFocus
                onChange={(event) => setMaterialName(event.target.value)}
                value={materialName}
                required
              />
            </label>
            {materialNameError ? <p className="form-message error-message">{materialNameError}</p> : null}
            <button className={`primary-button full ${savingMaterialName ? "is-loading" : ""}`} disabled={savingMaterialName} type="submit">
              {savingMaterialName ? "Salvando..." : "Salvar nome"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
