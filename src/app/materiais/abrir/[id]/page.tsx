"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/data-provider";
import { Panel } from "@/components/ui";

export default function OpenMaterialPage() {
  const params = useParams<{ id: string }>();
  const { getMaterialUrl, loading, materials } = useAppData();
  const [message, setMessage] = useState("Preparando arquivo...");
  const material = useMemo(
    () => materials.find((item) => item.id === params.id) ?? null,
    [materials, params.id],
  );

  useEffect(() => {
    if (loading) return;
    let active = true;

    void Promise.resolve().then(async () => {
      if (!material) {
        if (active) setMessage("Material não encontrado.");
        return;
      }

      try {
        const href = material.type === "link" ? material.url : await getMaterialUrl(material);
        if (!href || href === "#") throw new Error("Link do material indisponível.");
        window.location.replace(href);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : "Não foi possível abrir o arquivo.");
      }
    });

    return () => {
      active = false;
    };
  }, [getMaterialUrl, loading, material]);

  return (
    <Panel className="plain-section loading-panel">
      <p className="eyebrow">UniFlow</p>
      <h1>{message}</h1>
      {message !== "Preparando arquivo..." ? (
        <Link className="link-button" href="/">
          Voltar ao UniFlow
        </Link>
      ) : null}
    </Panel>
  );
}
