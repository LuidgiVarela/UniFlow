"use client";

import { useState } from "react";
import { useAppData } from "@/components/data-provider";
import { hasSupabaseEnv } from "@/lib/supabase/client";
import type { MaterialType } from "@/types/domain";

export function MaterialModal({
  open,
  onClose,
  subjectId,
}: {
  open: boolean;
  onClose: () => void;
  subjectId: string;
}) {
  const { upsertMaterial, uploadMaterialFile } = useAppData();
  const [type, setType] = useState<MaterialType>("file");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      if (type === "link") {
        await upsertMaterial({
          id: crypto.randomUUID(),
          subject_id: subjectId,
          name: name.trim() || url,
          type: "link",
          url,
          file_path: null,
          created_at: new Date().toISOString(),
        });
      } else {
        if (!hasSupabaseEnv) {
          setMessage("Upload de arquivos precisa do Supabase configurado. Links continuam funcionando no modo demo.");
          return;
        }
        if (!file) {
          setMessage("Selecione um arquivo.");
          return;
        }
        await uploadMaterialFile(subjectId, file, name);
      }
      setName("");
      setUrl("");
      setFile(null);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o material.");
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="modal form-stack compact-modal" onSubmit={submit}>
        <div className="modal-header">
          <h2>Adicionar material</h2>
          <button className="icon-button" onClick={onClose} type="button">x</button>
        </div>
        <div className="segmented-control">
          <button className={type === "file" ? "active" : ""} onClick={() => setType("file")} type="button">Arquivo</button>
          <button className={type === "link" ? "active" : ""} onClick={() => setType("link")} type="button">Link</button>
        </div>
        <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Opcional" /></label>
        {type === "file" ? (
          <label>Arquivo<input onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" /></label>
        ) : (
          <label>URL<input value={url} onChange={(event) => setUrl(event.target.value)} required type="url" /></label>
        )}
        {message ? <p className="form-message">{message}</p> : null}
        <button className="primary-button full" type="submit">Salvar material</button>
      </form>
    </div>
  );
}
