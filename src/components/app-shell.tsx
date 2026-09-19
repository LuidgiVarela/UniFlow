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
  Activity,
  CalendarDays,
  CalendarX2,
  BookOpenCheck,
  CircleAlert,
  Database,
  FilePenLine,
  HardDrive,
  Home,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings,
  Settings2,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAppData } from "@/components/data-provider";
import type { MaterialStorageUsage } from "@/lib/repositories/uniflow-repository";
import {
  DEFAULT_USER_PREFERENCES,
  readUserPreferences,
  writeUserPreferences,
  type UserPreferences,
} from "@/lib/user-preferences";
import { SubjectModal } from "@/components/subject-modal";
import type { Subject } from "@/types/domain";

type SettingsSection = "preferences" | "data" | "account";

function SettingsToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`settings-switch ${checked ? "active" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span />
    </button>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function SortableSubjectLink({
  subject,
  active,
  removing,
  onNavigate,
  onRemove,
}: {
  subject: Subject;
  active: boolean;
  removing: boolean;
  onNavigate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subject.id,
    disabled: removing,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      aria-busy={removing}
      className={`subject-nav-row ${active ? "active" : ""} ${isDragging ? "dragging" : ""} ${removing ? "is-pending-removal" : ""}`}
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
        className={`subject-remove-button ${removing ? "is-loading" : ""}`}
        disabled={removing}
        onClick={onRemove}
        onPointerDown={(event) => event.stopPropagation()}
        title="Remover matéria"
        type="button"
      >
        {removing ? null : <Trash2 size={13} />}
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("preferences");
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [storageUsage, setStorageUsage] = useState<MaterialStorageUsage | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [settingsSyncing, setSettingsSyncing] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const { demoMode, signOut, user } = useAuth();
  const {
    clearOperationError,
    demands,
    getStorageUsage,
    loadError,
    loading,
    materials,
    operationError,
    pendingOperations,
    refresh,
    removeSubject,
    subjects,
    reorderSubjects,
  } = useAppData();
  const pdfEditorMode = pathname.startsWith("/materiais/editar/");
  const studyDocumentEditorMode = /^\/tarefas\/[^/]+\/caderno/.test(pathname);
  const sortedSubjects = [...subjects].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
  const storagePercent = storageUsage
    ? Math.min(100, Math.round((storageUsage.usedBytes / storageUsage.limitBytes) * 100))
    : 0;
  const activeOperation = Object.values(pendingOperations).at(-1) ?? null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedPreferences = readUserPreferences();
      setPreferences(storedPreferences);
      if (!window.matchMedia("(max-width: 900px)").matches) {
        setSidebarCollapsed(storedPreferences.sidebarInitiallyCollapsed);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("reduce-motion", preferences.reduceMotion);
    return () => document.body.classList.remove("reduce-motion");
  }, [preferences.reduceMotion]);

  useEffect(() => {
    if (!settingsOpen) return;
    function closeSettings(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }
    window.addEventListener("keydown", closeSettings);
    return () => window.removeEventListener("keydown", closeSettings);
  }, [settingsOpen]);

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

    if (pathname === "/revisoes") {
      document.title = "UniFlow - Revisões";
      return;
    }

    if (pathname === "/calendario") {
      document.title = "UniFlow - Calendário";
      return;
    }

    const studyDocumentMatch = pathname.match(/^\/tarefas\/([^/]+)\/caderno/);
    if (studyDocumentMatch) {
      const demand = demands.find((item) => item.id === studyDocumentMatch[1]);
      document.title = demand ? `Caderno - ${demand.title}` : "UniFlow - Caderno";
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

    const materialEditorMatch = pathname.match(/^\/materiais\/editar\/([^/]+)/);
    if (materialEditorMatch) {
      const material = materials.find((item) => item.id === materialEditorMatch[1]);
      document.title = material ? `UniFlow - Editar ${material.name}` : "UniFlow - Editor de PDF";
      return;
    }

    document.title = "UniFlow";
  }, [demands, materials, pathname, subjects]);

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
    setSettingsSection("preferences");
    setSettingsMessage(null);
    setSettingsOpen(true);
    void loadStorageStats();
  }

  function updatePreference<Key extends keyof UserPreferences>(key: Key, value: UserPreferences[Key]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    writeUserPreferences(next);
    if (key === "sidebarInitiallyCollapsed" && !window.matchMedia("(max-width: 900px)").matches) {
      setSidebarCollapsed(Boolean(value));
    }
  }

  async function syncSettingsData() {
    setSettingsSyncing(true);
    setSettingsMessage(null);
    try {
      await refresh(false);
      await loadStorageStats();
      setSettingsMessage({ text: "Dados sincronizados agora.", tone: "success" });
    } catch (error) {
      setSettingsMessage({
        text: error instanceof Error ? error.message : "Não foi possível sincronizar agora.",
        tone: "error",
      });
    } finally {
      setSettingsSyncing(false);
    }
  }

  async function handleRemoveSubject(subject: Subject) {
    const ok = window.confirm(`Remover "${subject.name}"? Isso apaga a matéria e seus dados vinculados.`);
    if (!ok) return;
    try {
      await removeSubject(subject.id);
      if (pathname === `/materias/${subject.id}`) router.push("/");
    } catch {
      // A mensagem detalhada aparece no indicador global da operação.
    }
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
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${pdfEditorMode ? "pdf-editor-shell" : ""} ${studyDocumentEditorMode ? "study-document-shell" : ""}`}>
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
          <Link className={`nav-item ${pathname === "/revisoes" ? "active" : ""}`} href="/revisoes" onClick={() => setMenuOpen(false)}>
            <BookOpenCheck size={17} />
            <span>Revisões</span>
          </Link>
          <Link className={`nav-item ${pathname === "/calendario" ? "active" : ""}`} href="/calendario" onClick={() => setMenuOpen(false)}>
            <CalendarDays size={17} />
            <span>Calendário</span>
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
                    onRemove={() => void handleRemoveSubject(subject)}
                    removing={Boolean(pendingOperations[`delete:subject:${subject.id}`])}
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
          {operationError ? (
            <div aria-live="assertive" className="app-operation-status error" role="alert">
              <CircleAlert aria-hidden="true" size={16} />
              <span>{operationError}</span>
              <button aria-label="Fechar aviso" onClick={clearOperationError} type="button"><X size={14} /></button>
            </div>
          ) : activeOperation ? (
            <div aria-live="polite" className="app-operation-status" role="status">
              <span aria-hidden="true" className="app-operation-spinner" />
              <span>{activeOperation}</span>
            </div>
          ) : null}
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
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSettingsOpen(false);
          }}
        >
          <section aria-labelledby="settings-title" aria-modal="true" className="modal settings-modal" role="dialog">
            <header className="settings-modal-header">
              <div className="settings-modal-title">
                <span><Settings2 aria-hidden="true" size={20} /></span>
                <div>
                  <h2 id="settings-title">Configurações</h2>
                  <p>Preferências e informações do seu UniFlow.</p>
                </div>
              </div>
              <button aria-label="Fechar configurações" className="icon-button" onClick={() => setSettingsOpen(false)} type="button">
                <X size={18} />
              </button>
            </header>

            <div className="settings-modal-body">
              <nav aria-label="Seções das configurações" className="settings-tabs">
                <button className={settingsSection === "preferences" ? "active" : ""} onClick={() => setSettingsSection("preferences")} type="button">
                  <SlidersHorizontal size={16} /><span>Preferências</span>
                </button>
                <button className={settingsSection === "data" ? "active" : ""} onClick={() => setSettingsSection("data")} type="button">
                  <Database size={16} /><span>Dados</span>
                </button>
                <button className={settingsSection === "account" ? "active" : ""} onClick={() => setSettingsSection("account")} type="button">
                  <UserRound size={16} /><span>Conta</span>
                </button>
              </nav>

              <div className="settings-pane">
                {settingsSection === "preferences" ? (
                  <>
                    <section className="settings-section">
                      <header>
                        <h3>Interface</h3>
                        <p>Ajuste o comportamento geral para o seu jeito de usar o app.</p>
                      </header>
                      <div className="settings-option">
                        <span className="settings-option-icon"><PanelLeftClose size={17} /></span>
                        <div>
                          <strong>Iniciar com o menu lateral recolhido</strong>
                          <small>Libera mais espaço horizontal ao entrar no UniFlow.</small>
                        </div>
                        <SettingsToggle
                          checked={preferences.sidebarInitiallyCollapsed}
                          label="Iniciar com o menu lateral recolhido"
                          onChange={(checked) => updatePreference("sidebarInitiallyCollapsed", checked)}
                        />
                      </div>
                      <div className="settings-option">
                        <span className="settings-option-icon"><Activity size={17} /></span>
                        <div>
                          <strong>Reduzir animações</strong>
                          <small>Diminui transições e movimentos da interface.</small>
                        </div>
                        <SettingsToggle
                          checked={preferences.reduceMotion}
                          label="Reduzir animações"
                          onChange={(checked) => updatePreference("reduceMotion", checked)}
                        />
                      </div>
                    </section>

                    <section className="settings-section">
                      <header>
                        <h3>Editor de PDF</h3>
                        <p>Controle quanto espaço o painel de propriedades deve ocupar.</p>
                      </header>
                      <div className="settings-option">
                        <span className="settings-option-icon"><FilePenLine size={17} /></span>
                        <div>
                          <strong>Painel ao abrir o editor</strong>
                          <small>Em janelas estreitas ele sempre começa recolhido.</small>
                        </div>
                        <div aria-label="Estado inicial do painel de propriedades" className="settings-segmented" role="group">
                          <button
                            aria-pressed={preferences.pdfInspectorInitiallyOpen}
                            className={preferences.pdfInspectorInitiallyOpen ? "active" : ""}
                            onClick={() => updatePreference("pdfInspectorInitiallyOpen", true)}
                            type="button"
                          >Aberto</button>
                          <button
                            aria-pressed={!preferences.pdfInspectorInitiallyOpen}
                            className={!preferences.pdfInspectorInitiallyOpen ? "active" : ""}
                            onClick={() => updatePreference("pdfInspectorInitiallyOpen", false)}
                            type="button"
                          >Fechado</button>
                        </div>
                      </div>
                      <div className="settings-option">
                        <span className="settings-option-icon"><Settings2 size={17} /></span>
                        <div>
                          <strong>Abrir propriedades ao editar</strong>
                          <small>Mostra o painel ao escolher uma ferramenta ou selecionar uma edição.</small>
                        </div>
                        <SettingsToggle
                          checked={preferences.pdfInspectorAutoOpen}
                          label="Abrir propriedades automaticamente ao editar"
                          onChange={(checked) => updatePreference("pdfInspectorAutoOpen", checked)}
                        />
                      </div>
                    </section>
                  </>
                ) : null}

                {settingsSection === "data" ? (
                  <>
                    <section className="settings-section">
                      <header>
                        <h3>Resumo dos dados</h3>
                        <p>Uma visão rápida do conteúdo atualmente sincronizado.</p>
                      </header>
                      <div className="settings-data-overview">
                        <div><strong>{subjects.length}</strong><span>Matérias</span></div>
                        <div><strong>{demands.length}</strong><span>Tarefas</span></div>
                        <div><strong>{materials.length}</strong><span>Materiais</span></div>
                      </div>
                    </section>

                    <section className="settings-section settings-storage-section">
                      <header>
                        <div>
                          <HardDrive aria-hidden="true" size={17} />
                          <h3>Arquivos enviados</h3>
                        </div>
                        <button aria-label="Atualizar uso do armazenamento" className="icon-button" disabled={storageLoading} onClick={() => void loadStorageStats()} title="Atualizar armazenamento" type="button">
                          <RefreshCw className={storageLoading ? "spinning" : ""} size={16} />
                        </button>
                      </header>
                      <div className="settings-storage-copy">
                        <strong>
                          {storageLoading && !storageUsage
                            ? "Calculando..."
                            : storageUsage
                              ? `${formatBytes(storageUsage.usedBytes)} de ${formatBytes(storageUsage.limitBytes)}`
                              : "Indisponível"}
                        </strong>
                        <span>{storageUsage ? `${storagePercent}% usado` : "Limite estimado do plano atual"}</span>
                      </div>
                      <div aria-label={`${storagePercent}% do armazenamento usado`} className="settings-storage-bar" role="progressbar" aria-valuemax={100} aria-valuemin={0} aria-valuenow={storagePercent}>
                        <span style={{ width: `${storagePercent}%` }} />
                      </div>
                      <small>
                        {storageUsage ? `${storageUsage.fileCount} arquivos armazenados` : "O uso será recalculado quando estiver disponível."}
                      </small>
                      {storageError ? <small className="error-message">{storageError}</small> : null}
                    </section>

                    <section className="settings-section">
                      <div className="settings-sync-row">
                        <span className="settings-option-icon"><Database size={17} /></span>
                        <div>
                          <strong>{demoMode ? "Dados deste navegador" : "Sincronização com Supabase"}</strong>
                          <small>{demoMode ? "As alterações ficam neste dispositivo." : "Busca a versão mais recente dos seus dados sem apagar alterações."}</small>
                        </div>
                        <button className={`ghost-action ${settingsSyncing ? "is-loading" : ""}`} disabled={settingsSyncing} onClick={() => void syncSettingsData()} type="button">
                          {settingsSyncing ? null : <RefreshCw size={15} />}
                          <span>{settingsSyncing ? "Sincronizando..." : "Sincronizar agora"}</span>
                        </button>
                      </div>
                      {settingsMessage ? <p className={`settings-message ${settingsMessage.tone}`} role="status">{settingsMessage.text}</p> : null}
                    </section>
                  </>
                ) : null}

                {settingsSection === "account" ? (
                  <section className="settings-section settings-account-section">
                    <header>
                      <h3>Conta atual</h3>
                      <p>Sessão usada para acessar e sincronizar o UniFlow.</p>
                    </header>
                    <div className="settings-account-profile">
                      <span>{demoMode ? "D" : (user?.email?.charAt(0) ?? "U").toLocaleUpperCase("pt-BR")}</span>
                      <div>
                        <strong>{demoMode ? "Modo demonstração" : user?.email ?? "Usuário conectado"}</strong>
                        <small>{demoMode ? "Dados locais neste navegador" : "Conta autenticada pelo Supabase"}</small>
                      </div>
                    </div>
                    <div className="settings-account-row">
                      <span>Persistência</span>
                      <strong>{demoMode ? "Navegador atual" : "Nuvem"}</strong>
                    </div>
                    <div className="settings-account-row">
                      <span>Sessão</span>
                      <strong className="settings-online-status">Ativa</strong>
                    </div>
                    <button className="ghost-action danger settings-sign-out" onClick={() => void signOut()} type="button">
                      <LogOut size={16} />
                      <span>{demoMode ? "Sair do modo demo" : "Sair da conta"}</span>
                    </button>
                  </section>
                ) : null}
              </div>
            </div>

            <footer className="settings-modal-footer">
              <small>As preferências ficam salvas neste navegador.</small>
              <button className="primary-button small" onClick={() => setSettingsOpen(false)} type="button">Concluído</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
