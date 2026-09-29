import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

import { CAMPOS_DO_QUADRO, type PessoaDoQuadro } from "./quadro";

/**
 * Consultas da área do contratante (F5.1). Client do usuário, sempre: quem
 * recorta é o banco (0023). O contratante não lê `pessoas` nem `ciencias`
 * direto — as duas funções abaixo devolvem só o que docs/02 permite, e o
 * CPF já sai cortado nos 3 últimos dígitos.
 */

export async function quadroDoContratante(): Promise<PessoaDoQuadro[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("quadro_do_contratante");
  if (error) throw new Error(error.message);
  // Cópia campo a campo: se a função ganhar coluna, ela não passa daqui sem
  // alguém mexer na lista de docs/02.
  return (data ?? []).map(
    (linha) => Object.fromEntries(CAMPOS_DO_QUADRO.map((c) => [c, linha[c]])) as PessoaDoQuadro,
  );
}

export type PendenciaDeCiencia = {
  documento_id: string;
  titulo: string;
  tipo_nome: string;
  prazo_ciencia: string | null;
  alcancados: number;
  respondidos: number;
  pendentes: number;
};

export async function pendenciasDeCiencia(): Promise<PendenciaDeCiencia[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("pendencias_de_ciencia_do_contratante");
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    documento_id: d.documento_id,
    titulo: d.titulo,
    tipo_nome: d.tipo_nome,
    prazo_ciencia: d.prazo_ciencia,
    alcancados: d.alcancados,
    respondidos: d.respondidos,
    pendentes: d.pendentes,
  }));
}

export type SolicitacoesAbertas = {
  total: number;
  /** A 3e pediu algo a quem abriu — espera o contratante. */
  aguardandoVoce: number;
};

const ABERTAS = ["aberta", "em_analise", "pendente_solicitante"] as const;

export async function solicitacoesAbertas(usuarioId: string): Promise<SolicitacoesAbertas> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("solicitacoes").select("status, aberta_por").in("status", ABERTAS);
  if (error) throw new Error(error.message);
  const linhas = data ?? [];
  return {
    total: linhas.length,
    aguardandoVoce: linhas.filter((s) => s.status === "pendente_solicitante" && s.aberta_por === usuarioId).length,
  };
}
