"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Highlighter,
  ImagePlus,
  MousePointer2,
  Pencil,
  Redo2,
  Save,
  Trash2,
  Type as TypeIcon,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAppData } from "@/components/data-provider";
import type { Material } from "@/types/domain";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type EditorTool = "select" | "text" | "highlight" | "draw";

type Point = {
  x: number;
  y: number;
};

type BoxAnnotationBase = {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TextAnnotation = BoxAnnotationBase & {
  type: "text";
  text: string;
  color: string;
  fontSize: number;
};

type ImageAnnotation = BoxAnnotationBase & {
  type: "image";
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg";
  aspectRatio: number;
};

type HighlightAnnotation = BoxAnnotationBase & {
  type: "highlight";
  color: string;
  opacity: number;
};

type DrawAnnotation = {
  id: string;
  pageIndex: number;
  type: "draw";
  color: string;
  opacity: number;
  thickness: number;
  points: Point[];
};

type Annotation = TextAnnotation | ImageAnnotation | HighlightAnnotation | DrawAnnotation;

type PageMetrics = {
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
};

type Interaction = {
  kind: "move" | "resize" | "highlight" | "draw";
  annotationId: string;
  before: Annotation[];
  startClientX: number;
  startClientY: number;
  startPoint?: Point;
  original?: Annotation;
};

const MAX_HISTORY = 60;
const EMPTY_METRICS: PageMetrics = { width: 0, height: 0, pdfWidth: 0, pdfHeight: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isPdfMaterial(material: Material) {
  return material.type === "file" && (/\.pdf$/i.test(material.name) || /\.pdf(?:$|\?)/i.test(material.file_path ?? ""));
}

function editedPdfName(material: Material, materials: Material[]) {
  const original = material.name.trim() || "material.pdf";
  const withoutExtension = original.replace(/\.pdf$/i, "");
  const base = withoutExtension.replace(/ - c[oó]pia editada(?: \(\d+\))?$/i, "");
  const existingNames = new Set(
    materials
      .filter((item) => item.subject_id === material.subject_id && (item.folder_id ?? null) === (material.folder_id ?? null))
      .map((item) => item.name.toLocaleLowerCase("pt-BR")),
  );

  let candidate = `${base} - cópia editada.pdf`;
  let copyNumber = 2;
  while (existingNames.has(candidate.toLocaleLowerCase("pt-BR"))) {
    candidate = `${base} - cópia editada (${copyNumber}).pdf`;
    copyNumber += 1;
  }
  return candidate;
}

function annotationLabel(annotation: Annotation) {
  if (annotation.type === "text") return "Texto";
  if (annotation.type === "image") return "Imagem";
  if (annotation.type === "highlight") return "Marca-texto";
  return "Desenho";
}

function drawBounds(annotation: DrawAnnotation) {
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function hexChannels(hex: string) {
  const normalized = hex.replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((character) => `${character}${character}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  return {
    red: Number.parseInt(expanded.slice(0, 2), 16) / 255,
    green: Number.parseInt(expanded.slice(2, 4), 16) / 255,
    blue: Number.parseInt(expanded.slice(4, 6), 16) / 255,
  };
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
    image.src = dataUrl;
  });
}

export function PdfEditor() {
  const params = useParams<{ id: string }>();
  const {
    getMaterialUrl,
    loading: appLoading,
    materials,
    subjects,
    uploadMaterialFile,
  } = useAppData();
  const material = useMemo(
    () => materials.find((item) => item.id === params.id) ?? null,
    [materials, params.id],
  );
  const subject = material ? subjects.find((item) => item.id === material.subject_id) : null;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const originalBytesRef = useRef<ArrayBuffer | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const historyRef = useRef<Annotation[][]>([[]]);
  const historyIndexRef = useRef(0);
  const interactionRef = useRef<Interaction | null>(null);
  const getMaterialUrlRef = useRef(getMaterialUrl);
  const materialRef = useRef(material);

  const [documentReady, setDocumentReady] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageMetrics, setPageMetrics] = useState<PageMetrics>(EMPTY_METRICS);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<Annotation[]>(annotations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [historyCursor, setHistoryCursor] = useState(0);
  const [historyLength, setHistoryLength] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedId) ?? null;
  const visibleAnnotations = annotations.filter((annotation) => annotation.pageIndex === pageNumber - 1);
  const isDirty = annotations !== savedSnapshot;
  const editorReady = documentReady && pageMetrics.width > 0 && pageMetrics.height > 0;
  const displayScale = pageMetrics.pdfWidth > 0 ? pageMetrics.width / pageMetrics.pdfWidth : 1;

  const replaceAnnotations = useCallback((next: Annotation[]) => {
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

  const resetAnnotations = useCallback(() => {
    const empty: Annotation[] = [];
    annotationsRef.current = empty;
    historyRef.current = [empty];
    historyIndexRef.current = 0;
    setAnnotations(empty);
    setSavedSnapshot(empty);
    setSelectedId(null);
    setHistoryCursor(0);
    setHistoryLength(1);
  }, []);

  const commitAnnotations = useCallback((next: Annotation[]) => {
    const currentHistory = historyRef.current;
    if (currentHistory[historyIndexRef.current] === next) {
      replaceAnnotations(next);
      return;
    }

    let nextHistory = [...currentHistory.slice(0, historyIndexRef.current + 1), next];
    if (nextHistory.length > MAX_HISTORY) nextHistory = nextHistory.slice(nextHistory.length - MAX_HISTORY);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    replaceAnnotations(next);
    setHistoryCursor(historyIndexRef.current);
    setHistoryLength(nextHistory.length);
    setSaveMessage(null);
  }, [replaceAnnotations]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    replaceAnnotations(historyRef.current[historyIndexRef.current]);
    setHistoryCursor(historyIndexRef.current);
    setSelectedId(null);
    setSaveMessage(null);
  }, [replaceAnnotations]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    replaceAnnotations(historyRef.current[historyIndexRef.current]);
    setHistoryCursor(historyIndexRef.current);
    setSelectedId(null);
    setSaveMessage(null);
  }, [replaceAnnotations]);

  useEffect(() => {
    getMaterialUrlRef.current = getMaterialUrl;
    materialRef.current = material;
  }, [getMaterialUrl, material]);

  useEffect(() => {
    if (appLoading) return;

    const currentMaterial = materialRef.current;
    if (!currentMaterial) {
      setDocumentError("PDF não encontrado.");
      return;
    }
    if (!isPdfMaterial(currentMaterial)) {
      setDocumentError("Este material não é um arquivo PDF.");
      return;
    }

    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setDocumentReady(false);
    setDocumentError(null);
    setEditorError(null);
    setPageCount(0);
    setPageMetrics(EMPTY_METRICS);
    resetAnnotations();

    void Promise.resolve().then(async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const href = await getMaterialUrlRef.current(currentMaterial);
        const response = await fetch(href, { cache: "no-store" });
        if (!response.ok) throw new Error("Não foi possível abrir o PDF original.");
        const originalBytes = await response.arrayBuffer();
        originalBytesRef.current = originalBytes.slice(0);
        loadingTask = pdfjs.getDocument({ data: originalBytes.slice(0) });
        const pdfDocument = await loadingTask.promise;

        if (cancelled) {
          await pdfDocument.destroy();
          return;
        }

        pdfDocumentRef.current = pdfDocument;
        setPageCount(pdfDocument.numPages);
        setPageNumber(1);
        setDocumentReady(true);
      } catch (error) {
        if (!cancelled) {
          setDocumentError(error instanceof Error ? error.message : "Não foi possível carregar o PDF.");
        }
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      const currentDocument = pdfDocumentRef.current;
      pdfDocumentRef.current = null;
      if (currentDocument) void currentDocument.destroy();
      else if (loadingTask) void loadingTask.destroy();
    };
  }, [appLoading, params.id, resetAnnotations]);

  useEffect(() => {
    if (!documentReady || !pdfDocumentRef.current) return;

    let cancelled = false;
    setRendering(true);

    void Promise.resolve().then(async () => {
      try {
        const page = await pdfDocumentRef.current?.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (!page || !canvas || cancelled) return;

        const viewport = page.getViewport({ scale: zoom });
        const baseViewport = page.getViewport({ scale: 1 });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        setPageMetrics({
          width: viewport.width,
          height: viewport.height,
          pdfWidth: baseViewport.width,
          pdfHeight: baseViewport.height,
        });

        renderTaskRef.current?.cancel();
        const renderTask = page.render({
          canvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          setEditorError(error instanceof Error ? error.message : "Não foi possível exibir esta página.");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [documentReady, pageNumber, zoom]);

  useEffect(() => {
    function pointFromClient(clientX: number, clientY: number) {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp((clientY - rect.top) / rect.height, 0, 1),
      };
    }

    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current;
      const rect = stageRef.current?.getBoundingClientRect();
      if (!interaction || !rect) return;

      const point = pointFromClient(event.clientX, event.clientY);
      if (!point) return;

      if (interaction.kind === "highlight" && interaction.startPoint) {
        const start = interaction.startPoint;
        const x = Math.min(start.x, point.x);
        const y = Math.min(start.y, point.y);
        const width = Math.abs(point.x - start.x);
        const height = Math.abs(point.y - start.y);
        replaceAnnotations(
          annotationsRef.current.map((annotation) =>
            annotation.id === interaction.annotationId && annotation.type === "highlight"
              ? { ...annotation, x, y, width, height }
              : annotation,
          ),
        );
        return;
      }

      if (interaction.kind === "draw") {
        const current = annotationsRef.current.find((annotation) => annotation.id === interaction.annotationId);
        if (!current || current.type !== "draw") return;
        const previousPoint = current.points.at(-1);
        if (previousPoint && Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 0.0015) return;
        replaceAnnotations(
          annotationsRef.current.map((annotation) =>
            annotation.id === interaction.annotationId && annotation.type === "draw"
              ? { ...annotation, points: [...annotation.points, point] }
              : annotation,
          ),
        );
        return;
      }

      const original = interaction.original;
      if (!original) return;
      const deltaX = (event.clientX - interaction.startClientX) / rect.width;
      const deltaY = (event.clientY - interaction.startClientY) / rect.height;

      if (interaction.kind === "move") {
        if (original.type === "draw") {
          const bounds = drawBounds(original);
          const safeDeltaX = clamp(deltaX, -bounds.x, 1 - bounds.x - bounds.width);
          const safeDeltaY = clamp(deltaY, -bounds.y, 1 - bounds.y - bounds.height);
          replaceAnnotations(
            interaction.before.map((annotation) =>
              annotation.id === original.id && annotation.type === "draw"
                ? {
                    ...annotation,
                    points: original.points.map((originalPoint) => ({
                      x: originalPoint.x + safeDeltaX,
                      y: originalPoint.y + safeDeltaY,
                    })),
                  }
                : annotation,
            ),
          );
          return;
        }

        replaceAnnotations(
          interaction.before.map((annotation) =>
            annotation.id === original.id && annotation.type !== "draw"
              ? {
                  ...annotation,
                  x: clamp(original.x + deltaX, 0, 1 - original.width),
                  y: clamp(original.y + deltaY, 0, 1 - original.height),
                }
              : annotation,
          ),
        );
        return;
      }

      if (interaction.kind === "resize" && original.type !== "draw") {
        const nextWidth = clamp(original.width + deltaX, 0.035, 1 - original.x);
        let nextHeight = clamp(original.height + deltaY, 0.02, 1 - original.y);
        if (original.type === "image" && pageMetrics.pdfHeight > 0) {
          nextHeight = clamp(
            (nextWidth * pageMetrics.pdfWidth) / (original.aspectRatio * pageMetrics.pdfHeight),
            0.02,
            1 - original.y,
          );
        }
        replaceAnnotations(
          interaction.before.map((annotation) =>
            annotation.id === original.id && annotation.type !== "draw"
              ? { ...annotation, width: nextWidth, height: nextHeight }
              : annotation,
          ),
        );
      }
    }

    function handlePointerUp() {
      const interaction = interactionRef.current;
      if (!interaction) return;
      interactionRef.current = null;

      let next = annotationsRef.current;
      if (interaction.kind === "highlight") {
        next = next.map((annotation) => {
          if (annotation.id !== interaction.annotationId || annotation.type !== "highlight") return annotation;
          if (annotation.width >= 0.008 && annotation.height >= 0.006) return annotation;
          return {
            ...annotation,
            x: clamp(annotation.x, 0, 0.78),
            y: clamp(annotation.y, 0, 0.97),
            width: 0.22,
            height: 0.025,
          };
        });
      }
      if (interaction.kind === "draw") {
        next = next.map((annotation) => {
          if (annotation.id !== interaction.annotationId || annotation.type !== "draw" || annotation.points.length > 1) return annotation;
          const point = annotation.points[0];
          return { ...annotation, points: [point, { x: point.x + 0.002, y: point.y + 0.002 }] };
        });
      }
      commitAnnotations(next);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [commitAnnotations, pageMetrics.pdfHeight, pageMetrics.pdfWidth, replaceAnnotations]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editingField = target?.matches("input, textarea, select, [contenteditable='true']");
      if (editingField) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        commitAnnotations(annotationsRef.current.filter((annotation) => annotation.id !== selectedId));
        setSelectedId(null);
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commitAnnotations, redo, selectedId, undo]);

  useEffect(() => {
    function preventAccidentalClose(event: BeforeUnloadEvent) {
      if (!isDirty || saving) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", preventAccidentalClose);
    return () => window.removeEventListener("beforeunload", preventAccidentalClose);
  }, [isDirty, saving]);

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || rendering) return;
    const point = pointFromEvent(event);
    setEditorError(null);

    if (tool === "select") {
      setSelectedId(null);
      return;
    }

    if (tool === "text") {
      const width = 0.3;
      const height = Math.max(0.035, (22 * 1.45) / Math.max(pageMetrics.pdfHeight, 1));
      const annotation: TextAnnotation = {
        id: crypto.randomUUID(),
        pageIndex: pageNumber - 1,
        type: "text",
        x: clamp(point.x, 0, 1 - width),
        y: clamp(point.y, 0, 1 - height),
        width,
        height,
        text: "Novo texto",
        color: "#111111",
        fontSize: 18,
      };
      commitAnnotations([...annotationsRef.current, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "highlight") {
      const annotation: HighlightAnnotation = {
        id: crypto.randomUUID(),
        pageIndex: pageNumber - 1,
        type: "highlight",
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
        color: "#ffe45c",
        opacity: 0.38,
      };
      const before = annotationsRef.current;
      replaceAnnotations([...before, annotation]);
      setSelectedId(annotation.id);
      interactionRef.current = {
        kind: "highlight",
        annotationId: annotation.id,
        before,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: point,
      };
      return;
    }

    const annotation: DrawAnnotation = {
      id: crypto.randomUUID(),
      pageIndex: pageNumber - 1,
      type: "draw",
      color: "#ef4444",
      opacity: 1,
      thickness: 2.5,
      points: [point],
    };
    const before = annotationsRef.current;
    replaceAnnotations([...before, annotation]);
    setSelectedId(annotation.id);
    interactionRef.current = {
      kind: "draw",
      annotationId: annotation.id,
      before,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }

  function beginMove(event: ReactPointerEvent, annotation: Annotation) {
    event.stopPropagation();
    setSelectedId(annotation.id);
    if (tool !== "select" || event.button !== 0) return;
    event.preventDefault();
    interactionRef.current = {
      kind: "move",
      annotationId: annotation.id,
      before: annotationsRef.current,
      startClientX: event.clientX,
      startClientY: event.clientY,
      original: annotation,
    };
  }

  function beginResize(event: ReactPointerEvent, annotation: Exclude<Annotation, DrawAnnotation>) {
    event.stopPropagation();
    event.preventDefault();
    interactionRef.current = {
      kind: "resize",
      annotationId: annotation.id,
      before: annotationsRef.current,
      startClientX: event.clientX,
      startClientY: event.clientY,
      original: annotation,
    };
  }

  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setEditorError("Escolha uma imagem PNG ou JPG.");
      return;
    }

    try {
      const dataUrl = await fileAsDataUrl(file);
      const dimensions = await imageDimensions(dataUrl);
      const aspectRatio = dimensions.width / dimensions.height;
      let width = 0.38;
      let height = (width * pageMetrics.pdfWidth) / (aspectRatio * pageMetrics.pdfHeight);
      if (height > 0.55) {
        height = 0.55;
        width = (height * aspectRatio * pageMetrics.pdfHeight) / pageMetrics.pdfWidth;
      }
      const annotation: ImageAnnotation = {
        id: crypto.randomUUID(),
        pageIndex: pageNumber - 1,
        type: "image",
        x: (1 - width) / 2,
        y: (1 - height) / 2,
        width,
        height,
        dataUrl,
        mimeType: file.type as ImageAnnotation["mimeType"],
        aspectRatio,
      };
      commitAnnotations([...annotationsRef.current, annotation]);
      setSelectedId(annotation.id);
      setTool("select");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Não foi possível adicionar a imagem.");
    }
  }

  function updateAnnotation(id: string, updater: (annotation: Annotation) => Annotation, commit = true) {
    const next = annotationsRef.current.map((annotation) => annotation.id === id ? updater(annotation) : annotation);
    if (commit) commitAnnotations(next);
    else replaceAnnotations(next);
  }

  function removeSelected() {
    if (!selectedId) return;
    commitAnnotations(annotationsRef.current.filter((annotation) => annotation.id !== selectedId));
    setSelectedId(null);
  }

  function changeImageWidth(annotation: ImageAnnotation, widthPercent: number) {
    const width = clamp(widthPercent / 100, 0.035, 1 - annotation.x);
    const height = clamp(
      (width * pageMetrics.pdfWidth) / (annotation.aspectRatio * pageMetrics.pdfHeight),
      0.02,
      1 - annotation.y,
    );
    updateAnnotation(annotation.id, (current) => current.type === "image" ? { ...current, width, height } : current);
  }

  async function saveCopy() {
    const currentMaterial = materialRef.current;
    const originalBytes = originalBytesRef.current;
    if (!currentMaterial || !originalBytes || !annotationsRef.current.length || saving) return;

    setSaving(true);
    setEditorError(null);
    setSaveMessage("Gerando a nova cópia...");

    try {
      const { LineCapStyle, PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDocument = await PDFDocument.load(originalBytes.slice(0));
      const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
      const embeddedImages = new Map<string, Awaited<ReturnType<typeof pdfDocument.embedPng>>>();

      for (const annotation of annotationsRef.current) {
        const page = pdfDocument.getPage(annotation.pageIndex);
        if (!page) continue;
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const channels = "color" in annotation ? hexChannels(annotation.color) : null;
        const color = channels ? rgb(channels.red, channels.green, channels.blue) : undefined;

        if (annotation.type === "text") {
          if (!annotation.text.trim()) continue;
          page.drawText(annotation.text, {
            x: annotation.x * pageWidth,
            y: pageHeight - annotation.y * pageHeight - annotation.fontSize,
            size: annotation.fontSize,
            lineHeight: annotation.fontSize * 1.25,
            maxWidth: annotation.width * pageWidth,
            color,
            font,
          });
          continue;
        }

        if (annotation.type === "highlight") {
          page.drawRectangle({
            x: annotation.x * pageWidth,
            y: pageHeight - (annotation.y + annotation.height) * pageHeight,
            width: annotation.width * pageWidth,
            height: annotation.height * pageHeight,
            color,
            opacity: annotation.opacity,
          });
          continue;
        }

        if (annotation.type === "image") {
          let image = embeddedImages.get(annotation.dataUrl);
          if (!image) {
            const imageResponse = await fetch(annotation.dataUrl);
            const imageBytes = await imageResponse.arrayBuffer();
            image = annotation.mimeType === "image/png"
              ? await pdfDocument.embedPng(imageBytes)
              : await pdfDocument.embedJpg(imageBytes);
            embeddedImages.set(annotation.dataUrl, image);
          }
          page.drawImage(image, {
            x: annotation.x * pageWidth,
            y: pageHeight - (annotation.y + annotation.height) * pageHeight,
            width: annotation.width * pageWidth,
            height: annotation.height * pageHeight,
          });
          continue;
        }

        for (let index = 1; index < annotation.points.length; index += 1) {
          const start = annotation.points[index - 1];
          const end = annotation.points[index];
          page.drawLine({
            start: { x: start.x * pageWidth, y: pageHeight - start.y * pageHeight },
            end: { x: end.x * pageWidth, y: pageHeight - end.y * pageHeight },
            thickness: annotation.thickness,
            color,
            opacity: annotation.opacity,
            lineCap: LineCapStyle.Round,
          });
        }
      }

      const outputBytes = await pdfDocument.save();
      const outputBuffer = outputBytes.buffer.slice(
        outputBytes.byteOffset,
        outputBytes.byteOffset + outputBytes.byteLength,
      ) as ArrayBuffer;
      const outputName = editedPdfName(currentMaterial, materials);
      const outputFile = new File([outputBuffer], outputName, { type: "application/pdf" });
      await uploadMaterialFile(
        currentMaterial.subject_id,
        outputFile,
        outputName,
        currentMaterial.folder_id ?? null,
      );
      setSavedSnapshot(annotationsRef.current);
      setSaveMessage(`Nova cópia salva como “${outputName}”.`);
    } catch (error) {
      setSaveMessage(null);
      setEditorError(error instanceof Error ? error.message : "Não foi possível salvar a nova cópia.");
    } finally {
      setSaving(false);
    }
  }

  function changePage(nextPage: number) {
    setSelectedId(null);
    setPageNumber(clamp(Math.round(nextPage), 1, Math.max(pageCount, 1)));
  }

  function renderBoxAnnotation(annotation: TextAnnotation | ImageAnnotation | HighlightAnnotation) {
    const selected = annotation.id === selectedId;
    const style = {
      left: `${annotation.x * 100}%`,
      top: `${annotation.y * 100}%`,
      width: `${annotation.width * 100}%`,
      height: `${annotation.height * 100}%`,
    };

    return (
      <div
        className={`pdf-annotation pdf-${annotation.type}-annotation ${selected ? "selected" : ""}`}
        key={annotation.id}
        onPointerDown={(event) => beginMove(event, annotation)}
        style={style}
      >
        {annotation.type === "text" ? (
          <span style={{ color: annotation.color, fontSize: `${annotation.fontSize * displayScale}px` }}>
            {annotation.text || "Texto"}
          </span>
        ) : null}
        {annotation.type === "image" ? (
          <span
            className="pdf-editor-image"
            style={{ backgroundImage: `url(${JSON.stringify(annotation.dataUrl)})` }}
          />
        ) : null}
        {annotation.type === "highlight" ? (
          <span style={{ background: annotation.color, opacity: annotation.opacity }} />
        ) : null}
        {selected ? (
          <button
            aria-label="Redimensionar item"
            className="pdf-annotation-resize"
            onPointerDown={(event) => beginResize(event, annotation)}
            title="Redimensionar"
            type="button"
          />
        ) : null}
      </div>
    );
  }

  function renderDrawAnnotation(annotation: DrawAnnotation) {
    const selected = annotation.id === selectedId;
    const points = annotation.points.map((point) => `${point.x * pageMetrics.width},${point.y * pageMetrics.height}`).join(" ");
    const bounds = drawBounds(annotation);

    return (
      <div className={`pdf-draw-layer ${selected ? "selected" : ""}`} key={annotation.id}>
        <svg aria-hidden viewBox={`0 0 ${pageMetrics.width} ${pageMetrics.height}`}>
          <polyline
            fill="none"
            onPointerDown={(event) => beginMove(event, annotation)}
            points={points}
            pointerEvents="stroke"
            stroke="transparent"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={Math.max(14, annotation.thickness * displayScale + 10)}
          />
          <polyline
            fill="none"
            points={points}
            pointerEvents="none"
            stroke={annotation.color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={annotation.opacity}
            strokeWidth={annotation.thickness * displayScale}
          />
        </svg>
        {selected ? (
          <button
            aria-label="Mover desenho"
            className="pdf-draw-selection"
            onPointerDown={(event) => beginMove(event, annotation)}
            style={{
              left: `${bounds.x * 100}%`,
              top: `${bounds.y * 100}%`,
              width: `${Math.max(bounds.width * 100, 1)}%`,
              height: `${Math.max(bounds.height * 100, 1)}%`,
            }}
            title="Mover desenho"
            type="button"
          />
        ) : null}
      </div>
    );
  }

  return (
    <section className="pdf-editor-page">
      <header className="pdf-editor-header">
        <div className="pdf-editor-file">
          <FileText size={20} />
          <div>
            <strong>{material?.name ?? "Editor de PDF"}</strong>
            <small>{subject ? `${subject.code} · original preservado` : "Original preservado"}</small>
          </div>
        </div>
        <div className="pdf-editor-header-actions">
          {material ? (
            <a
              className="icon-button"
              href={`/materiais/abrir/${material.id}`}
              rel="noreferrer"
              target="_blank"
              title="Abrir PDF original"
            >
              <ExternalLink size={17} />
            </a>
          ) : null}
          <button
            className={`primary-button pdf-save-button ${saving ? "is-loading" : ""}`}
            disabled={!documentReady || !annotations.length || saving}
            onClick={() => void saveCopy()}
            type="button"
          >
            {saving ? null : <Save size={16} />}
            <span>{saving ? "Salvando..." : "Salvar nova cópia"}</span>
          </button>
        </div>
      </header>

      <div className="pdf-editor-toolbar" role="toolbar" aria-label="Ferramentas do editor de PDF">
        <div className="pdf-toolbar-group">
          <button
            aria-pressed={tool === "select"}
            className={`pdf-tool-button ${tool === "select" ? "active" : ""}`}
            disabled={!editorReady}
            onClick={() => setTool("select")}
            title="Selecionar e mover"
            type="button"
          >
            <MousePointer2 size={16} /><span>Selecionar</span>
          </button>
          <button
            aria-pressed={tool === "text"}
            className={`pdf-tool-button ${tool === "text" ? "active" : ""}`}
            disabled={!editorReady}
            onClick={() => setTool("text")}
            title="Adicionar texto"
            type="button"
          >
            <TypeIcon size={16} /><span>Texto</span>
          </button>
          <button
            className="pdf-tool-button"
            disabled={!editorReady}
            onClick={() => imageInputRef.current?.click()}
            title="Adicionar imagem"
            type="button"
          >
            <ImagePlus size={16} /><span>Imagem</span>
          </button>
          <button
            aria-pressed={tool === "highlight"}
            className={`pdf-tool-button ${tool === "highlight" ? "active" : ""}`}
            disabled={!editorReady}
            onClick={() => setTool("highlight")}
            title="Usar marca-texto"
            type="button"
          >
            <Highlighter size={16} /><span>Grifar</span>
          </button>
          <button
            aria-pressed={tool === "draw"}
            className={`pdf-tool-button ${tool === "draw" ? "active" : ""}`}
            disabled={!editorReady}
            onClick={() => setTool("draw")}
            title="Desenho livre"
            type="button"
          >
            <Pencil size={16} /><span>Desenhar</span>
          </button>
        </div>

        <div className="pdf-toolbar-group pdf-history-tools">
          <button className="icon-button" disabled={historyCursor <= 0} onClick={undo} title="Desfazer" type="button">
            <Undo2 size={17} />
          </button>
          <button className="icon-button" disabled={historyCursor >= historyLength - 1} onClick={redo} title="Refazer" type="button">
            <Redo2 size={17} />
          </button>
        </div>

        <div className="pdf-toolbar-group pdf-page-tools">
          <button className="icon-button" disabled={pageNumber <= 1} onClick={() => changePage(pageNumber - 1)} title="Página anterior" type="button">
            <ChevronLeft size={18} />
          </button>
          <label className="pdf-page-field" title="Página atual">
            <input
              aria-label="Página atual"
              disabled={!pageCount}
              max={Math.max(pageCount, 1)}
              min={1}
              onChange={(event) => changePage(Number(event.target.value))}
              type="number"
              value={pageNumber}
            />
            <span>/ {pageCount || "-"}</span>
          </label>
          <button className="icon-button" disabled={pageNumber >= pageCount} onClick={() => changePage(pageNumber + 1)} title="Próxima página" type="button">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="pdf-toolbar-group pdf-zoom-tools">
          <button className="icon-button" disabled={zoom <= 0.6} onClick={() => setZoom((current) => clamp(current - 0.1, 0.6, 2.4))} title="Diminuir zoom" type="button">
            <ZoomOut size={17} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="icon-button" disabled={zoom >= 2.4} onClick={() => setZoom((current) => clamp(current + 0.1, 0.6, 2.4))} title="Aumentar zoom" type="button">
            <ZoomIn size={17} />
          </button>
        </div>
      </div>

      <div className="pdf-editor-body">
        <div className="pdf-editor-workspace">
          {documentError ? (
            <div className="pdf-editor-empty">
              <FileText size={28} />
              <strong>Não foi possível abrir o PDF</strong>
              <span>{documentError}</span>
            </div>
          ) : !documentReady ? (
            <div className="pdf-editor-empty is-loading">
              <strong>Abrindo PDF...</strong>
            </div>
          ) : (
            <div
              className={`pdf-page-stage tool-${tool}`}
              onPointerDown={handleStagePointerDown}
              ref={stageRef}
              style={{ width: pageMetrics.width, height: pageMetrics.height }}
            >
              <canvas ref={canvasRef} />
              <div className="pdf-annotation-layer">
                {visibleAnnotations.map((annotation) => annotation.type === "draw"
                  ? renderDrawAnnotation(annotation)
                  : renderBoxAnnotation(annotation))}
              </div>
              {rendering ? <span className="pdf-page-rendering" aria-label="Renderizando página" /> : null}
            </div>
          )}
        </div>

        <aside className="pdf-editor-inspector">
          <div className="pdf-inspector-header">
            <div>
              <span>Propriedades</span>
              <strong>{selectedAnnotation ? annotationLabel(selectedAnnotation) : "Nenhuma seleção"}</strong>
            </div>
            <button className="icon-button danger" disabled={!selectedAnnotation} onClick={removeSelected} title="Excluir item selecionado" type="button">
              <Trash2 size={16} />
            </button>
          </div>

          {selectedAnnotation?.type === "text" ? (
            <div className="pdf-inspector-fields">
              <label>Texto
                <textarea
                  onBlur={() => commitAnnotations(annotationsRef.current)}
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "text" ? { ...annotation, text: event.target.value } : annotation,
                    false,
                  )}
                  value={selectedAnnotation.text}
                />
              </label>
              <label>Cor
                <input
                  className="pdf-color-input"
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "text" ? { ...annotation, color: event.target.value } : annotation,
                  )}
                  type="color"
                  value={selectedAnnotation.color}
                />
              </label>
              <label>Tamanho <strong>{Math.round(selectedAnnotation.fontSize)} pt</strong>
                <input
                  max={54}
                  min={8}
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => {
                      if (annotation.type !== "text") return annotation;
                      const fontSize = Number(event.target.value);
                      return {
                        ...annotation,
                        fontSize,
                        height: Math.max(annotation.height, (fontSize * 1.45) / Math.max(pageMetrics.pdfHeight, 1)),
                      };
                    },
                  )}
                  type="range"
                  value={selectedAnnotation.fontSize}
                />
              </label>
            </div>
          ) : null}

          {selectedAnnotation?.type === "image" ? (
            <div className="pdf-inspector-fields">
              <label>Largura <strong>{Math.round(selectedAnnotation.width * 100)}%</strong>
                <input
                  max={Math.max(4, Math.floor((1 - selectedAnnotation.x) * 100))}
                  min={4}
                  onChange={(event) => changeImageWidth(selectedAnnotation, Number(event.target.value))}
                  type="range"
                  value={Math.round(selectedAnnotation.width * 100)}
                />
              </label>
            </div>
          ) : null}

          {selectedAnnotation?.type === "highlight" ? (
            <div className="pdf-inspector-fields">
              <label>Cor
                <input
                  className="pdf-color-input"
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "highlight" ? { ...annotation, color: event.target.value } : annotation,
                  )}
                  type="color"
                  value={selectedAnnotation.color}
                />
              </label>
              <label>Opacidade <strong>{Math.round(selectedAnnotation.opacity * 100)}%</strong>
                <input
                  max={80}
                  min={10}
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "highlight" ? { ...annotation, opacity: Number(event.target.value) / 100 } : annotation,
                  )}
                  type="range"
                  value={Math.round(selectedAnnotation.opacity * 100)}
                />
              </label>
            </div>
          ) : null}

          {selectedAnnotation?.type === "draw" ? (
            <div className="pdf-inspector-fields">
              <label>Cor
                <input
                  className="pdf-color-input"
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "draw" ? { ...annotation, color: event.target.value } : annotation,
                  )}
                  type="color"
                  value={selectedAnnotation.color}
                />
              </label>
              <label>Espessura <strong>{selectedAnnotation.thickness.toFixed(1)} pt</strong>
                <input
                  max={12}
                  min={1}
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "draw" ? { ...annotation, thickness: Number(event.target.value) } : annotation,
                  )}
                  step={0.5}
                  type="range"
                  value={selectedAnnotation.thickness}
                />
              </label>
            </div>
          ) : null}

          <div className="pdf-editor-status">
            <span>{annotations.length} {annotations.length === 1 ? "edição" : "edições"}</span>
            <span>{isDirty ? "Alterações não salvas" : annotations.length ? "Cópia salva" : "Sem alterações"}</span>
          </div>
          {saveMessage ? <p className="pdf-editor-message success-message">{saveMessage}</p> : null}
          {editorError ? <p className="pdf-editor-message error-message">{editorError}</p> : null}
        </aside>
      </div>

      <input
        accept="image/png,image/jpeg"
        className="visually-hidden"
        onChange={(event) => void addImage(event)}
        ref={imageInputRef}
        type="file"
      />
    </section>
  );
}
