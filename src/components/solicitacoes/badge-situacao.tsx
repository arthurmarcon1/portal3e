import { ROTULO_STATUS, ROTULO_STATUS_INTERNO, type StatusSolicitacao } from "@/features/solicitacoes/fluxo";
import { cn } from "@/lib/utils";

/**
 * Situação da solicitação como badge de texto (docs/04). `perspectiva`
 * muda só o rótulo de `pendente_solicitante`: para quem pediu é "Aguardando
 * você"; para quem trata, "Aguardando solicitante".
 */
const CLASSES: Record<StatusSolicitacao, string> = {
  aberta: "border-alerta/30 text-alerta",
  em_analise: "border-acao/30 text-acao",
  pendente_solicitante: "border-alerta/30 text-alerta",
  aprovada: "border-sucesso/30 text-sucesso",
  recusada: "border-erro/30 text-erro",
  concluida: "border-borda text-texto-suave",
  cancelada: "border-borda text-texto-suave",
};

export function BadgeSituacao({
  status,
  perspectiva = "solicitante",
}: {
  status: StatusSolicitacao;
  perspectiva?: "solicitante" | "interno";
}) {
  const rotulo = (perspectiva === "interno" ? ROTULO_STATUS_INTERNO : ROTULO_STATUS)[status];
  return (
    <span className={cn("inline-flex items-center rounded-sm border bg-fundo px-1.5 py-0.5 text-xs whitespace-nowrap", CLASSES[status])}>
      {rotulo}
    </span>
  );
}
