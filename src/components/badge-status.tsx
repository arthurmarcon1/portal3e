import { cn } from "@/lib/utils";

/**
 * Situação como badge de texto (docs/04): fundo claro, borda fina, sem cor
 * sólida. A cor nunca carrega o significado sozinha — o texto está sempre lá,
 * para daltonismo e impressão em preto e branco.
 */
const ESTILOS: Record<string, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "border-sucesso/30 text-sucesso" },
  inativo: { rotulo: "Inativo", classe: "border-borda text-texto-suave" },
  arquivado: { rotulo: "Arquivado", classe: "border-borda text-texto-suave" },
};

export function BadgeStatus({ status }: { status: string }) {
  const { rotulo, classe } = ESTILOS[status] ?? {
    rotulo: status,
    classe: "border-borda text-texto-suave",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border bg-fundo px-1.5 py-0.5 text-xs",
        classe,
      )}
    >
      {rotulo}
    </span>
  );
}
