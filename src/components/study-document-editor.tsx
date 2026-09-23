"use client";

import { Extension } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  Code2,
  Columns3,
  Crop,
  FileDown,
  GripVertical,
  Highlighter,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  LoaderCircle,
  Maximize2,
  Minus,
  PanelLeft,
  Plus,
  Quote,
  Redo2,
  Rows3,
  Save,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  StudyImageCropDialog,
  type CroppedStudyImage,
} from "@/components/study-image-crop-dialog";
import { loadStudyDocument, saveStudyDocument } from "@/lib/repositories/uniflow-repository";
import type { Demand, StudyDocument, Subject } from "@/types/domain";

type NotebookQuestion = {
  id: string;
  label: string;
  items: string[];
};

type SaveStatus = "loading" | "dirty" | "saving" | "saved" | "local";

type LocalStudyDocument = {
  document: StudyDocument;
  savedAt: string;
};

type ImageAlignment = "left" | "center" | "right";

type ImageCropTarget = {
  alt: string;
  displayWidth: number;
  originalAspect: number;
  position: number;
  src: string;
};

const AUTOSAVE_DELAY_MS = 900;
const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const MAX_INDENT_LEVEL = 8;

function changeBlockIndent(editor: Editor, direction: -1 | 1) {
  const { state, view } = editor;
  const positions = new Map<number, { attrs: Record<string, unknown> }>();
  const { $from, from, to } = state.selection;

  state.doc.nodesBetween(from, to, (node, position) => {
    if (node.type.name === "paragraph" || node.type.name === "heading") {
      positions.set(position, { attrs: node.attrs as Record<string, unknown> });
      return false;
    }
    return true;
  });

  if (!positions.size) {
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== "paragraph" && node.type.name !== "heading") continue;
      positions.set($from.before(depth), { attrs: node.attrs as Record<string, unknown> });
      break;
    }
  }

  let transaction = state.tr;
  let changed = false;
  positions.forEach(({ attrs }, position) => {
    const current = Number(attrs.indentLevel ?? 0);
    const next = Math.max(0, Math.min(MAX_INDENT_LEVEL, current + direction));
    if (next === current) return;
    transaction = transaction.setNodeMarkup(position, undefined, { ...attrs, indentLevel: next });
    changed = true;
  });

  if (!changed) return false;
  view.dispatch(transaction.scrollIntoView());
  return true;
}

const BlockIndent = Extension.create({
  name: "blockIndent",
  priority: 1_000,

  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        indentLevel: {
          default: 0,
          parseHTML: (element) => Number.parseInt(element.getAttribute("data-indent") ?? "0", 10) || 0,
          renderHTML: (attributes) => attributes.indentLevel
            ? { "data-indent": String(attributes.indentLevel) }
            : {},
        },
      },
    }];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-a": () => this.editor.commands.selectAll(),
      Tab: () => {
        if (this.editor.isActive("table") || this.editor.isActive("listItem")) return false;
        if (this.editor.isActive("codeBlock")) return this.editor.commands.insertContent("\t");
        return changeBlockIndent(this.editor, 1);
      },
      "Shift-Tab": () => {
        if (this.editor.isActive("table") || this.editor.isActive("listItem")) return false;
        return changeBlockIndent(this.editor, -1);
      },
    };
  },
});

const ImageLayout = Extension.create({
  name: "imageLayout",

  addGlobalAttributes() {
    return [{
      types: ["image"],
      attributes: {
        align: {
          default: "center",
          parseHTML: (element) => element.getAttribute("data-image-align") ?? "center",
          renderHTML: (attributes) => ({ "data-image-align": attributes.align ?? "center" }),
        },
      },
    }];
  },
});

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      autolink: true,
      defaultProtocol: "https",
      openOnClick: false,
    },
  }),
  TextStyleKit,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Highlight.configure({ multicolor: true }),
  Placeholder.configure({ placeholder: "Comece a escrever sua resposta..." }),
  TiptapImage.configure({
    allowBase64: true,
    resize: {
      enabled: true,
      directions: ["bottom-right", "bottom-left", "top-right", "top-left"],
      minWidth: 80,
      minHeight: 60,
      alwaysPreserveAspectRatio: true,
    },
  }),
  ImageLayout,
  TableKit.configure({
    table: {
      allowTableNodeSelection: true,
      cellMinWidth: 70,
      lastColumnResizable: true,
      resizable: true,
    },
  }),
  BlockIndent,
];

const fontFamilies = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

const fontSizes = ["11", "12", "14", "16", "18", "20", "24", "28", "32"];
const lineHeights = ["1", "1.15", "1.3", "1.5", "1.75", "2"];
const TABLE_PICKER_ROWS = 8;
const TABLE_PICKER_COLUMNS = 8;
const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 10;

function localDocumentKey(demandId: string) {
  return `uniflow:study-document-draft:${demandId}`;
}

function readLocalDocument(demandId: string) {
  try {
    const stored = window.localStorage.getItem(localDocumentKey(demandId));
    return stored ? JSON.parse(stored) as LocalStudyDocument : null;
  } catch {
    return null;
  }
}

