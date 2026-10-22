import { ROTULO_STATUS_FUNCIONARIO } from "@/features/funcionario/textos";
import { ROTULO_STATUS, ROTULO_STATUS_INTERNO, type StatusSolicitacao } from "@/features/solicitacoes/fluxo";
import { cn } from "@/lib/utils";

/**
 * Situação da solicitação como badge de texto (docs/04). `perspectiva`
 * muda só o rótulo: para quem pediu é "Aguardando você"; para quem trata,
 * "Aguardando solicitante"; para o funcionário, o vocabulário dele, no
 * masculino de "pedido" ("Enviado", "Esperando você").
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

export type Perspectiva = "solicitante" | "interno" | "funcionario";

export const ROTULOS: Record<Perspectiva, Record<StatusSolicitacao, string>> = {
  solicitante: ROTULO_STATUS,
  interno: ROTULO_STATUS_INTERNO,
  funcionario: ROTULO_STATUS_FUNCIONARIO,
};

export function BadgeSituacao({
  status,
  perspectiva = "solicitante",
}: {
  status: StatusSolicitacao;
  perspectiva?: Perspectiva;
}) {
  const rotulo = ROTULOS[perspectiva][status];
  return (
    <span className={cn("inline-flex items-center rounded-sm border bg-fundo px-1.5 py-0.5 text-xs whitespace-nowrap", CLASSES[status])}>
      {rotulo}
    </span>
  );
}
