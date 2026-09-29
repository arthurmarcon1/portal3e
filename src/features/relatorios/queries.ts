import "server-only";

import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { ROTULO_STATUS_INTERNO, ROTULO_TIPO } from "@/features/solicitacoes/fluxo";
import { painelDeConformidade } from "@/features/sst/queries";
import { criarClienteServidor } from "@/lib/supabase/server";

import { ACOES_DE_ACESSO, type ChaveRelatorio } from "./definicoes";
import { descreverRecorte, type Recorte } from "./filtros";
import {
  montarAcessos,
  montarCiencias,
  montarPendencias,
  montarQuadro,
  montarSolicitacoes,
  montarSst,
  pendenciaVencida,
  type CienciaRegistrada,
  type Lotacao,
} from "./montagem";
import type { Relatorio } from "./relatorio";

/**
 * Leitura dos relatórios (F5.3). **Sempre o client do usuário**: o escopo de
 * quem exporta é a RLS — nenhum filtro de contrato ou categoria é refeito
 * aqui, e nenhuma consulta usa `service_role`.
 *
 * Cada relatório lê no máximo LIMITE linhas; passou disso, recusa e pede um
 * recorte menor, em vez de entregar um arquivo cortado sem avisar.
 */

export const LIMITE = 20_000;

export class RecorteGrandeDemais extends Error {}

function dentroDoLimite<T>(linhas: T[] | null): T[] {
  const l = linhas ?? [];
  if (l.length >= LIMITE) {
    throw new RecorteGrandeDemais(
      `O relatório passou de ${LIMITE.toLocaleString("pt-BR")} linhas. Escolha um período menor.`,
    );
  }
  return l;
}

/** Fim do dia `ate` em Brasília, como instante (para filtro de timestamptz). */
function inicioDoDia(dia: string): string {
  return `${dia}T00:00:00-03:00`;
}
function fimDoDia(dia: string): string {
  return `${dia}T23:59:59.999-03:00`;
}

async function lotacoesVigentes(pessoas: string[]): Promise<Lotacao[]> {
  if (pessoas.length === 0) return [];
  const supabase = await criarClienteServidor();
  const hoje = hojeEmBrasilia();
  const resultado: Lotacao[] = [];
  // Em lotes: a lista de ids vai na URL.
  for (let i = 0; i < pessoas.length; i += 300) {
    const { data, error } = await supabase
      .from("alocacoes")
      .select("pessoa_id, data_fim, contratos(numero), unidades(nome)")
      .in("pessoa_id", pessoas.slice(i, i + 300))
      .neq("status", "encerrada");
    if (error) throw new Error(error.message);
    for (const a of data ?? []) {
      if (a.data_fim && a.data_fim < hoje) continue;
      resultado.push({ pessoa_id: a.pessoa_id, contrato: a.contratos?.numero ?? "—", unidade: a.unidades?.nome ?? "—" });
    }
  }
  return resultado;
}

async function pendencias(r: Recorte): Promise<Relatorio> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("relatorio_pendencias_de_ciencia").limit(LIMITE);
  if (error) throw new Error(error.message);
  const hoje = hojeEmBrasilia();
  const todas = dentroDoLimite(data);
  const soVencidas = r.tipo === "situacao" && r.situacao === "vencidas";
  const linhas = soVencidas ? todas.filter((l) => pendenciaVencida(l, hoje)) : todas;
  const lot = await lotacoesVigentes([...new Set(linhas.map((l) => l.pessoa_id))]);
  return montarPendencias(linhas, lot, hoje, descreverRecorte(r));
}

async function ciencias(r: Recorte): Promise<Relatorio> {
  if (r.tipo !== "competencia") throw new Error("recorte inválido");
  const supabase = await criarClienteServidor();
  const mes = `${r.competencia}-01`;
  const [a, m] = r.competencia.split("-").map(Number);
  const proximo = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const campos =
    "id, protocolo, tipo, respondido_em, documento_versao, pessoas(nome, matricula), documentos!inner(titulo, competencia, documento_tipos(nome))";

  // Competência: a do documento (espelho) — ou, sem ela, o mês da resposta.
  const [porCompetencia, porMes] = await Promise.all([
    supabase.from("ciencias").select(campos).eq("documentos.competencia", mes).limit(LIMITE),
    supabase
      .from("ciencias")
      .select(campos)
      .is("documentos.competencia", null)
      .gte("respondido_em", inicioDoDia(mes))
      .lt("respondido_em", inicioDoDia(proximo))
      .limit(LIMITE),
  ]);
  if (porCompetencia.error) throw new Error(porCompetencia.error.message);
  if (porMes.error) throw new Error(porMes.error.message);

  const linhas: CienciaRegistrada[] = dentroDoLimite([...(porCompetencia.data ?? []), ...(porMes.data ?? [])]).map((c) => ({
    id: c.id,
    protocolo: c.protocolo,
    tipo: c.tipo,
    respondido_em: c.respondido_em,
    documento_versao: c.documento_versao,
    pessoa_nome: c.pessoas?.nome ?? "—",
    matricula: c.pessoas?.matricula ?? null,
    documento_titulo: c.documentos.titulo,
    tipo_documento: c.documentos.documento_tipos?.nome ?? "—",
    competencia: c.documentos.competencia,
  }));
  return montarCiencias(linhas, descreverRecorte(r));
}

