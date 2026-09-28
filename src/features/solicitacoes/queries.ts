import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

import type { StatusSolicitacao, TipoSolicitacao } from "./fluxo";

/**
 * Leitura de solicitações nas três áreas (F4.2). Client do usuário: quem vê
 * o quê é `solicitacoes_leitura` (própria, aberta por ele, ou interno/
 * contratante com `solicitacoes:ver` no escopo), e a nota interna some da
 * linha do tempo de quem não é interno (`eventos_leitura`).
 */

export type SolicitacaoLinha = {
  id: string;
  protocolo: string;
  tipo: TipoSolicitacao;
  titulo: string;
  status: StatusSolicitacao;
  prazo: string | null;
  criado_em: string;
  pessoa_nome: string | null;
  contrato_numero: string | null;
  responsavel_id: string | null;
};

export async function listarSolicitacoes(): Promise<SolicitacaoLinha[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("solicitacoes")
    .select("id, protocolo, tipo, titulo, status, prazo, criado_em, responsavel_id, pessoas(nome), contratos(numero)")
    .order("criado_em", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  return (data ?? []).map((s) => ({
    id: s.id,
    protocolo: s.protocolo,
    tipo: s.tipo,
    titulo: s.titulo,
    status: s.status,
    prazo: s.prazo,
    criado_em: s.criado_em,
    pessoa_nome: s.pessoas?.nome ?? null,
    contrato_numero: s.contratos?.numero ?? null,
    responsavel_id: s.responsavel_id,
  }));
}

/** Interno com `solicitacoes:editar` e ativo — quem pode ser responsável. */
export async function responsaveisPossiveis(): Promise<{ id: string; nome: string }[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("responsaveis_possiveis");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type EventoDaLinhaDoTempo = {
  id: string;
  tipo: "comentario" | "mudanca_status" | "anexo" | "atribuicao";
  conteudo: string | null;
  status_anterior: StatusSolicitacao | null;
  status_novo: StatusSolicitacao | null;
  interno: boolean;
  criado_em: string;
  autor: { id: string; nome: string; interno: boolean } | null;
};

export type Anexo = { id: string; nome: string; mime: string | null; bytes: number | null };

export type Solicitacao = SolicitacaoLinha & {
  descricao: string | null;
  aberta_por: string;
  aberta_por_nome: string | null;
  unidade_nome: string | null;
  responsavel_nome: string | null;
  documento: { id: string; titulo: string } | null;
  concluida_em: string | null;
  eventos: EventoDaLinhaDoTempo[];
  anexos: Anexo[];
};

/** A solicitação completa, ou `null` se não existe ou a RLS não deixa ver. */
export async function buscarSolicitacao(id: string): Promise<Solicitacao | null> {
  const supabase = await criarClienteServidor();
  const { data: s, error } = await supabase
    .from("solicitacoes")
    .select(
      `id, protocolo, tipo, titulo, descricao, status, prazo, criado_em, concluida_em, aberta_por,
       responsavel_id, pessoas(nome), contratos(numero), unidades(nome), documentos(id, titulo),
       solicitacao_eventos(id, usuario_id, tipo, conteudo, status_anterior, status_novo, interno, criado_em),
       anexos(id, nome, mime, bytes)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) return null;

  const { data: pessoas } = await supabase.rpc("pessoas_da_solicitacao", { p_solicitacao: id });
  const porId = new Map((pessoas ?? []).map((p) => [p.id, p]));

  return {
    id: s.id,
    protocolo: s.protocolo,
    tipo: s.tipo,
    titulo: s.titulo,
    descricao: s.descricao,
    status: s.status,
    prazo: s.prazo,
    criado_em: s.criado_em,
    concluida_em: s.concluida_em,
    aberta_por: s.aberta_por,
    aberta_por_nome: porId.get(s.aberta_por)?.nome ?? null,
    responsavel_id: s.responsavel_id,
    responsavel_nome: s.responsavel_id ? (porId.get(s.responsavel_id)?.nome ?? null) : null,
    pessoa_nome: s.pessoas?.nome ?? null,
    contrato_numero: s.contratos?.numero ?? null,
    unidade_nome: s.unidades?.nome ?? null,
    // Documento que a RLS não mostra a quem lê (ex.: divergência de espelho
    // vista pelo contratante) simplesmente não vem.
    documento: s.documentos ? { id: s.documentos.id, titulo: s.documentos.titulo } : null,
    eventos: (s.solicitacao_eventos ?? [])
      .map((e) => {
        const autor = porId.get(e.usuario_id);
        return {
          id: e.id,
          tipo: e.tipo as EventoDaLinhaDoTempo["tipo"],
          conteudo: e.conteudo,
          status_anterior: e.status_anterior,
          status_novo: e.status_novo,
          interno: e.interno,
          criado_em: e.criado_em,
          autor: autor ? { id: autor.id, nome: autor.nome, interno: autor.tipo === "interno" } : null,
        };
      })
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em)),
    anexos: s.anexos ?? [],
  };
}

/** Contratos e unidades do escopo do contratante, para abrir ocorrência. */
export async function contratosDoEscopo(): Promise<
  { id: string; numero: string; unidades: { id: string; nome: string }[] }[]
> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("contratos")
    .select("id, numero, status, contrato_unidades(unidades(id, nome, status))")
    .eq("status", "ativo")
    .order("numero");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    unidades: (c.contrato_unidades ?? [])
      .flatMap((v) => (v.unidades && v.unidades.status === "ativo" ? [{ id: v.unidades.id, nome: v.unidades.nome }] : []))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }));
}
