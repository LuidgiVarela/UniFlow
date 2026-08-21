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
  Home,
  LogOut,
  Menu,
  Plus,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAppData } from "@/components/data-provider";
import { SubjectModal } from "@/components/subject-modal";
import type { Subject } from "@/types/domain";

function SortableSubjectLink({
  subject,
  active,
  onNavigate,
}: {
  subject: Subject;
  active: boolean;
  onNavigate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subject.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Link
      className={`subject-nav-item ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      href={`/materias/${subject.id}`}
      onClick={onNavigate}
      ref={setNodeRef}
      style={style}
      title={subject.name}
      {...attributes}
      {...listeners}
    >
      <span className="color-dot" style={{ background: subject.color }} />
      <span>{subject.code}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { demoMode, signOut, user } = useAuth();
  const { subjects, reorderSubjects } = useAppData();
  const sortedSubjects = [...subjects].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
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

  return (
    <div className="app-shell">
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

          <p className="sidebar-label">Matérias</p>
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
            <SortableContext items={sortedSubjects.map((subject) => subject.id)} strategy={verticalListSortingStrategy}>
              <div className="subject-nav-list">
                {sortedSubjects.map((subject) => (
                  <SortableSubjectLink
                    active={pathname === `/materias/${subject.id}`}
                    key={subject.id}
                    onNavigate={() => setMenuOpen(false)}
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
          <button className="ghost-button" onClick={() => setSettingsOpen(true)} type="button">
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
            aria-label="Abrir menu"
            className="icon-button mobile-only"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
      <SubjectModal open={subjectOpen} onClose={() => setSubjectOpen(false)} />
      {settingsOpen ? (
        <div className="modal-backdrop">
          <section className="modal form-stack compact-modal">
            <div className="modal-header">
              <h2>Configuracoes</h2>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} type="button">x</button>
            </div>
            <div className="settings-list">
              <div>
                <span>Conta</span>
                <strong>{demoMode ? "Modo demo" : user?.email ?? "Usuario conectado"}</strong>
              </div>
              <div>
                <span>Dados</span>
                <strong>{demoMode ? "Salvos neste navegador" : "Sincronizados com Supabase"}</strong>
              </div>
            </div>
            <button className="primary-button full" onClick={() => setSettingsOpen(false)} type="button">Fechar</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
