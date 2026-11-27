import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Ícone de linha num quadrado de fundo claro — o "selo" dos cartões de painel.
 * No lugar das figurinhas 3D da referência: docs/04 proíbe emoji na
 * interface. Decorativo (`aria-hidden`): o título ao lado diz o que é.
 */

/** Tons do quadrado de ícone dos cartões. Fundo claro, ícone com contraste. */
export const TONS = {
  verde: "bg-[#e8f0eb] text-[#14532d]",
  azul: "bg-[#e8eefb] text-[#1e3a8a]",
  ambar: "bg-[#fdf3e7] text-[#b45309]",
  vermelho: "bg-[#fdecea] text-[#b42318]",
  roxo: "bg-[#f1ecfb] text-[#5b21b6]",
  cinza: "bg-[#eef0f2] text-[#3f4a54]",
} as const;
export type Tom = keyof typeof TONS;

export function IconeEmQuadro({ icone: Icone, tom, tamanho = "md" }: { icone: LucideIcon; tom: Tom; tamanho?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-content-center rounded-lg",
        TONS[tom],
        tamanho === "md" ? "size-11" : "size-9",
      )}
    >
      <Icone strokeWidth={1.75} className={tamanho === "md" ? "size-5" : "size-[18px]"} />
    </span>
  );
}