async function solicitacoes(r: Recorte): Promise<Relatorio> {
  if (r.tipo !== "periodo") throw new Error("recorte inválido");
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("solicitacoes")
    .select("protocolo, tipo, status, criado_em, prazo, concluida_em, contratos(numero)")
    .gte("criado_em", inicioDoDia(r.de))
    .lte("criado_em", fimDoDia(r.ate))
    .order("criado_em")
    .limit(LIMITE);
  if (error) throw new Error(error.message);
  return montarSolicitacoes(
    dentroDoLimite(data).map((s) => ({
      protocolo: s.protocolo,
      tipo: s.tipo,
      status: s.status,
      contrato: s.contratos?.numero ?? null,
      criado_em: s.criado_em,
      prazo: s.prazo,
      concluida_em: s.concluida_em,
    })),
    hojeEmBrasilia(),
    descreverRecorte(r),
    (t) => ROTULO_TIPO[t as keyof typeof ROTULO_TIPO] ?? t,
    (s) => ROTULO_STATUS_INTERNO[s as keyof typeof ROTULO_STATUS_INTERNO] ?? s,
  );
}

async function quadro(r: Recorte): Promise<Relatorio> {
  if (r.tipo !== "periodo") throw new Error("recorte inválido");
  const supabase = await criarClienteServidor();
  // Toda alocação que começou até o fim do período e não tinha acabado antes
  // do início: vigente no fim, ou com movimento dentro.
  const { data, error } = await supabase
    .from("alocacoes")
    .select("funcao, data_inicio, data_fim, status, pessoas(nome, matricula), contratos(numero), unidades(nome)")
    .lte("data_inicio", r.ate)
    .or(`data_fim.is.null,data_fim.gte.${r.de}`)
    .limit(LIMITE);
  if (error) throw new Error(error.message);
  return montarQuadro(
    dentroDoLimite(data).map((a) => ({
      pessoa_nome: a.pessoas?.nome ?? "—",
      matricula: a.pessoas?.matricula ?? null,
      contrato: a.contratos?.numero ?? "—",
      unidade: a.unidades?.nome ?? "—",
      funcao: a.funcao,
      data_inicio: a.data_inicio,
      data_fim: a.data_fim,
      status: a.status,
    })),
    r.de,
    r.ate,
    descreverRecorte(r),
  );
}

async function sst(r: Recorte): Promise<Relatorio> {
  return montarSst(await painelDeConformidade(), descreverRecorte(r));
}

async function acessos(r: Recorte): Promise<Relatorio> {
  if (r.tipo !== "periodo") throw new Error("recorte inválido");
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("auditoria")
    .select("criado_em, acao, entidade, entidade_id, ip, usuario_id")
    .in("acao", [...ACOES_DE_ACESSO])
    .gte("criado_em", inicioDoDia(r.de))
    .lte("criado_em", fimDoDia(r.ate))
    .order("criado_em")
    .limit(LIMITE);
  if (error) throw new Error(error.message);
  const eventos = dentroDoLimite(data);

  // `auditoria.usuario_id` não tem FK de propósito (a trilha sobrevive ao
  // cadastro): o nome vem à parte, como na tela de auditoria.
  const ids = [...new Set(eventos.flatMap((e) => (e.usuario_id ? [e.usuario_id] : [])))];
  const usuarios = new Map<string, { nome: string; email_login: string }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: lote, error: erroLote } = await supabase
      .from("usuarios")
      .select("id, nome, email_login")
      .in("id", ids.slice(i, i + 300));
    if (erroLote) throw new Error(erroLote.message);
    for (const u of lote ?? []) usuarios.set(u.id, u);
  }

  return montarAcessos(
    eventos.map((e) => ({
      criado_em: e.criado_em,
      usuario_nome: e.usuario_id ? (usuarios.get(e.usuario_id)?.nome ?? null) : null,
      usuario_email: e.usuario_id ? (usuarios.get(e.usuario_id)?.email_login ?? null) : null,
      acao: e.acao,
      entidade: e.entidade,
      entidade_id: e.entidade_id,
      ip: e.ip ? String(e.ip) : null,
    })),
    descreverRecorte(r),
  );
}

const MONTADORES: Record<ChaveRelatorio, (r: Recorte) => Promise<Relatorio>> = {
  pendencias,
  ciencias,
  solicitacoes,
  quadro,
  sst,
  acessos,
};

export function gerarRelatorio(chave: ChaveRelatorio, recorte: Recorte): Promise<Relatorio> {
  return MONTADORES[chave](recorte);
}