function writeLocalDocument(document: StudyDocument) {
  try {
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      localDocumentKey(document.demand_id),
      JSON.stringify({ document: { ...document, updated_at: savedAt }, savedAt } satisfies LocalStudyDocument),
    );
    return true;
  } catch {
    return false;
  }
}

function timestamp(value?: string | null) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function documentSignature(document: Pick<StudyDocument, "content" | "title">) {
  return JSON.stringify({ title: document.title, content: document.content });
}

function normalizeQuestionLabel(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

function questionItemLabel(value: string) {
  const clean = value.trim();
  return /[.)]$/.test(clean) ? clean : `${clean})`;
}

function jsonNodeText(node: JSONContent): string {
  if (node.text) return node.text;
  return node.content?.map(jsonNodeText).join("") ?? "";
}

function normalizeLegacyQuestionItems(content: JSONContent, itemLabels: string[]) {
  const labels = new Set(itemLabels);
  let changed = false;

  function visit(node: JSONContent): JSONContent {
    const next = node.content
      ? { ...node, content: node.content.map(visit) }
      : { ...node };

    if (next.type !== "heading" || next.attrs?.level !== 3) return next;
    const text = jsonNodeText(next).trimStart();
    const isGeneratedItem = /^[a-z]\)(?:\s|$)/i.test(text)
      || [...labels].some((label) => text === label || text.startsWith(`${label} `));
    if (!isGeneratedItem) return next;

    changed = true;
    const paragraph = { ...next, type: "paragraph" };
    delete paragraph.attrs;
    return paragraph;
  }

  const normalizedContent = visit(content);
  return { changed, content: normalizedContent };
}

function findQuestionPosition(editor: Editor, label: string): number | null {
  const target = normalizeQuestionLabel(label);
  let result: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (result !== null) return false;
    if (node.type.name === "heading" && node.attrs.level === 2 && normalizeQuestionLabel(node.textContent) === target) {
      result = position;
      return false;
    }
    return true;
  });
  return result;
}

function questionNodes(question: NotebookQuestion): JSONContent[] {
  const nodes: JSONContent[] = [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: question.label }],
    },
  ];

  if (!question.items.length) return [...nodes, { type: "paragraph" }];

  for (const item of question.items) {
    const label = questionItemLabel(item);
    nodes.push({
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: label },
        { type: "text", text: " " },
      ],
    });
  }
  return nodes;
}

function countWords(value: string) {
  const clean = value.trim();
  return clean ? clean.split(/\s+/).length : 0;
}

function uniformTextStyleAttribute(editor: Editor | null, attribute: string, fallback: string) {
  if (!editor) return fallback;
  const { doc, selection } = editor.state;
  if (selection.empty) {
    return String(editor.getAttributes("textStyle")[attribute] ?? fallback);
  }

  let current: unknown;
  let hasText = false;
  let mixed = false;
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (!node.isText) return true;
    const mark = node.marks.find((item) => item.type.name === "textStyle");
    const value = mark?.attrs[attribute] ?? fallback;
    if (!hasText) {
      current = value;
      hasText = true;
    } else if (current !== value) {
      mixed = true;
    }
    return !mixed;
  });

  return mixed ? "" : String(current ?? fallback);
}

function formatSavedTime(value: string | null) {
  if (!value) return "Salvo";
  return `Salvo às ${new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))}`;
}

function optimizeImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / image.naturalWidth, maxSide / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Não foi possível preparar a imagem."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const result = canvas.toDataURL(mimeType, 0.86);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("A imagem selecionada não pôde ser aberta."));
    };
    image.src = objectUrl;
  });
}

function imageElementAt(editor: Editor, position: number) {
  const dom = editor.view.nodeDOM(position);
  if (dom instanceof HTMLImageElement) return dom;
  return dom instanceof HTMLElement ? dom.querySelector("img") : null;
}

function selectedImageContext(editor: Editor | null) {
  if (!editor) return null;
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return null;
  const element = imageElementAt(editor, selection.from);
  if (!element) return null;
  return {
    attrs: selection.node.attrs as Record<string, unknown>,
    element,
    position: selection.from,
  };
}

function selectedImageWidthPercent(editor: Editor, element: HTMLImageElement) {
  const editorWidth = editor.view.dom.clientWidth;
  if (!editorWidth) return 100;
  const imageWidth = element.offsetWidth || element.naturalWidth;
  return Math.max(15, Math.min(100, Math.round(imageWidth / editorWidth * 100)));
}

function imageDimensions(src: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = () => reject(new Error("A imagem selecionada não pôde ser aberta."));
    image.src = src;
  });
}

function ToolbarButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`study-toolbar-button ${active ? "active" : ""}`}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export function StudyDocumentEditor({
  demand,
  questions,
  subject,
}: {
  demand: Demand;
  questions: NotebookQuestion[];
  subject: Subject | null;
}) {
  const defaultTitle = `Respostas - ${demand.title}`;
  const legacyItemLabelsKey = questions
    .flatMap((question) => question.items.map(questionItemLabel))
    .join("\u001f");
  const [title, setTitle] = useState(defaultTitle);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageCropTarget, setImageCropTarget] = useState<ImageCropTarget | null>(null);
  const [zoom, setZoom] = useState(100);
  const [zoomInput, setZoomInput] = useState("100");
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 2, columns: 2 });
  const [tableMenuPosition, setTableMenuPosition] = useState({ top: 108, left: 12 });
  const [, refreshToolbar] = useReducer((value: number) => value + 1, 0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const replaceImagePositionRef = useRef<number | null>(null);
  const tableControlRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<StudyDocument | null>(null);
  const titleRef = useRef(defaultTitle);
  const readyRef = useRef(false);
  const lastSavedSignatureRef = useRef("");
  const saveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const needsResaveRef = useRef(false);
  const saveNowRef = useRef<(force?: boolean) => Promise<boolean>>(async () => false);
  const textSelectionRef = useRef({ from: 1, to: 1 });

  const editor = useEditor({
    extensions: editorExtensions,
    content: EMPTY_DOCUMENT,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "study-document-prosemirror",
        spellcheck: "true",
      },
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection;
      textSelectionRef.current = { from, to };
      refreshToolbar();
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (!readyRef.current) return;
      refreshToolbar();
      setWordCount(countWords(currentEditor.getText()));
      persistCurrentDraft(currentEditor);
    },
  });

  function currentDocument(currentEditor = editor) {
    if (!currentEditor) return null;
    const now = new Date().toISOString();
    const base = documentRef.current ?? {
      id: crypto.randomUUID(),
      demand_id: demand.id,
      title: defaultTitle,
      content: EMPTY_DOCUMENT as Record<string, unknown>,
      created_at: now,
      updated_at: now,
    };
    return {
      ...base,
      demand_id: demand.id,
      title: titleRef.current.trim() || defaultTitle,
      content: currentEditor.getJSON() as Record<string, unknown>,
      updated_at: now,
    } satisfies StudyDocument;
  }

  function rememberTextSelection() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    textSelectionRef.current = { from, to };
  }

  function selectedChain() {
    if (!editor) return null;
    const max = editor.state.doc.content.size;
    const from = Math.max(0, Math.min(textSelectionRef.current.from, max));
    const to = Math.max(from, Math.min(textSelectionRef.current.to, max));
    return editor.chain().focus().setTextSelection({ from, to });
  }

  function scheduleSave(delay = AUTOSAVE_DELAY_MS) {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNowRef.current(false);
    }, delay);
  }

  function persistCurrentDraft(currentEditor = editor) {
    const current = currentDocument(currentEditor);
    if (!current) return;
    documentRef.current = current;
    writeLocalDocument(current);
    setStatus("dirty");
    setSyncError(null);
    scheduleSave();
  }

  function applyZoom(value: number) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value)));
    setZoom(next);
    setZoomInput(String(next));
  }

  function commitZoom() {
    const parsed = Number.parseInt(zoomInput, 10);
    applyZoom(Number.isFinite(parsed) ? parsed : zoom);
  }

  function toggleTablePicker() {
    if (!tablePickerOpen && tableControlRef.current) {
      const bounds = tableControlRef.current.getBoundingClientRect();
      const popoverWidth = 292;
      setTableMenuPosition({
        top: Math.min(window.innerHeight - 24, bounds.bottom + 8),
        left: Math.max(12, Math.min(bounds.left, window.innerWidth - popoverWidth - 12)),
      });
    }
    setTablePickerOpen((value) => !value);
  }

  function insertTable(rows: number, columns: number) {
    selectedChain()?.insertTable({ rows, cols: columns, withHeaderRow: false }).run();
    setTablePickerOpen(false);
  }

  async function saveNow(force = false) {
    if (!editor || !readyRef.current) return false;
    if (savePromiseRef.current) {
      needsResaveRef.current = true;
      return savePromiseRef.current;
    }

    const snapshot = currentDocument(editor);
    if (!snapshot) return false;
    const signature = documentSignature(snapshot);
    if (!force && signature === lastSavedSignatureRef.current) {
      setStatus("saved");
      return true;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setStatus("saving");
    setSyncError(null);

    const operation = (async () => {
      try {
        const saved = await saveStudyDocument(snapshot);
        lastSavedSignatureRef.current = signature;
        const latest = currentDocument(editor) ?? snapshot;
        documentRef.current = {
          ...latest,
          id: saved.id,
          user_id: saved.user_id,
          created_at: saved.created_at,
          updated_at: saved.updated_at,
        };
        const stillCurrent = documentSignature(latest) === signature;
        if (stillCurrent) {
          writeLocalDocument({ ...saved, content: snapshot.content, title: snapshot.title });
          setSavedAt(saved.updated_at);
          setStatus("saved");
        } else {
          setStatus("dirty");
          needsResaveRef.current = true;
        }
        return true;
      } catch (error) {
        const localSaved = writeLocalDocument(snapshot);
        setStatus("local");
        setSyncError(
          localSaved
            ? "O rascunho está protegido neste navegador, mas ainda não foi sincronizado."
            : error instanceof Error
              ? error.message
              : "Não foi possível salvar o documento.",
        );
        return false;
      }
    })();

    savePromiseRef.current = operation;
    const result = await operation;
    savePromiseRef.current = null;
    if (needsResaveRef.current) {
      needsResaveRef.current = false;
      scheduleSave(250);
    }
    return result;
  }

  useEffect(() => {
    saveNowRef.current = saveNow;
  });

  useEffect(() => {
    if (!editor) return;
    const currentEditor = editor;
    let cancelled = false;
    readyRef.current = false;
    currentEditor.setEditable(false);

    async function loadDocument() {
      const local = readLocalDocument(demand.id);
      let remote: StudyDocument | null = null;
      let remoteError: unknown = null;
      try {
        remote = await loadStudyDocument(demand.id);
      } catch (error) {
        remoteError = error;
      }
      if (cancelled) return;

      const localIsNewer = Boolean(local && (!remote || timestamp(local.savedAt) > timestamp(remote.updated_at) + 500));
      const selected = localIsNewer ? local?.document ?? null : remote;
      const now = new Date().toISOString();
      const initial: StudyDocument = selected ?? {
        id: crypto.randomUUID(),
        demand_id: demand.id,
        title: defaultTitle,
        content: EMPTY_DOCUMENT as Record<string, unknown>,
        created_at: now,
        updated_at: now,
      };
      const normalized = normalizeLegacyQuestionItems(
        initial.content as JSONContent,
        legacyItemLabelsKey ? legacyItemLabelsKey.split("\u001f") : [],
      );
      const loadedDocument = normalized.changed
        ? { ...initial, content: normalized.content as Record<string, unknown> }
        : initial;

      documentRef.current = loadedDocument;
      titleRef.current = loadedDocument.title;
      setTitle(loadedDocument.title);
      currentEditor.commands.setContent(loadedDocument.content as JSONContent, { emitUpdate: false });
      currentEditor.setEditable(true);
      setWordCount(countWords(currentEditor.getText()));
      setSavedAt(remote?.updated_at ?? null);
      lastSavedSignatureRef.current = remote ? documentSignature(remote) : documentSignature(initial);
      readyRef.current = true;

      if (normalized.changed) writeLocalDocument(loadedDocument);

      if (remoteError) {
        setStatus("local");
        setSyncError("Sincronização indisponível. O rascunho continuará protegido neste navegador.");
      } else if (localIsNewer || normalized.changed) {
        setStatus("dirty");
        scheduleSave(180);
      } else {
        setStatus("saved");
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
      readyRef.current = false;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [defaultTitle, demand.id, editor, legacyItemLabelsKey]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNowRef.current(true);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!tablePickerOpen) return;

    function closeTablePicker(event: PointerEvent) {
      if (!tableControlRef.current?.contains(event.target as Node)) setTablePickerOpen(false);
    }

    function closeTablePickerWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setTablePickerOpen(false);
    }

    window.addEventListener("pointerdown", closeTablePicker);
    window.addEventListener("keydown", closeTablePickerWithKeyboard);
    return () => {
      window.removeEventListener("pointerdown", closeTablePicker);
      window.removeEventListener("keydown", closeTablePickerWithKeyboard);
    };
  }, [tablePickerOpen]);

  const questionPositions = new Map<string, number>();
  if (editor) {
    for (const question of questions) {
      const position = findQuestionPosition(editor, question.label);
      if (position !== null) questionPositions.set(question.id, position);
    }
  }

  const statusLabel = status === "loading"
    ? "Abrindo caderno..."
    : status === "saving"
      ? "Salvando..."
      : status === "dirty"
        ? "Alterações pendentes"
        : status === "local"
          ? "Salvo neste navegador"
          : formatSavedTime(savedAt);

  function handleTitleChange(value: string) {
    setTitle(value);
    titleRef.current = value;
    persistCurrentDraft();
  }

  function scrollToQuestion(question: NotebookQuestion) {
    if (!editor) return;
    const position = findQuestionPosition(editor, question.label);
    if (position === null) {
      insertQuestions([question]);
      return;
    }
    editor.chain().focus(position + 1).scrollIntoView().run();
    window.requestAnimationFrame(() => {
      const node = editor.view.nodeDOM(position);
      if (node instanceof HTMLElement) node.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setOutlineOpen(false);
  }

  function insertQuestions(items: NotebookQuestion[]) {
    if (!editor) return;
    const missing = items.filter((question) => findQuestionPosition(editor, question.label) === null);
    if (!missing.length) return;
    const nodes = missing.flatMap(questionNodes);
    editor.chain().focus("end").insertContent(nodes).run();
    const first = missing[0];
    window.requestAnimationFrame(() => scrollToQuestion(first));
  }

  function handleBlockType(value: string) {
    if (!editor) return;
    if (value === "paragraph") selectedChain()?.setParagraph().run();
    else if (value === "quote") selectedChain()?.toggleBlockquote().run();
    else if (value === "code") selectedChain()?.toggleCodeBlock().run();
    else selectedChain()?.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  }

  function handleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      selectedChain()?.unsetLink().run();
      return;
    }
    const href = window.prompt("Endereço do link:", "https://");
    if (!href) return;
    selectedChain()?.extendMarkRange("link").setLink({ href }).run();
  }

  async function handleImage(file?: File, replacePosition: number | null = null) {
    if (!editor || !file) return;
    if (file.size > 8 * 1024 * 1024) {
      setSyncError("Escolha uma imagem com até 8 MB.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (replaceImageInputRef.current) replaceImageInputRef.current.value = "";
      replaceImagePositionRef.current = null;
      return;
    }
    setImageBusy(true);
    setSyncError(null);
    try {
      const src = await optimizeImage(file);
      if (replacePosition !== null && editor.state.doc.nodeAt(replacePosition)?.type.name === "image") {
        const currentElement = imageElementAt(editor, replacePosition);
        const currentWidth = currentElement?.offsetWidth || editor.view.dom.clientWidth;
        const dimensions = await imageDimensions(src);
        const width = Math.max(80, Math.min(editor.view.dom.clientWidth, currentWidth));
        const height = Math.round(width * dimensions.height / dimensions.width);
        editor
          .chain()
          .focus()
          .setNodeSelection(replacePosition)
          .updateAttributes("image", { alt: file.name, height, src, title: file.name, width })
          .run();
        window.requestAnimationFrame(() => {
          const element = imageElementAt(editor, replacePosition);
          if (!element) return;
          element.style.width = `${width}px`;
          element.style.height = `${height}px`;
        });
      } else {
        selectedChain()?.setImage({ src, alt: file.name, title: file.name }).run();
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Não foi possível adicionar a imagem.");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (replaceImageInputRef.current) replaceImageInputRef.current.value = "";
      replaceImagePositionRef.current = null;
    }
  }

  function setSelectedImageWidth(percent: number) {
    const context = selectedImageContext(editor);
    if (!editor || !context) return;
    const nextPercent = Math.max(15, Math.min(100, Math.round(percent)));
    const width = Math.max(80, Math.round(editor.view.dom.clientWidth * nextPercent / 100));
    const measuredRatio = context.element.naturalWidth > 0 && context.element.naturalHeight > 0
      ? context.element.naturalWidth / context.element.naturalHeight
      : context.element.offsetWidth / Math.max(1, context.element.offsetHeight);
    const naturalRatio = Number.isFinite(measuredRatio) && measuredRatio > 0 ? measuredRatio : 1;
    const height = Math.max(1, Math.round(width / naturalRatio));
    editor
      .chain()
      .focus()
      .setNodeSelection(context.position)
      .updateAttributes("image", { height, width })
      .run();
    context.element.style.width = `${width}px`;
    context.element.style.height = `${height}px`;
  }

  function setSelectedImageAlignment(align: ImageAlignment) {
    const context = selectedImageContext(editor);
    if (!editor || !context) return;
    editor
      .chain()
      .focus()
      .setNodeSelection(context.position)
      .updateAttributes("image", { align })
      .run();
  }

  function resetSelectedImageSize() {
    const context = selectedImageContext(editor);
    if (!editor || !context) return;
    editor
      .chain()
      .focus()
      .setNodeSelection(context.position)
      .updateAttributes("image", { height: null, width: null })
      .run();
    context.element.style.removeProperty("height");
    context.element.style.removeProperty("width");
  }

  function openImageCrop() {
    const context = selectedImageContext(editor);
    if (!context || typeof context.attrs.src !== "string") return;
    const naturalWidth = context.element.naturalWidth || context.element.offsetWidth;
    const naturalHeight = context.element.naturalHeight || context.element.offsetHeight;
    setImageCropTarget({
      alt: typeof context.attrs.alt === "string" ? context.attrs.alt : "Imagem do caderno",
      displayWidth: context.element.offsetWidth,
      originalAspect: naturalWidth / Math.max(1, naturalHeight),
      position: context.position,
      src: context.attrs.src,
    });
  }

  function applyImageCrop(result: CroppedStudyImage) {
    if (!editor || !imageCropTarget) return;
    const { position } = imageCropTarget;
    if (editor.state.doc.nodeAt(position)?.type.name !== "image") {
      setImageCropTarget(null);
      return;
    }
    const width = Math.max(80, Math.min(editor.view.dom.clientWidth, imageCropTarget.displayWidth));
    const height = Math.max(1, Math.round(width * result.height / result.width));
    editor
      .chain()
      .focus()
      .setNodeSelection(position)
      .updateAttributes("image", { height, src: result.src, width })
      .run();
    window.requestAnimationFrame(() => {
      const element = imageElementAt(editor, position);
      if (!element) return;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    });
    setImageCropTarget(null);
  }

  function openImageReplacement() {
    const context = selectedImageContext(editor);
    if (!context) return;
    replaceImagePositionRef.current = context.position;
    replaceImageInputRef.current?.click();
  }

  async function exportPdf() {
    await saveNow(true);
    const previousTitle = document.title;
    document.title = (titleRef.current.trim() || defaultTitle).replace(/[\\/:*?"<>|]/g, "-");
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  }

  const blockType = editor?.isActive("heading", { level: 1 })
    ? "h1"
    : editor?.isActive("heading", { level: 2 })
      ? "h2"
      : editor?.isActive("heading", { level: 3 })
        ? "h3"
        : editor?.isActive("blockquote")
          ? "quote"
          : editor?.isActive("codeBlock")
            ? "code"
            : "paragraph";
  const textStyle = editor?.getAttributes("textStyle") ?? {};
  const fontFamilyValue = uniformTextStyleAttribute(editor, "fontFamily", "Arial, sans-serif");
  const fontSizeValue = uniformTextStyleAttribute(editor, "fontSize", "16px").replace("px", "");
  const lineHeightValue = uniformTextStyleAttribute(editor, "lineHeight", "1.5");
  const selectedImage = selectedImageContext(editor);
  const imageAlignment = (selectedImage?.attrs.align ?? "center") as ImageAlignment;
  const imageWidthPercent = editor && selectedImage
    ? selectedImageWidthPercent(editor, selectedImage.element)
    : 100;

  return (
    <section className="study-document-page">
      <header className="study-document-header">
        <div className="study-document-identity">
          <Link aria-label="Voltar para a lista" className="study-document-back" href={`/tarefas/${demand.id}`} title="Voltar para a lista">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <input
              aria-label="Nome do caderno"
              className="study-document-title-input"
              maxLength={180}
              onChange={(event) => handleTitleChange(event.target.value)}
              value={title}
            />
            <span>{subject?.code ?? "UniFlow"} · {wordCount} {wordCount === 1 ? "palavra" : "palavras"}</span>
          </div>
        </div>
        <div className="study-document-header-actions">
          <div aria-live="polite" className={`study-save-status ${status}`} title={syncError ?? statusLabel}>
            {status === "saving" || status === "loading" ? <LoaderCircle className="spin-icon" size={15} /> : <Check size={15} />}
            <span>{statusLabel}</span>
          </div>
          <button className="study-header-action secondary" disabled={!editor || status === "loading"} onClick={() => void saveNow(true)} title="Salvar agora" type="button">
            <Save size={16} /><span>Salvar</span>
          </button>
          <button className="study-header-action" disabled={!editor || status === "loading"} onClick={() => void exportPdf()} title="Exportar como PDF" type="button">
            <FileDown size={16} /><span>Exportar PDF</span>
          </button>
        </div>
      </header>

      <div className="study-document-toolbar" role="toolbar" aria-label="Formatação do documento">
        <div className="study-toolbar-group study-toolbar-mobile-outline">
          <ToolbarButton active={outlineOpen} label="Questões" onClick={() => setOutlineOpen((value) => !value)}>
            <PanelLeft size={17} />
          </ToolbarButton>
        </div>
        <div className="study-toolbar-group">
          <ToolbarButton disabled={!editor?.can().undo()} label="Desfazer" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={17} /></ToolbarButton>
          <ToolbarButton disabled={!editor?.can().redo()} label="Refazer" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={17} /></ToolbarButton>
        </div>
        <div className="study-toolbar-group study-zoom-control">
          <ToolbarButton disabled={zoom <= MIN_ZOOM} label="Diminuir zoom" onClick={() => applyZoom(zoom - ZOOM_STEP)}><ZoomOut size={17} /></ToolbarButton>
          <label className="study-zoom-field" title="Zoom da página">
            <input
              aria-label="Zoom da página"
              inputMode="numeric"
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              onBlur={commitZoom}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "");
                setZoomInput(value);
                const parsed = Number.parseInt(value, 10);
                if (parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) setZoom(parsed);
              }}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              step={ZOOM_STEP}
              type="number"
              value={zoomInput}
            />
            <span>%</span>
          </label>
          <ToolbarButton disabled={zoom >= MAX_ZOOM} label="Aumentar zoom" onClick={() => applyZoom(zoom + ZOOM_STEP)}><ZoomIn size={17} /></ToolbarButton>
        </div>
        {selectedImage ? (
          <>
            <div className="study-toolbar-group study-image-context-label" title="Arraste a imagem no documento para movê-la">
              <GripVertical size={16} />
              <span>Imagem</span>
            </div>
            <div className="study-toolbar-group">
              <label className="study-image-size-control" title="Largura da imagem">
                <Maximize2 size={16} />
                <input
                  aria-label="Largura da imagem"
                  max="100"
                  min="15"
                  onChange={(event) => setSelectedImageWidth(Number(event.target.value))}
                  type="range"
                  value={imageWidthPercent}
                />
                <input
                  aria-label="Largura da imagem em porcentagem"
                  className="study-image-size-number"
                  max="100"
                  min="15"
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setSelectedImageWidth(value);
                  }}
                  onFocus={(event) => event.currentTarget.select()}
                  type="number"
                  value={imageWidthPercent}
                />
                <span>%</span>
              </label>
            </div>
            <div className="study-toolbar-group">
              <ToolbarButton active={imageAlignment === "left"} label="Alinhar imagem à esquerda" onClick={() => setSelectedImageAlignment("left")}><AlignLeft size={17} /></ToolbarButton>
              <ToolbarButton active={imageAlignment === "center"} label="Centralizar imagem" onClick={() => setSelectedImageAlignment("center")}><AlignCenter size={17} /></ToolbarButton>
              <ToolbarButton active={imageAlignment === "right"} label="Alinhar imagem à direita" onClick={() => setSelectedImageAlignment("right")}><AlignRight size={17} /></ToolbarButton>
            </div>
            <div className="study-toolbar-group">
              <ToolbarButton label="Recortar imagem" onClick={openImageCrop}><Crop size={17} /></ToolbarButton>
              <ToolbarButton disabled={imageBusy} label="Substituir imagem" onClick={openImageReplacement}>
                {imageBusy ? <LoaderCircle className="spin-icon" size={17} /> : <ImagePlus size={17} />}
              </ToolbarButton>
              <ToolbarButton label="Restaurar tamanho original" onClick={resetSelectedImageSize}><Maximize2 size={17} /></ToolbarButton>
              <ToolbarButton label="Excluir imagem" onClick={() => editor?.chain().focus().deleteSelection().run()}><Trash2 size={17} /></ToolbarButton>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="visually-hidden"
                onChange={(event) => void handleImage(event.target.files?.[0], replaceImagePositionRef.current)}
                ref={replaceImageInputRef}
                type="file"
              />
            </div>
          </>
        ) : (
          <>
        <div className="study-toolbar-group">
          <select aria-label="Estilo do parágrafo" className="study-toolbar-select block-style" disabled={!editor} onChange={(event) => handleBlockType(event.target.value)} onPointerDown={rememberTextSelection} value={blockType}>
            <option value="paragraph">Texto normal</option>
            <option value="h1">Título</option>
            <option value="h2">Subtítulo</option>
            <option value="h3">Seção</option>
            <option value="quote">Citação</option>
            <option value="code">Código</option>
          </select>
          <select
            aria-label="Fonte"
            className="study-toolbar-select font-family"
            disabled={!editor}
            onChange={(event) => {
              const value = event.target.value;
              if (value) selectedChain()?.setFontFamily(value).run();
              else selectedChain()?.unsetFontFamily().run();
            }}
            onPointerDown={rememberTextSelection}
            value={fontFamilyValue}
          >
            <option disabled value="">Várias fontes</option>
            {fontFamilies.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
          </select>
          <select
            aria-label="Tamanho da fonte"
            className="study-toolbar-select font-size"
            disabled={!editor}
            onChange={(event) => selectedChain()?.setFontSize(`${event.target.value}px`).run()}
            onPointerDown={rememberTextSelection}
            value={fontSizeValue}
          >
            <option disabled value="">Vários</option>
            {fontSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
        <div className="study-toolbar-group">
          <ToolbarButton active={editor?.isActive("bold")} label="Negrito" onClick={() => selectedChain()?.toggleBold().run()}><Bold size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("italic")} label="Itálico" onClick={() => selectedChain()?.toggleItalic().run()}><Italic size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("underline")} label="Sublinhado" onClick={() => selectedChain()?.toggleUnderline().run()}><Underline size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("strike")} label="Tachado" onClick={() => selectedChain()?.toggleStrike().run()}><Strikethrough size={17} /></ToolbarButton>
          <label className="study-toolbar-color" onPointerDown={rememberTextSelection} title="Cor do texto">
            <span aria-hidden="true" style={{ background: textStyle.color ?? "#202124" }} />
            <input aria-label="Cor do texto" onChange={(event) => selectedChain()?.setColor(event.target.value).run()} type="color" value={textStyle.color ?? "#202124"} />
          </label>
          <label className="study-toolbar-highlight" onPointerDown={rememberTextSelection} title="Marca-texto">
            <Highlighter size={17} />
            <input
              aria-label="Cor do marca-texto"
              onChange={(event) => selectedChain()?.setHighlight({ color: event.target.value }).run()}
              type="color"
              value={editor?.getAttributes("highlight").color ?? "#fff08a"}
            />
          </label>
        </div>
        <div className="study-toolbar-group">
          <ToolbarButton active={editor?.isActive({ textAlign: "left" })} label="Alinhar à esquerda" onClick={() => selectedChain()?.setTextAlign("left").run()}><AlignLeft size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: "center" })} label="Centralizar" onClick={() => selectedChain()?.setTextAlign("center").run()}><AlignCenter size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: "right" })} label="Alinhar à direita" onClick={() => selectedChain()?.setTextAlign("right").run()}><AlignRight size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: "justify" })} label="Justificar" onClick={() => selectedChain()?.setTextAlign("justify").run()}><AlignJustify size={17} /></ToolbarButton>
          <select
            aria-label="Espaçamento entre linhas"
            className="study-toolbar-select line-height"
            disabled={!editor}
            onChange={(event) => selectedChain()?.setLineHeight(event.target.value).run()}
            onPointerDown={rememberTextSelection}
            title="Espaçamento entre linhas"
            value={lineHeightValue}
          >
            <option disabled value="">Vários</option>
            {lineHeights.map((height) => <option key={height} value={height}>{height}</option>)}
          </select>
        </div>
        <div className="study-toolbar-group">
          <ToolbarButton label="Diminuir recuo" onClick={() => editor && changeBlockIndent(editor, -1)}><IndentDecrease size={17} /></ToolbarButton>
          <ToolbarButton label="Aumentar recuo" onClick={() => editor && changeBlockIndent(editor, 1)}><IndentIncrease size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("bulletList")} label="Lista com marcadores" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("orderedList")} label="Lista numerada" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("blockquote")} label="Citação" onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("codeBlock")} label="Bloco de código" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 size={17} /></ToolbarButton>
          <ToolbarButton label="Linha horizontal" onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus size={17} /></ToolbarButton>
        </div>
        <div className="study-toolbar-group">
          <ToolbarButton active={editor?.isActive("link")} label={editor?.isActive("link") ? "Remover link" : "Adicionar link"} onClick={handleLink}><Link2 size={17} /></ToolbarButton>
          <ToolbarButton disabled={imageBusy} label="Adicionar imagem" onClick={() => imageInputRef.current?.click()}>
            {imageBusy ? <LoaderCircle className="spin-icon" size={17} /> : <ImagePlus size={17} />}
          </ToolbarButton>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            onChange={(event) => void handleImage(event.target.files?.[0])}
            ref={imageInputRef}
            type="file"
          />
          <div className="study-table-control" ref={tableControlRef}>
            <ToolbarButton active={tablePickerOpen || Boolean(editor?.isActive("table"))} label="Tabela" onClick={toggleTablePicker}>
              <Table2 size={17} />
            </ToolbarButton>
            {tablePickerOpen ? (
              <div
                className="study-table-popover"
                style={{ left: tableMenuPosition.left, top: tableMenuPosition.top }}
              >
                <div className="study-table-popover-heading">
                  <strong>Inserir tabela</strong>
                  <span>{tableSize.rows} x {tableSize.columns}</span>
                </div>
                <div
                  aria-label={`Tabela com ${tableSize.rows} linhas e ${tableSize.columns} colunas`}
                  className="study-table-grid"
                  role="group"
                  style={{ "--table-picker-columns": TABLE_PICKER_COLUMNS } as CSSProperties}
                >
                  {Array.from({ length: TABLE_PICKER_ROWS * TABLE_PICKER_COLUMNS }, (_, index) => {
                    const row = Math.floor(index / TABLE_PICKER_COLUMNS) + 1;
                    const column = (index % TABLE_PICKER_COLUMNS) + 1;
                    const selected = row <= tableSize.rows && column <= tableSize.columns;
                    return (
                      <button
                        aria-label={`${row} linhas por ${column} colunas`}
                        className={selected ? "selected" : ""}
                        key={`${row}-${column}`}
                        onClick={() => insertTable(row, column)}
                        onFocus={() => setTableSize({ rows: row, columns: column })}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setTableSize({ rows: row, columns: column })}
                        type="button"
                      />
                    );
                  })}
                </div>
                {editor?.isActive("table") ? (
                  <div className="study-table-actions">
                    <span>Editar tabela selecionada</span>
                    <div>
                      <button onClick={() => editor.chain().focus().addRowAfter().run()} onMouseDown={(event) => event.preventDefault()} title="Adicionar linha abaixo" type="button"><Rows3 size={15} />+ Linha</button>
                      <button onClick={() => editor.chain().focus().deleteRow().run()} onMouseDown={(event) => event.preventDefault()} title="Excluir linha" type="button"><Rows3 size={15} />- Linha</button>
                      <button onClick={() => editor.chain().focus().addColumnAfter().run()} onMouseDown={(event) => event.preventDefault()} title="Adicionar coluna depois" type="button"><Columns3 size={15} />+ Coluna</button>
                      <button onClick={() => editor.chain().focus().deleteColumn().run()} onMouseDown={(event) => event.preventDefault()} title="Excluir coluna" type="button"><Columns3 size={15} />- Coluna</button>
                      <button className="danger" onClick={() => editor.chain().focus().deleteTable().run()} onMouseDown={(event) => event.preventDefault()} title="Excluir tabela" type="button"><Trash2 size={15} />Excluir tabela</button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
          </>
        )}
      </div>

      <div className="study-document-body">
        {outlineOpen ? <button aria-label="Fechar questões" className="study-outline-backdrop" onClick={() => setOutlineOpen(false)} type="button" /> : null}
        <aside className={`study-document-outline ${outlineOpen ? "open" : ""}`}>
          <div className="study-outline-header">
            <div>
              <ListTree size={17} />
              <strong>Questões</strong>
            </div>
            <button aria-label="Fechar questões" onClick={() => setOutlineOpen(false)} title="Fechar" type="button"><X size={16} /></button>
          </div>
          {questions.length ? (
            <>
              <button className="study-outline-insert" onClick={() => insertQuestions(questions)} type="button">
                <Plus size={15} />Inserir questões ausentes
              </button>
              <nav aria-label="Questões da lista" className="study-outline-list">
                {questions.map((question) => {
                  const present = questionPositions.has(question.id);
                  return (
                    <button className={present ? "present" : ""} key={question.id} onClick={() => scrollToQuestion(question)} type="button">
                      <span>{present ? <Check size={13} /> : <Plus size={13} />}</span>
                      <span>{question.label}</span>
                    </button>
                  );
                })}
              </nav>
            </>
          ) : <p className="study-outline-empty">Nenhuma questão configurada.</p>}
        </aside>

        <main className="study-document-canvas">
          {syncError ? <div className="study-document-sync-alert" role="status">{syncError}</div> : null}
          <article
            className="study-document-paper"
            style={{ "--study-document-zoom": zoom / 100 } as CSSProperties}
          >
            {status === "loading" ? (
              <div className="study-document-loading"><LoaderCircle className="spin-icon" size={22} />Abrindo caderno...</div>
            ) : null}
            <EditorContent editor={editor} />
          </article>
        </main>
      </div>
      {imageCropTarget ? (
        <StudyImageCropDialog
          alt={imageCropTarget.alt}
          onApply={applyImageCrop}
          onClose={() => setImageCropTarget(null)}
          originalAspect={imageCropTarget.originalAspect}
          src={imageCropTarget.src}
        />
      ) : null}
    </section>
  );
}
