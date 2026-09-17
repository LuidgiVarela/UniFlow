"use client";

import Highlight from "@tiptap/extension-highlight";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
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
  FileDown,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  LoaderCircle,
  Minus,
  PanelLeft,
  Plus,
  Quote,
  Redo2,
  Save,
  Strikethrough,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

const AUTOSAVE_DELAY_MS = 900;
const EMPTY_DOCUMENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

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
    const label = /[.)]$/.test(item.trim()) ? item.trim() : `${item.trim()})`;
    nodes.push({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: label }],
    });
    nodes.push({ type: "paragraph" });
  }
  return nodes;
}

function countWords(value: string) {
  const clean = value.trim();
  return clean ? clean.split(/\s+/).length : 0;
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
  const [title, setTitle] = useState(defaultTitle);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [, refreshToolbar] = useReducer((value: number) => value + 1, 0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<StudyDocument | null>(null);
  const titleRef = useRef(defaultTitle);
  const readyRef = useRef(false);
  const lastSavedSignatureRef = useRef("");
  const saveTimerRef = useRef<number | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const needsResaveRef = useRef(false);
  const saveNowRef = useRef<(force?: boolean) => Promise<boolean>>(async () => false);

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
    onSelectionUpdate: () => refreshToolbar(),
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

      documentRef.current = initial;
      titleRef.current = initial.title;
      setTitle(initial.title);
      currentEditor.commands.setContent(initial.content as JSONContent, { emitUpdate: false });
      currentEditor.setEditable(true);
      setWordCount(countWords(currentEditor.getText()));
      setSavedAt(remote?.updated_at ?? null);
      lastSavedSignatureRef.current = remote ? documentSignature(remote) : documentSignature(initial);
      readyRef.current = true;

      if (remoteError) {
        setStatus("local");
        setSyncError("Sincronização indisponível. O rascunho continuará protegido neste navegador.");
      } else if (localIsNewer) {
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
  }, [defaultTitle, demand.id, editor]);

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
    if (value === "paragraph") editor.chain().focus().setParagraph().run();
    else if (value === "quote") editor.chain().focus().toggleBlockquote().run();
    else if (value === "code") editor.chain().focus().toggleCodeBlock().run();
    else editor.chain().focus().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  }

  function handleLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const href = window.prompt("Endereço do link:", "https://");
    if (!href) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }

  async function handleImage(file?: File) {
    if (!editor || !file) return;
    if (file.size > 8 * 1024 * 1024) {
      setSyncError("Escolha uma imagem com até 8 MB.");
      return;
    }
    setImageBusy(true);
    setSyncError(null);
    try {
      const src = await optimizeImage(file);
      editor.chain().focus().setImage({ src, alt: file.name, title: file.name }).run();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Não foi possível adicionar a imagem.");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
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
        <div className="study-toolbar-group">
          <select aria-label="Estilo do parágrafo" className="study-toolbar-select block-style" disabled={!editor} onChange={(event) => handleBlockType(event.target.value)} value={blockType}>
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
              if (value) editor?.chain().focus().setFontFamily(value).run();
              else editor?.chain().focus().unsetFontFamily().run();
            }}
            value={textStyle.fontFamily ?? ""}
          >
            <option value="">Fonte</option>
            {fontFamilies.map((font) => <option key={font.label} value={font.value}>{font.label}</option>)}
          </select>
          <select
            aria-label="Tamanho da fonte"
            className="study-toolbar-select font-size"
            disabled={!editor}
            onChange={(event) => editor?.chain().focus().setFontSize(`${event.target.value}px`).run()}
            value={(textStyle.fontSize as string | undefined)?.replace("px", "") ?? "16"}
          >
            {fontSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
        <div className="study-toolbar-group">
          <ToolbarButton active={editor?.isActive("bold")} label="Negrito" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("italic")} label="Itálico" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("underline")} label="Sublinhado" onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive("strike")} label="Tachado" onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough size={17} /></ToolbarButton>
          <label className="study-toolbar-color" title="Cor do texto">
            <span aria-hidden="true" style={{ background: textStyle.color ?? "#202124" }} />
            <input aria-label="Cor do texto" onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} type="color" value={textStyle.color ?? "#202124"} />
          </label>
          <label className="study-toolbar-highlight" title="Marca-texto">
            <Highlighter size={17} />
            <input
              aria-label="Cor do marca-texto"
              onChange={(event) => editor?.chain().focus().setHighlight({ color: event.target.value }).run()}
              type="color"
              value={editor?.getAttributes("highlight").color ?? "#fff08a"}
            />
          </label>
        </div>
        <div className="study-toolbar-group">
          <ToolbarButton active={editor?.isActive({ textAlign: "left" })} label="Alinhar à esquerda" onClick={() => editor?.chain().focus().setTextAlign("left").run()}><AlignLeft size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: "center" })} label="Centralizar" onClick={() => editor?.chain().focus().setTextAlign("center").run()}><AlignCenter size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: "right" })} label="Alinhar à direita" onClick={() => editor?.chain().focus().setTextAlign("right").run()}><AlignRight size={17} /></ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: "justify" })} label="Justificar" onClick={() => editor?.chain().focus().setTextAlign("justify").run()}><AlignJustify size={17} /></ToolbarButton>
          <select
            aria-label="Espaçamento entre linhas"
            className="study-toolbar-select line-height"
            disabled={!editor}
            onChange={(event) => editor?.chain().focus().setLineHeight(event.target.value).run()}
            title="Espaçamento entre linhas"
            value={textStyle.lineHeight ?? "1.5"}
          >
            {lineHeights.map((height) => <option key={height} value={height}>{height}</option>)}
          </select>
        </div>
        <div className="study-toolbar-group">
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
        </div>
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
          <article className="study-document-paper">
            {status === "loading" ? (
              <div className="study-document-loading"><LoaderCircle className="spin-icon" size={22} />Abrindo caderno...</div>
            ) : null}
            <EditorContent editor={editor} />
          </article>
        </main>
      </div>
    </section>
  );
}
