"use client";

import { useEffect, useState } from "react";
import { useAppData } from "@/components/data-provider";
import type { Subject } from "@/types/domain";

export function SubjectModal({
  open,
  onClose,
  subject,
}: {
  open: boolean;
  onClose: () => void;
  subject?: Subject | null;
}) {
  const { subjects, upsertSubject } = useAppData();
  const [form, setForm] = useState<Subject>({
    id: crypto.randomUUID(),
    name: "",
    code: "",
    color: "#2f7dd1",
    status: "tranquilo",
    notes: "",
  });

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (subject) {
        setForm(subject);
        return;
      }
      setForm((current) => ({
        ...current,
        id: crypto.randomUUID(),
        name: "",
        code: "",
        notes: "",
      }));
    });
  }, [subject, open]);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await upsertSubject({
      ...form,
      sort_order: form.sort_order ?? subjects.length + 1,
    });
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <form className="modal form-stack" onSubmit={submit}>
        <div className="modal-header">
          <h2>{subject ? "Editar matéria" : "Nova matéria"}</h2>
          <button className="icon-button" onClick={onClose} type="button">x</button>
        </div>
        <label>Nome<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <div className="form-grid">
          <label>Sigla<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></label>
          <label>Cor<input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
        </div>
        <label>Observações<textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button className="primary-button full" type="submit">Salvar</button>
      </form>
    </div>
  );
}
