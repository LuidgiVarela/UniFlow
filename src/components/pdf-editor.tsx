"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eraser,
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
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useAppData } from "@/components/data-provider";
import type { Material } from "@/types/domain";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";

type EditorTool = "select" | "text" | "highlight" | "draw" | "erase";
type DrawStyle = "freehand" | "line" | "arrow" | "rectangle";
type SaveMode = "copy" | "replace";
type PdfFontName = "helvetica" | "helvetica-bold" | "times" | "times-bold" | "courier" | "courier-bold";

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
  fontFamily: PdfFontName;
  lineHeight: number;
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
  style: DrawStyle;
  points: Point[];
};

type Annotation = TextAnnotation | ImageAnnotation | HighlightAnnotation | DrawAnnotation;

type PageMetrics = {
  width: number;
  height: number;
  pdfWidth: number;
  pdfHeight: number;
};

type PageDefinition = {
  pdfWidth: number;
  pdfHeight: number;
};

type Interaction = {
  kind: "move" | "resize" | "highlight" | "draw";
  annotationId: string;
  pageIndex: number;
  before: Annotation[];
  startClientX: number;
  startClientY: number;
  startPoint?: Point;
  original?: Annotation;
};

const MAX_HISTORY = 60;
const EMPTY_METRICS: PageMetrics = { width: 0, height: 0, pdfWidth: 0, pdfHeight: 0 };
const PDF_FONT_OPTIONS: Array<{ value: PdfFontName; label: string; css: string }> = [
  { value: "helvetica", label: "Helvetica", css: "Arial, Helvetica, sans-serif" },
  { value: "helvetica-bold", label: "Helvetica Negrito", css: "Arial, Helvetica, sans-serif" },
  { value: "times", label: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { value: "times-bold", label: "Times New Roman Negrito", css: "'Times New Roman', Times, serif" },
  { value: "courier", label: "Courier", css: "'Courier New', Courier, monospace" },
  { value: "courier-bold", label: "Courier Negrito", css: "'Courier New', Courier, monospace" },
];
const DRAW_STYLE_OPTIONS: Array<{ value: DrawStyle; label: string }> = [
  { value: "freehand", label: "Caneta livre" },
  { value: "line", label: "Linha reta" },
  { value: "arrow", label: "Seta" },
  { value: "rectangle", label: "Retangulo" },
];

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

function cloneAnnotation(annotation: Annotation): Annotation {
  if (annotation.type === "draw") {
    return { ...annotation, points: annotation.points.map((point) => ({ ...point })) };
  }
  return { ...annotation };
}

function pastedAnnotation(annotation: Annotation, pageIndex: number): Annotation {
  const copy = cloneAnnotation(annotation);
  const offset = 0.018;

  if (copy.type === "draw") {
    const bounds = drawBounds(copy);
    const deltaX = clamp(offset, -bounds.x, 1 - bounds.x - bounds.width);
    const deltaY = clamp(offset, -bounds.y, 1 - bounds.y - bounds.height);
    return {
      ...copy,
      id: crypto.randomUUID(),
      pageIndex,
      points: copy.points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY })),
    };
  }

  return {
    ...copy,
    id: crypto.randomUUID(),
    pageIndex,
    x: clamp(copy.x + offset, 0, 1 - copy.width),
    y: clamp(copy.y + offset, 0, 1 - copy.height),
  };
}

