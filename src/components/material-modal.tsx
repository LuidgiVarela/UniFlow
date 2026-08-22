"use client";

import { useState } from "react";
import { useAppData } from "@/components/data-provider";
import { hasSupabaseEnv } from "@/lib/supabase/client";
import type { MaterialFolder, MaterialType } from "@/types/domain";

const maxFilesPerUpload = 5;

export function MaterialModal({
  open,
  onClose,
  folders,
  subjectId,
}: {
  open: boolean;
  onClose: () => void;
  folders: MaterialFolder[];
  subjectId: string;
}) {
  const { upsertMaterial, uploadMaterialFile, uploadMaterialFiles } = useAppData();
  const [type, setType] = useState<MaterialType>("file");
  const [folderId, setFolderId] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      if (type === "link") {
        await upsertMaterial({
          id: crypto.randomUUID(),
          subject_id: subjectId,
          folder_id: folderId || null,
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
        if (!files.length) {
          setMessage("Selecione pelo menos um arquivo.");
          return;
        }
        if (files.length > maxFilesPerUpload) {
          setMessage(`Selecione no máximo ${maxFilesPerUpload} arquivos por vez.`);
          return;
        }
        if (files.length === 1) {
          await uploadMaterialFile(subjectId, files[0], name, folderId || null);
        } else {
          await uploadMaterialFiles(subjectId, files, folderId || null);
        }
      }
      setName("");
      setUrl("");
      setFiles([]);
      setFileInputKey((current) => current + 1);
      setFolderId("");
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o material.");
    } finally {
      setSaving(false);
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
          <button
            className={type === "link" ? "active" : ""}
            onClick={() => {
              setType("link");
              setFiles([]);
              setFileInputKey((current) => current + 1);
            }}
            type="button"
          >
            Link
          </button>
        </div>
        <label>
          Pasta
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Solto em Materiais</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </label>
        <label>
          Nome
          <input
            disabled={type === "file" && files.length > 1}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={type === "file" && files.length > 1 ? "Usando o nome de cada arquivo" : "Opcional"}
          />
        </label>
        {type === "file" ? (
          <label>
            Arquivos
            <input
              key={fileInputKey}
              multiple
              onChange={(event) => {
                const selectedFiles = Array.from(event.target.files ?? []);
                setFiles(selectedFiles.slice(0, maxFilesPerUpload));
                setMessage(selectedFiles.length > maxFilesPerUpload ? `Selecionei os ${maxFilesPerUpload} primeiros arquivos.` : null);
              }}
              type="file"
            />
          </label>
        ) : (
          <label>URL<input value={url} onChange={(event) => setUrl(event.target.value)} required type="url" /></label>
        )}
        {type === "file" && files.length ? (
          <div className="file-selection-summary">
            <span>{files.length} de {maxFilesPerUpload} arquivos selecionados</span>
            <small>{files.map((file) => file.name).join(", ")}</small>
          </div>
        ) : null}
        {message ? <p className="form-message">{message}</p> : null}
        <button className={`primary-button full ${saving ? "is-loading" : ""}`} disabled={saving} type="submit">
          {saving ? "Salvando..." : files.length > 1 ? "Salvar materiais" : "Salvar material"}
        </button>
      </form>
    </div>
  );
}
