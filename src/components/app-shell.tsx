"use client";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarX2,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAppData } from "@/components/data-provider";
import type { MaterialStorageUsage } from "@/lib/repositories/uniflow-repository";
import { SubjectModal } from "@/components/subject-modal";
import type { Subject } from "@/types/domain";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function SortableSubjectLink({
  subject,
  active,
  onNavigate,
  onRemove,
}: {
  subject: Subject;
  active: boolean;
  onNavigate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subject.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      className={`subject-nav-row ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <Link
        className="subject-nav-item"
        href={`/materias/${subject.id}`}
        onClick={onNavigate}
        title={subject.name}
      >
        <span className="color-dot" style={{ background: subject.color }} />
        <span>{subject.code}</span>
      </Link>
      <button
        className="subject-remove-button"
        onClick={onRemove}
        onPointerDown={(event) => event.stopPropagation()}
        title="Remover matéria"
        type="button"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageUsage, setStorageUsage] = useState<MaterialStorageUsage | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const { demoMode, signOut, user } = useAuth();
  const { demands, getStorageUsage, loadError, loading, refresh, removeSubject, subjects, reorderSubjects } = useAppData();
  const sortedSubjects = [...subjects].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
  const storagePercent = storageUsage
    ? Math.min(100, Math.round((storageUsage.usedBytes / storageUsage.limitBytes) * 100))
    : 0;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedSubjects.findIndex((subject) => subject.id === active.id);
    const newIndex = sortedSubjects.findIndex((subject) => subject.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(sortedSubjects, oldIndex, newIndex).map((subject) => subject.id);
    await reorderSubjects(next);
  }

  useEffect(() => {
    if (pathname === "/faltometro") {
      document.title = "UniFlow - Faltômetro";
      return;
    }

    const subjectMatch = pathname.match(/^\/materias\/([^/]+)/);
    if (subjectMatch) {
      const subject = subjects.find((item) => item.id === subjectMatch[1]);
      document.title = subject ? `UniFlow - ${subject.code}` : "UniFlow";
      return;
    }

    const taskMatch = pathname.match(/^\/tarefas\/([^/]+)/);
    if (taskMatch) {
      const demand = demands.find((item) => item.id === taskMatch[1]);
      const subject = demand ? subjects.find((item) => item.id === demand.subject_id) : null;
      document.title = subject ? `UniFlow - ${subject.code}` : "UniFlow";
      return;
    }

    document.title = "UniFlow";
  }, [demands, pathname, subjects]);

  async function loadStorageStats() {
    setStorageLoading(true);
    setStorageError(null);
    try {
      setStorageUsage(await getStorageUsage());
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Não foi possível calcular o uso do Storage.");
    } finally {
      setStorageLoading(false);
    }
  }

  function openSettings() {
    setSettingsOpen(true);
    void loadStorageStats();
  }

  async function handleRemoveSubject(subject: Subject) {
    const ok = window.confirm(`Remover "${subject.name}"? Isso apaga a matéria e seus dados vinculados.`);
    if (!ok) return;
    await removeSubject(subject.id);
    if (pathname === `/materias/${subject.id}`) router.push("/");
  }

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setSidebarCollapsed(false);
      setMenuOpen((value) => !value);
      return;
    }
    setSidebarCollapsed((value) => !value);
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <span>UniFlow</span>
        </div>
        <nav className="nav-list">
          <p className="sidebar-label">Visão geral</p>
          <Link className={`nav-item ${pathname === "/" ? "active" : ""}`} href="/" onClick={() => setMenuOpen(false)}>
            <Home size={17} />
            <span>Visão geral</span>
          </Link>
          <Link className={`nav-item ${pathname === "/faltometro" ? "active" : ""}`} href="/faltometro" onClick={() => setMenuOpen(false)}>
            <CalendarX2 size={17} />
            <span>Faltômetro</span>
          </Link>

          <p className="sidebar-label">Matérias</p>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
            <SortableContext items={sortedSubjects.map((subject) => subject.id)} strategy={verticalListSortingStrategy}>
              <div className="subject-nav-list">
                {sortedSubjects.map((subject) => (
                  <SortableSubjectLink
                    active={pathname === `/materias/${subject.id}`}
                    key={subject.id}
                    onNavigate={() => setMenuOpen(false)}
                    onRemove={() => handleRemoveSubject(subject)}
                    subject={subject}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button className="nav-item nav-button" onClick={() => setSubjectOpen(true)} type="button">
            <Plus size={17} />
            <span>Nova matéria</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="ghost-button" onClick={openSettings} type="button">
            <Settings size={17} />
            <span>Configurações</span>
          </button>
          <button className="ghost-button sign-out" onClick={signOut} type="button">
            <LogOut size={17} />
            <span>{demoMode ? "Modo demo" : user?.email ?? "Conta"}</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button
            aria-label="Alternar menu lateral"
            className="icon-button sidebar-toggle-button"
            onClick={toggleSidebar}
            type="button"
          >
            <span className="mobile-toggle-icon">{menuOpen ? <X size={20} /> : <Menu size={20} />}</span>
            <span className="desktop-toggle-icon">{sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</span>
          </button>
        </header>
        <main className="content">
          {loading ? (
            <section className="plain-section app-loading-state">
              <p className="eyebrow">UniFlow</p>
              <h1>Carregando seus dados...</h1>
              <p className="muted compact-note">Sincronizando com o Supabase.</p>
            </section>
          ) : loadError ? (
            <section className="plain-section app-loading-state">
              <p className="eyebrow">UniFlow</p>
              <h1>Não foi possível carregar agora</h1>
              <p className="muted compact-note">Vou tentar de novo automaticamente, mas você também pode forçar uma nova tentativa.</p>
              <button className="primary-button small" onClick={() => void refresh(true).catch(() => undefined)} type="button">
                Tentar novamente
              </button>
            </section>
          ) : children}
        </main>
      </div>
      <SubjectModal open={subjectOpen} onClose={() => setSubjectOpen(false)} />
      {settingsOpen ? (
        <div className="modal-backdrop">
          <section className="modal form-stack compact-modal">
            <div className="modal-header">
              <h2>Configurações</h2>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} type="button">x</button>
            </div>
            <div className="settings-list">
              <div>
                <span>Conta</span>
                <strong>{demoMode ? "Modo demo" : user?.email ?? "Usuário conectado"}</strong>
              </div>
              <div>
                <span>Dados</span>
                <strong>{demoMode ? "Salvos neste navegador" : "Sincronizados com Supabase"}</strong>
              </div>
              <section className="settings-storage-card">
                <div>
                  <span>Arquivos enviados</span>
                  <strong>
                    {storageLoading && !storageUsage
                      ? "Calculando..."
                      : storageUsage
                        ? `${formatBytes(storageUsage.usedBytes)} de ${formatBytes(storageUsage.limitBytes)}`
                        : "Indisponível"}
                  </strong>
                </div>
                <div className="settings-storage-bar">
                  <span style={{ width: `${storagePercent}%` }} />
                </div>
                <small>
                  {storageUsage ? `${storagePercent}% usado · ${storageUsage.fileCount} arquivos` : "Limite Free estimado: 1 GB de file storage"}
                </small>
                {storageError ? <small className="error-message">{storageError}</small> : null}
              </section>
            </div>
            <button className="primary-button full" onClick={() => setSettingsOpen(false)} type="button">Fechar</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