function arrowHeadPoints(start: Point, end: Point, pageWidth: number, pageHeight: number, thickness: number) {
  const startPdf = { x: start.x * pageWidth, y: (1 - start.y) * pageHeight };
  const endPdf = { x: end.x * pageWidth, y: (1 - end.y) * pageHeight };
  const angle = Math.atan2(endPdf.y - startPdf.y, endPdf.x - startPdf.x);
  const length = Math.max(9, thickness * 3.5);
  return [Math.PI * 0.82, -Math.PI * 0.82].map((offset) => ({
    x: endPdf.x + Math.cos(angle + offset) * length,
    y: endPdf.y + Math.sin(angle + offset) * length,
  }));
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

function metricsForPage(definition: PageDefinition | undefined, zoom: number): PageMetrics {
  if (!definition) return EMPTY_METRICS;
  return {
    width: definition.pdfWidth * zoom,
    height: definition.pdfHeight * zoom,
    pdfWidth: definition.pdfWidth,
    pdfHeight: definition.pdfHeight,
  };
}

function textFontStyle(fontFamily: PdfFontName) {
  const option = PDF_FONT_OPTIONS.find((item) => item.value === fontFamily) ?? PDF_FONT_OPTIONS[0];
  return {
    fontFamily: option.css,
    fontWeight: fontFamily.endsWith("-bold") ? 700 : 400,
  };
}

function PdfPageSurface({
  children,
  current,
  definition,
  onDefinition,
  onError,
  onPointerDown,
  pageIndex,
  pdfDocument,
  registerStage,
  zoom,
}: {
  children: ReactNode;
  current: boolean;
  definition: PageDefinition;
  onDefinition: (pageIndex: number, definition: PageDefinition) => void;
  onError: (message: string) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, pageIndex: number) => void;
  pageIndex: number;
  pdfDocument: PDFDocumentProxy;
  registerStage: (pageIndex: number, element: HTMLDivElement | null) => void;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [nearViewport, setNearViewport] = useState(pageIndex === 0);
  const [rendering, setRendering] = useState(false);
  const metrics = metricsForPage(definition, zoom);

  const setStage = useCallback((element: HTMLDivElement | null) => {
    stageRef.current = element;
    registerStage(pageIndex, element);
  }, [pageIndex, registerStage]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element || nearViewport) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: "900px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport]);

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;

    void Promise.resolve().then(async () => {
      if (!cancelled) setRendering(true);
      try {
        const page = await pdfDocument.getPage(pageIndex + 1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const viewport = page.getViewport({ scale: zoom });
        const baseViewport = page.getViewport({ scale: 1 });
        onDefinition(pageIndex, { pdfWidth: baseViewport.width, pdfHeight: baseViewport.height });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

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
          onError(error instanceof Error ? error.message : "Não foi possível exibir esta página.");
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
  }, [nearViewport, onDefinition, onError, pageIndex, pdfDocument, zoom]);

  return (
    <div className={`pdf-page-shell ${current ? "current" : ""}`}>
      <div
        aria-label={`Página ${pageIndex + 1}`}
        className="pdf-page-stage"
        data-page-index={pageIndex}
        onPointerDown={(event) => onPointerDown(event, pageIndex)}
        ref={setStage}
        style={{ width: metrics.width, height: metrics.height }}
      >
        <canvas ref={canvasRef} />
        <div className="pdf-annotation-layer">{children}</div>
        {rendering ? <span className="pdf-page-rendering" aria-label="Renderizando página" /> : null}
      </div>
      <span className="pdf-page-caption">{pageIndex + 1}</span>
    </div>
  );
}

export function PdfEditor() {
  const params = useParams<{ id: string }>();
  const {
    getMaterialUrl,
    loading: appLoading,
    materials,
    replaceMaterialFile,
    subjects,
    uploadMaterialFile,
  } = useAppData();
  const material = useMemo(
    () => materials.find((item) => item.id === params.id) ?? null,
    [materials, params.id],
  );
  const subject = material ? subjects.find((item) => item.id === material.subject_id) : null;

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const pageStageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollFrameRef = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const originalBytesRef = useRef<ArrayBuffer | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  const historyRef = useRef<Annotation[][]>([[]]);
  const historyIndexRef = useRef(0);
  const interactionRef = useRef<Interaction | null>(null);
  const copiedAnnotationRef = useRef<Annotation | null>(null);
  const inspectorResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const saveControlRef = useRef<HTMLDivElement | null>(null);
  const getMaterialUrlRef = useRef(getMaterialUrl);
  const materialRef = useRef(material);

  const [documentReady, setDocumentReady] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pageDefinitions, setPageDefinitions] = useState<PageDefinition[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<Annotation[]>(annotations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [activeDrawingId, setActiveDrawingId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [drawStyle, setDrawStyle] = useState<DrawStyle>("freehand");
  const [drawColor, setDrawColor] = useState("#ef4444");
  const [drawThickness, setDrawThickness] = useState(2.5);
  const [hasCopiedAnnotation, setHasCopiedAnnotation] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(300);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [historyCursor, setHistoryCursor] = useState(0);
  const [historyLength, setHistoryLength] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);

  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedId) ?? null;
  const isDirty = annotations !== savedSnapshot;
  const currentPageMetrics = metricsForPage(pageDefinitions[pageNumber - 1], zoom);
  const editorReady = documentReady && pageDefinitions.length > 0;
  const editorBodyStyle = {
    "--pdf-inspector-width": `${inspectorWidth}px`,
  } as CSSProperties;

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
    setEditingTextId(null);
    setActiveDrawingId(null);
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

  const copySelected = useCallback(() => {
    const selected = annotationsRef.current.find((annotation) => annotation.id === selectedId);
    if (!selected) return;
    copiedAnnotationRef.current = cloneAnnotation(selected);
    setHasCopiedAnnotation(true);
  }, [selectedId]);

  const pasteCopied = useCallback((targetPageIndex: number) => {
    const copied = copiedAnnotationRef.current;
    if (!copied) return;
    const pasted = pastedAnnotation(copied, targetPageIndex);
    commitAnnotations([...annotationsRef.current, pasted]);
    setSelectedId(pasted.id);
    setEditingTextId(null);
    setTool("select");
  }, [commitAnnotations]);

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
    setPdfDocument(null);
    setPageCount(0);
    setPageDefinitions([]);
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

        const firstPage = await pdfDocument.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        const firstDefinition = { pdfWidth: firstViewport.width, pdfHeight: firstViewport.height };
        pdfDocumentRef.current = pdfDocument;
        setPdfDocument(pdfDocument);
        setPageCount(pdfDocument.numPages);
        setPageDefinitions(Array.from({ length: pdfDocument.numPages }, () => firstDefinition));
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
      const currentDocument = pdfDocumentRef.current;
      pdfDocumentRef.current = null;
      if (currentDocument) void currentDocument.destroy();
      else if (loadingTask) void loadingTask.destroy();
    };
  }, [appLoading, params.id, resetAnnotations]);

  const registerStage = useCallback((pageIndex: number, element: HTMLDivElement | null) => {
    if (element) pageStageRefs.current.set(pageIndex, element);
    else pageStageRefs.current.delete(pageIndex);
  }, []);

  const updatePageDefinition = useCallback((pageIndex: number, definition: PageDefinition) => {
    setPageDefinitions((current) => {
      const previous = current[pageIndex];
      if (
        previous &&
        Math.abs(previous.pdfWidth - definition.pdfWidth) < 0.01 &&
        Math.abs(previous.pdfHeight - definition.pdfHeight) < 0.01
      ) return current;
      const next = [...current];
      next[pageIndex] = definition;
      return next;
    });
  }, []);

  const handlePageRenderError = useCallback((message: string) => {
    setEditorError(message);
  }, []);

  const updateCurrentPageFromScroll = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const workspaceRect = workspace.getBoundingClientRect();
    const viewportCenter = (workspaceRect.top + workspaceRect.bottom) / 2;
    let closestPage = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    pageStageRefs.current.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom < workspaceRect.top || rect.top > workspaceRect.bottom) return;
      const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = index;
      }
    });

    setPageNumber((current) => current === closestPage + 1 ? current : closestPage + 1);
  }, []);

  function handleWorkspaceScroll() {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateCurrentPageFromScroll();
    });
  }

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  useEffect(() => {
    function pointFromClient(clientX: number, clientY: number, pageIndex: number) {
      const rect = pageStageRefs.current.get(pageIndex)?.getBoundingClientRect();
      if (!rect) return null;
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1),
        y: clamp((clientY - rect.top) / rect.height, 0, 1),
      };
    }

    function handlePointerMove(event: PointerEvent) {
      const interaction = interactionRef.current;
      const rect = interaction
        ? pageStageRefs.current.get(interaction.pageIndex)?.getBoundingClientRect()
        : null;
      if (!interaction || !rect) return;

      const point = pointFromClient(event.clientX, event.clientY, interaction.pageIndex);
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
        if ((current.style ?? "freehand") !== "freehand") {
          replaceAnnotations(
            annotationsRef.current.map((annotation) =>
              annotation.id === interaction.annotationId && annotation.type === "draw"
                ? { ...annotation, points: [annotation.points[0], point] }
                : annotation,
            ),
          );
          return;
        }

        const pointerSamples = typeof event.getCoalescedEvents === "function"
          ? event.getCoalescedEvents()
          : [event];
        const nextPoints = [...current.points];
        for (const sample of pointerSamples) {
          const samplePoint = pointFromClient(sample.clientX, sample.clientY, interaction.pageIndex);
          const previousPoint = nextPoints.at(-1);
          if (!samplePoint || (previousPoint && Math.hypot(samplePoint.x - previousPoint.x, samplePoint.y - previousPoint.y) < 0.0007)) continue;
          nextPoints.push(samplePoint);
        }
        if (nextPoints.length === current.points.length) return;
        replaceAnnotations(
          annotationsRef.current.map((annotation) =>
            annotation.id === interaction.annotationId && annotation.type === "draw"
              ? { ...annotation, points: nextPoints }
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
        const metrics = metricsForPage(pageDefinitions[interaction.pageIndex], zoom);
        if (original.type === "image" && metrics.pdfHeight > 0) {
          nextHeight = clamp(
            (nextWidth * metrics.pdfWidth) / (original.aspectRatio * metrics.pdfHeight),
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
      if (interaction.kind === "draw") {
        setActiveDrawingId(null);
        setSelectedId(interaction.annotationId);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [commitAnnotations, pageDefinitions, replaceAnnotations, zoom]);

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selectedId) {
        event.preventDefault();
        copySelected();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && copiedAnnotationRef.current) {
        event.preventDefault();
        pasteCopied(pageNumber - 1);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        commitAnnotations(annotationsRef.current.filter((annotation) => annotation.id !== selectedId));
        setSelectedId(null);
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setEditingTextId(null);
        setSaveMenuOpen(false);
        setTool("select");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commitAnnotations, copySelected, pageNumber, pasteCopied, redo, selectedId, undo]);

  useEffect(() => {
    function preventAccidentalClose(event: BeforeUnloadEvent) {
      if (!isDirty || saving) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", preventAccidentalClose);
    return () => window.removeEventListener("beforeunload", preventAccidentalClose);
  }, [isDirty, saving]);

  useEffect(() => {
    if (!saveMenuOpen) return;
    function closeSaveMenu(event: PointerEvent) {
      if (!saveControlRef.current?.contains(event.target as Node)) setSaveMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeSaveMenu);
    return () => document.removeEventListener("pointerdown", closeSaveMenu);
  }, [saveMenuOpen]);

  useEffect(() => {
    function handleInspectorResize(event: PointerEvent) {
      const resize = inspectorResizeRef.current;
      if (!resize) return;
      setInspectorWidth(clamp(resize.startWidth + resize.startX - event.clientX, 240, 520));
    }

    function finishInspectorResize() {
      inspectorResizeRef.current = null;
      document.body.classList.remove("is-resizing-pdf-inspector");
    }

    window.addEventListener("pointermove", handleInspectorResize);
    window.addEventListener("pointerup", finishInspectorResize);
    window.addEventListener("pointercancel", finishInspectorResize);
    return () => {
      window.removeEventListener("pointermove", handleInspectorResize);
      window.removeEventListener("pointerup", finishInspectorResize);
      window.removeEventListener("pointercancel", finishInspectorResize);
      document.body.classList.remove("is-resizing-pdf-inspector");
    };
  }, []);

  function beginInspectorResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    inspectorResizeRef.current = { startX: event.clientX, startWidth: inspectorWidth };
    document.body.classList.add("is-resizing-pdf-inspector");
  }

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function handleStagePointerDown(event: ReactPointerEvent<HTMLDivElement>, pageIndex: number) {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    const metrics = metricsForPage(pageDefinitions[pageIndex], zoom);
    setPageNumber(pageIndex + 1);
    setEditorError(null);

    if (tool === "select") {
      setSelectedId(null);
      return;
    }

    if (tool === "text") {
      const width = 0.3;
      const height = Math.max(0.035, (22 * 1.45) / Math.max(metrics.pdfHeight, 1));
      const annotation: TextAnnotation = {
        id: crypto.randomUUID(),
        pageIndex,
        type: "text",
        x: clamp(point.x, 0, 1 - width),
        y: clamp(point.y, 0, 1 - height),
        width,
        height,
        text: "Novo texto",
        color: "#111111",
        fontSize: 18,
        fontFamily: "helvetica",
        lineHeight: 1.3,
      };
      commitAnnotations([...annotationsRef.current, annotation]);
      setSelectedId(annotation.id);
      setEditingTextId(annotation.id);
      setTool("select");
      return;
    }

    if (tool === "highlight") {
      const annotation: HighlightAnnotation = {
        id: crypto.randomUUID(),
        pageIndex,
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
        pageIndex,
        before,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPoint: point,
      };
      return;
    }

    if (tool === "erase") {
      setSelectedId(null);
      return;
    }

    const annotation: DrawAnnotation = {
      id: crypto.randomUUID(),
      pageIndex,
      type: "draw",
      color: drawColor,
      opacity: 1,
      thickness: drawThickness,
      style: drawStyle,
      points: [point],
    };
    const before = annotationsRef.current;
    replaceAnnotations([...before, annotation]);
    setSelectedId(null);
    setActiveDrawingId(annotation.id);
    interactionRef.current = {
      kind: "draw",
      annotationId: annotation.id,
      pageIndex,
      before,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }

  function beginMove(event: ReactPointerEvent, annotation: Annotation) {
    if (tool === "erase" && event.button === 0) {
      event.stopPropagation();
      event.preventDefault();
      commitAnnotations(annotationsRef.current.filter((item) => item.id !== annotation.id));
      if (selectedId === annotation.id) setSelectedId(null);
      if (editingTextId === annotation.id) setEditingTextId(null);
      return;
    }
    if (tool !== "select" || event.button !== 0 || editingTextId === annotation.id) return;
    event.stopPropagation();
    event.preventDefault();
    setSelectedId(annotation.id);
    setPageNumber(annotation.pageIndex + 1);
    interactionRef.current = {
      kind: "move",
      annotationId: annotation.id,
      pageIndex: annotation.pageIndex,
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
      pageIndex: annotation.pageIndex,
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
      let height = (width * currentPageMetrics.pdfWidth) / (aspectRatio * currentPageMetrics.pdfHeight);
      if (height > 0.55) {
        height = 0.55;
        width = (height * aspectRatio * currentPageMetrics.pdfHeight) / currentPageMetrics.pdfWidth;
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
    setEditingTextId(null);
  }

  function changeImageWidth(annotation: ImageAnnotation, widthPercent: number) {
    const metrics = metricsForPage(pageDefinitions[annotation.pageIndex], zoom);
    const width = clamp(widthPercent / 100, 0.035, 1 - annotation.x);
    const height = clamp(
      (width * metrics.pdfWidth) / (annotation.aspectRatio * metrics.pdfHeight),
      0.02,
      1 - annotation.y,
    );
    updateAnnotation(annotation.id, (current) => current.type === "image" ? { ...current, width, height } : current);
  }

  async function savePdf(mode: SaveMode) {
    const currentMaterial = materialRef.current;
    const originalBytes = originalBytesRef.current;
    if (!currentMaterial || !originalBytes || !annotationsRef.current.length || saving) return;

    setSaving(true);
    setEditorError(null);
    setSaveMessage(mode === "copy" ? "Gerando a nova cópia..." : "Preparando a substituição...");

    try {
      const { LineCapStyle, PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdfDocument = await PDFDocument.load(originalBytes.slice(0));
      const standardFontNames = {
        helvetica: StandardFonts.Helvetica,
        "helvetica-bold": StandardFonts.HelveticaBold,
        times: StandardFonts.TimesRoman,
        "times-bold": StandardFonts.TimesRomanBold,
        courier: StandardFonts.Courier,
        "courier-bold": StandardFonts.CourierBold,
      } satisfies Record<PdfFontName, string>;
      const embeddedFonts = new Map<PdfFontName, Awaited<ReturnType<typeof pdfDocument.embedFont>>>();
      const embeddedImages = new Map<string, Awaited<ReturnType<typeof pdfDocument.embedPng>>>();

      for (const annotation of annotationsRef.current) {
        const page = pdfDocument.getPage(annotation.pageIndex);
        if (!page) continue;
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const channels = "color" in annotation ? hexChannels(annotation.color) : null;
        const color = channels ? rgb(channels.red, channels.green, channels.blue) : undefined;

        if (annotation.type === "text") {
          if (!annotation.text.trim()) continue;
          const fontFamily = annotation.fontFamily ?? "helvetica";
          let font = embeddedFonts.get(fontFamily);
          if (!font) {
            font = await pdfDocument.embedFont(standardFontNames[fontFamily]);
            embeddedFonts.set(fontFamily, font);
          }
          page.drawText(annotation.text, {
            x: annotation.x * pageWidth,
            y: pageHeight - annotation.y * pageHeight - annotation.fontSize,
            size: annotation.fontSize,
            lineHeight: annotation.fontSize * (annotation.lineHeight ?? 1.3),
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

        const annotationStyle = annotation.style ?? "freehand";
        if (annotationStyle === "rectangle") {
          const bounds = drawBounds(annotation);
          page.drawRectangle({
            x: bounds.x * pageWidth,
            y: pageHeight - (bounds.y + bounds.height) * pageHeight,
            width: bounds.width * pageWidth,
            height: bounds.height * pageHeight,
            borderColor: color,
            borderWidth: annotation.thickness,
            borderOpacity: annotation.opacity,
          });
          continue;
        }

        const points = annotationStyle === "freehand" ? annotation.points : annotation.points.slice(0, 2);
        for (let index = 1; index < points.length; index += 1) {
          const start = points[index - 1];
          const end = points[index];
          page.drawLine({
            start: { x: start.x * pageWidth, y: pageHeight - start.y * pageHeight },
            end: { x: end.x * pageWidth, y: pageHeight - end.y * pageHeight },
            thickness: annotation.thickness,
            color,
            opacity: annotation.opacity,
            lineCap: LineCapStyle.Round,
          });
        }
        if (annotationStyle === "arrow" && points.length > 1) {
          const start = points[0];
          const end = points[1];
          for (const headPoint of arrowHeadPoints(start, end, pageWidth, pageHeight, annotation.thickness)) {
            page.drawLine({
              start: { x: end.x * pageWidth, y: pageHeight - end.y * pageHeight },
              end: headPoint,
              thickness: annotation.thickness,
              color,
              opacity: annotation.opacity,
              lineCap: LineCapStyle.Round,
            });
          }
        }
      }

      const outputBytes = await pdfDocument.save();
      const outputBuffer = outputBytes.buffer.slice(
        outputBytes.byteOffset,
        outputBytes.byteOffset + outputBytes.byteLength,
      ) as ArrayBuffer;
      const outputName = mode === "copy" ? editedPdfName(currentMaterial, materials) : currentMaterial.name;
      const outputFile = new File([outputBuffer], outputName, { type: "application/pdf" });
      if (mode === "copy") {
        await uploadMaterialFile(
          currentMaterial.subject_id,
          outputFile,
          outputName,
          currentMaterial.folder_id ?? null,
        );
      } else {
        await replaceMaterialFile(currentMaterial, outputFile);
      }
      setSavedSnapshot(annotationsRef.current);
      setSaveMessage(mode === "copy"
        ? `Nova cópia salva como “${outputName}”.`
        : "O arquivo original foi substituído pela versão editada.");
    } catch (error) {
      setSaveMessage(null);
      setEditorError(error instanceof Error ? error.message : "Não foi possível salvar o PDF.");
    } finally {
      setSaving(false);
    }
  }

  function changePage(nextPage: number) {
    const targetPage = clamp(Math.round(nextPage), 1, Math.max(pageCount, 1));
    setSelectedId(null);
    setPageNumber(targetPage);
    pageStageRefs.current.get(targetPage - 1)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestOriginalReplacement() {
    setSaveMenuOpen(false);
    const confirmed = window.confirm(
      `Substituir “${materialRef.current?.name ?? "este PDF"}” pela versão editada? Esta ação altera somente este arquivo.`,
    );
    if (confirmed) void savePdf("replace");
  }

  function renderBoxAnnotation(
    annotation: TextAnnotation | ImageAnnotation | HighlightAnnotation,
    metrics: PageMetrics,
  ) {
    const selected = annotation.id === selectedId;
    const editingText = annotation.type === "text" && annotation.id === editingTextId;
    const displayScale = metrics.pdfWidth > 0 ? metrics.width / metrics.pdfWidth : 1;
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
        onDoubleClick={(event) => {
          if (annotation.type !== "text" || tool !== "select") return;
          event.stopPropagation();
          setSelectedId(annotation.id);
          setEditingTextId(annotation.id);
        }}
        onPointerDown={(event) => beginMove(event, annotation)}
        style={style}
      >
        {annotation.type === "text" && editingText ? (
          <textarea
            autoFocus
            className="pdf-inline-text-editor"
            onBlur={() => {
              commitAnnotations(annotationsRef.current);
              setEditingTextId(null);
            }}
            onChange={(event) => updateAnnotation(
              annotation.id,
              (current) => current.type === "text" ? { ...current, text: event.target.value } : current,
              false,
            )}
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              color: annotation.color,
              fontSize: `${annotation.fontSize * displayScale}px`,
              lineHeight: annotation.lineHeight ?? 1.3,
              ...textFontStyle(annotation.fontFamily ?? "helvetica"),
            }}
            value={annotation.text}
          />
        ) : null}
        {annotation.type === "text" && !editingText ? (
          <span style={{
            color: annotation.color,
            fontSize: `${annotation.fontSize * displayScale}px`,
            lineHeight: annotation.lineHeight ?? 1.3,
            ...textFontStyle(annotation.fontFamily ?? "helvetica"),
          }}>
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
        {selected && !editingText ? (
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

  function renderDrawAnnotation(annotation: DrawAnnotation, metrics: PageMetrics) {
    const selected = annotation.id === selectedId && annotation.id !== activeDrawingId;
    const displayScale = metrics.pdfWidth > 0 ? metrics.width / metrics.pdfWidth : 1;
    const pixelPoints = annotation.points.map((point) => ({ x: point.x * metrics.width, y: point.y * metrics.height }));
    const points = pixelPoints.map((point) => `${point.x},${point.y}`).join(" ");
    const bounds = drawBounds(annotation);
    const annotationStyle = annotation.style ?? "freehand";
    const firstPoint = pixelPoints[0] ?? { x: 0, y: 0 };
    const lastPoint = pixelPoints.at(-1) ?? firstPoint;
    const arrowAngle = Math.atan2(lastPoint.y - firstPoint.y, lastPoint.x - firstPoint.x);
    const arrowLength = Math.max(9, annotation.thickness * displayScale * 3.5);
    const arrowPoints = [Math.PI * 0.82, -Math.PI * 0.82].map((offset) => ({
      x: lastPoint.x + Math.cos(arrowAngle + offset) * arrowLength,
      y: lastPoint.y + Math.sin(arrowAngle + offset) * arrowLength,
    }));
    const strokeWidth = annotation.thickness * displayScale;
    const hitWidth = Math.max(14, strokeWidth + 10);

    const shape = annotationStyle === "rectangle" ? (
      <>
        <rect
          fill="transparent"
          height={bounds.height * metrics.height}
          onPointerDown={(event) => beginMove(event, annotation)}
          pointerEvents="stroke"
          stroke="transparent"
          strokeWidth={hitWidth}
          width={bounds.width * metrics.width}
          x={bounds.x * metrics.width}
          y={bounds.y * metrics.height}
        />
        <rect
          fill="none"
          height={bounds.height * metrics.height}
          pointerEvents="none"
          stroke={annotation.color}
          strokeOpacity={annotation.opacity}
          strokeWidth={strokeWidth}
          width={bounds.width * metrics.width}
          x={bounds.x * metrics.width}
          y={bounds.y * metrics.height}
        />
      </>
    ) : annotationStyle === "line" || annotationStyle === "arrow" ? (
      <>
        <line
          onPointerDown={(event) => beginMove(event, annotation)}
          pointerEvents="stroke"
          stroke="transparent"
          strokeWidth={hitWidth}
          x1={firstPoint.x}
          x2={lastPoint.x}
          y1={firstPoint.y}
          y2={lastPoint.y}
        />
        <line
          pointerEvents="none"
          stroke={annotation.color}
          strokeLinecap="round"
          strokeOpacity={annotation.opacity}
          strokeWidth={strokeWidth}
          x1={firstPoint.x}
          x2={lastPoint.x}
          y1={firstPoint.y}
          y2={lastPoint.y}
        />
        {annotationStyle === "arrow" ? arrowPoints.map((arrowPoint, index) => (
          <line
            key={index}
            pointerEvents="none"
            stroke={annotation.color}
            strokeLinecap="round"
            strokeOpacity={annotation.opacity}
            strokeWidth={strokeWidth}
            x1={lastPoint.x}
            x2={arrowPoint.x}
            y1={lastPoint.y}
            y2={arrowPoint.y}
          />
        )) : null}
      </>
    ) : (
      <>
        <polyline
          fill="none"
          onPointerDown={(event) => beginMove(event, annotation)}
          points={points}
          pointerEvents="stroke"
          stroke="transparent"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={hitWidth}
        />
        <polyline
          fill="none"
          points={points}
          pointerEvents="none"
          stroke={annotation.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={annotation.opacity}
          strokeWidth={strokeWidth}
        />
      </>
    );

    return (
      <div className={`pdf-draw-layer ${selected ? "selected" : ""}`} key={annotation.id}>
        <svg aria-hidden viewBox={`0 0 ${metrics.width} ${metrics.height}`}>
          {shape}
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
            <small>{subject ? `${subject.code} · edição local` : "Edição local"}</small>
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
          <div className="pdf-save-control" ref={saveControlRef}>
            <button
              aria-expanded={saveMenuOpen}
              className={`primary-button pdf-save-button ${saving ? "is-loading" : ""}`}
              disabled={!documentReady || !annotations.length || saving}
              onClick={() => setSaveMenuOpen((current) => !current)}
              type="button"
            >
              {saving ? null : <Save size={16} />}
              <span>{saving ? "Salvando..." : "Salvar"}</span>
              {saving ? null : <ChevronDown size={15} />}
            </button>
            {saveMenuOpen ? (
              <div className="pdf-save-menu" role="menu">
                <button onClick={() => {
                  setSaveMenuOpen(false);
                  void savePdf("copy");
                }} role="menuitem" type="button">
                  <Copy size={16} />
                  <span><strong>Salvar nova cópia</strong><small>Mantém o arquivo original</small></span>
                </button>
                <button onClick={requestOriginalReplacement} role="menuitem" type="button">
                  <Save size={16} />
                  <span><strong>Substituir original</strong><small>Atualiza somente este PDF</small></span>
                </button>
              </div>
            ) : null}
          </div>
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
          <button
            aria-pressed={tool === "erase"}
            className={`pdf-tool-button ${tool === "erase" ? "active" : ""}`}
            disabled={!editorReady}
            onClick={() => setTool("erase")}
            title="Apagar edições adicionadas"
            type="button"
          >
            <Eraser size={16} /><span>Borracha</span>
          </button>
        </div>

        {tool === "draw" ? (
          <div className="pdf-toolbar-group pdf-draw-tools">
            <select
              aria-label="Tipo de desenho"
              onChange={(event) => setDrawStyle(event.target.value as DrawStyle)}
              value={drawStyle}
            >
              {DRAW_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label className="pdf-toolbar-color" title="Cor do próximo desenho">
              <input onChange={(event) => setDrawColor(event.target.value)} type="color" value={drawColor} />
            </label>
            <label className="pdf-toolbar-thickness" title="Espessura do próximo desenho">
              <span>{drawThickness.toFixed(1)} pt</span>
              <input
                max={12}
                min={1}
                onChange={(event) => setDrawThickness(Number(event.target.value))}
                step={0.5}
                type="range"
                value={drawThickness}
              />
            </label>
          </div>
        ) : null}

        <div className="pdf-toolbar-group pdf-clipboard-tools">
          <button className="icon-button" disabled={!selectedAnnotation} onClick={copySelected} title="Copiar edição" type="button">
            <Copy size={16} />
          </button>
          <button className="icon-button" disabled={!hasCopiedAnnotation} onClick={() => pasteCopied(pageNumber - 1)} title="Colar na página atual" type="button">
            <ClipboardPaste size={16} />
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

      <div className="pdf-editor-body" style={editorBodyStyle}>
        <div className="pdf-editor-workspace" onScroll={handleWorkspaceScroll} ref={workspaceRef}>
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
          ) : pdfDocument ? (
            <div className={`pdf-pages-stack tool-${tool}`}>
              {pageDefinitions.map((definition, pageIndex) => {
                const metrics = metricsForPage(definition, zoom);
                const pageAnnotations = annotations.filter((annotation) => annotation.pageIndex === pageIndex);
                return (
                  <PdfPageSurface
                    current={pageNumber === pageIndex + 1}
                    definition={definition}
                    key={pageIndex}
                    onDefinition={updatePageDefinition}
                    onError={handlePageRenderError}
                    onPointerDown={handleStagePointerDown}
                    pageIndex={pageIndex}
                    pdfDocument={pdfDocument}
                    registerStage={registerStage}
                    zoom={zoom}
                  >
                    {pageAnnotations.map((annotation) => annotation.type === "draw"
                      ? renderDrawAnnotation(annotation, metrics)
                      : renderBoxAnnotation(annotation, metrics))}
                  </PdfPageSurface>
                );
              })}
            </div>
          ) : null}
        </div>

        <div
          aria-label="Redimensionar painel de propriedades"
          aria-orientation="vertical"
          aria-valuemax={520}
          aria-valuemin={240}
          aria-valuenow={inspectorWidth}
          className="pdf-inspector-resizer"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setInspectorWidth((current) => clamp(current + 16, 240, 520));
            if (event.key === "ArrowRight") setInspectorWidth((current) => clamp(current - 16, 240, 520));
          }}
          onPointerDown={beginInspectorResize}
          role="separator"
          tabIndex={0}
        />
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
              <label>Fonte
                <select
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "text"
                      ? { ...annotation, fontFamily: event.target.value as PdfFontName }
                      : annotation,
                  )}
                  value={selectedAnnotation.fontFamily ?? "helvetica"}
                >
                  {PDF_FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
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
                        height: Math.max(
                          annotation.height,
                          (fontSize * 1.45) /
                            Math.max(pageDefinitions[annotation.pageIndex]?.pdfHeight ?? 0, 1),
                        ),
                      };
                    },
                  )}
                  type="range"
                  value={selectedAnnotation.fontSize}
                />
              </label>
              <label>Espaçamento entre linhas <strong>{(selectedAnnotation.lineHeight ?? 1.3).toFixed(2)}</strong>
                <input
                  max={2}
                  min={1}
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "text"
                      ? { ...annotation, lineHeight: Number(event.target.value) }
                      : annotation,
                  )}
                  step={0.05}
                  type="range"
                  value={selectedAnnotation.lineHeight ?? 1.3}
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
              <label>Tipo
                <select
                  onChange={(event) => updateAnnotation(
                    selectedAnnotation.id,
                    (annotation) => annotation.type === "draw"
                      ? { ...annotation, style: event.target.value as DrawStyle }
                      : annotation,
                  )}
                  value={selectedAnnotation.style ?? "freehand"}
                >
                  {DRAW_STYLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
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
            <span>{isDirty ? "Alterações não salvas" : annotations.length ? "Alterações salvas" : "Sem alterações"}</span>
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
