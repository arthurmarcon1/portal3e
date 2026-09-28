/**
 * Vocabulário e fluxo das solicitações (F4.2). Puro — tela e servidor usam o
 * mesmo.
 *
 * A palavra final é do banco: `app.transicao_valida` (0020) recusa transição
 * fora desta tabela, e a policy de insert recusa tipo que quem abre não pode
 * abrir. Aqui é para a tela só oferecer o que vai passar.
 */

import type { Database } from "@/lib/supabase/types";

export type TipoSolicitacao = Database["public"]["Enums"]["tipo_solicitacao"];
export type StatusSolicitacao = Database["public"]["Enums"]["status_solicitacao"];

export const ROTULO_TIPO: Record<TipoSolicitacao, string> = {
  ferias: "Férias",
  afastamento: "Afastamento",
  correcao_ponto: "Correção de ponto",
  substituicao: "Substituição",
  atualizacao_cadastral: "Atualização cadastral",
  ocorrencia: "Ocorrência",
  suporte: "Suporte",
  outro: "Outro",
};

export const ROTULO_STATUS: Record<StatusSolicitacao, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  pendente_solicitante: "Aguardando você",
  aprovada: "Aprovada",
  recusada: "Recusada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

/** O mesmo status, visto por quem trata: "aguardando o solicitante". */
export const ROTULO_STATUS_INTERNO: Record<StatusSolicitacao, string> = {
  ...ROTULO_STATUS,
  pendente_solicitante: "Aguardando solicitante",
};

/** O que o funcionário abre pelo Portal (docs/05, F4.2). A policy confere igual. */
export const TIPOS_FUNCIONARIO: readonly TipoSolicitacao[] = [
  "ferias",
  "afastamento",
  "correcao_ponto",
  "atualizacao_cadastral",
  "suporte",
];

/** O que o contratante abre, no escopo dele. */
export const TIPOS_CONTRATANTE: readonly TipoSolicitacao[] = ["ocorrencia", "substituicao"];

/** Espelho de `app.transicao_valida` (0020). O teste de unidade compara os dois. */
export const TRANSICOES: Record<StatusSolicitacao, readonly StatusSolicitacao[]> = {
  aberta: ["em_analise", "pendente_solicitante", "aprovada", "recusada", "concluida", "cancelada"],
  em_analise: ["pendente_solicitante", "aprovada", "recusada", "concluida", "cancelada"],
  pendente_solicitante: ["em_analise", "cancelada"],
  aprovada: ["concluida"],
  recusada: ["concluida"],
  concluida: [],
  cancelada: [],
};

export const FINAIS: readonly StatusSolicitacao[] = ["concluida", "cancelada"];

export function encerrada(status: StatusSolicitacao): boolean {
  return FINAIS.includes(status);
}

/** Vencida = prazo antes de hoje (Brasília) e ainda em aberto. */
export function vencida(prazo: string | null, status: StatusSolicitacao, hoje: string): boolean {
  return prazo !== null && prazo < hoje && !encerrada(status) && status !== "aprovada" && status !== "recusada";
}
