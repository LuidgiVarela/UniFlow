"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";

export function CloseTaskPageButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  function closePage() {
    window.close();
    window.setTimeout(() => {
      router.push(fallbackHref);
    }, 120);
  }

  return (
    <button className="ghost-action" onClick={closePage} type="button">
      <X size={16} />Fechar
    </button>
  );
}
