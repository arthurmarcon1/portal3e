import "server-only";

import { ErroDeNegocio } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

import type { LinhaCsvAuditoria } from "./csv";
import { intervaloDoPeriodo, POR_PAGINA, type FiltrosAuditoria } from "./filtros";

/**
 * Leitura da trilha de auditoria (F2.2).
 *
 * Sempre com o client do usuário: quem decide se ele lê a trilha é
 * `auditoria_leitura` (própria organização + `administracao:ver`), não um
 * filtro aqui. O layout do módulo barra antes, e a RLS segura se ele falhar.
 */

export type EventoAuditoria = {
  id: number;
  criado_em: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  detalhes: Json | null;
  ip: string | null;
  user_agent: string | null;
  usuario: { id: string; nome: string; email_login: string } | null;
  /** Preenchido mesmo quando o usuário não pôde ser resolvido para nome. */
  usuario_id: string | null;
};

const COLUNAS = "id, criado_em, acao, entidade, entidade_id, detalhes, ip, user_agent, usuario_id";

/**
 * Filtros em comum da tela e do CSV. Um lugar só: exportação e listagem não
 * podem discordar sobre o que "este recorte" significa.
 */
function consulta(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  filtros: FiltrosAuditoria,
  opcoes?: { count?: "exact"; head?: boolean },
) {
  let q = supabase.from("auditoria").select(COLUNAS, opcoes);

  const { desde, antesDe } = intervaloDoPeriodo(filtros);
  if (desde) q = q.gte("criado_em", desde);
  if (antesDe) q = q.lt("criado_em", antesDe);
  if (filtros.usuario) q = q.eq("usuario_id", filtros.usuario);
  if (filtros.acao) q = q.eq("acao", filtros.acao);
  if (filtros.entidade) q = q.eq("entidade", filtros.entidade);

  // `id` desempata eventos do mesmo instante — sem ele, a mesma linha pode
  // aparecer em duas páginas, ou em nenhuma.
  return q.order("criado_em", { ascending: false }).order("id", { ascending: false });
}

async function nomesDosUsuarios(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  ids: string[],
): Promise<Map<string, { id: string; nome: string; email_login: string }>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();

  // `auditoria.usuario_id` não tem FK de propósito (a trilha sobrevive ao
  // cadastro), então não há embed do PostgREST: busca à parte.
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, email_login")
    .in("id", unicos);
  if (error) throw new Error(error.message);

  return new Map((data ?? []).map((u) => [u.id, u]));
}

function montar(
  linhas: {
    id: number;
    criado_em: string;
    acao: string;
    entidade: string;
    entidade_id: string | null;
    detalhes: Json | null;
    ip: unknown;
    user_agent: string | null;
    usuario_id: string | null;
  }[],
  usuarios: Map<string, { id: string; nome: string; email_login: string }>,
): EventoAuditoria[] {
  return linhas.map((l) => ({
    id: l.id,
    criado_em: l.criado_em,
    acao: l.acao,
    entidade: l.entidade,
    entidade_id: l.entidade_id,
    detalhes: l.detalhes,
    ip: l.ip === null || l.ip === undefined ? null : String(l.ip),
    user_agent: l.user_agent,
    usuario_id: l.usuario_id,
    usuario: l.usuario_id ? (usuarios.get(l.usuario_id) ?? null) : null,
  }));
}

export async function listarAuditoria(filtros: FiltrosAuditoria): Promise<{
  eventos: EventoAuditoria[];
  total: number;
}> {
  const supabase = await criarClienteServidor();
  const inicio = (filtros.pagina - 1) * POR_PAGINA;

  const { data, count, error } = await consulta(supabase, filtros, { count: "exact" }).range(
    inicio,
    inicio + POR_PAGINA - 1,
  );

  if (error) {
    // Página além da última (link velho, URL editada): o PostgREST recusa o
    // intervalo. Devolve só o total, para a tela mandar à última página.
    if (error.code === "PGRST103") {
      const { count: total } = await consulta(supabase, filtros, { count: "exact", head: true });
      return { eventos: [], total: total ?? 0 };
    }
    throw new Error(error.message);
  }

  const usuarios = await nomesDosUsuarios(
    supabase,
    (data ?? []).flatMap((l) => (l.usuario_id ? [l.usuario_id] : [])),
  );

  return { eventos: montar(data ?? [], usuarios), total: count ?? 0 };
}

export type OpcoesDeFiltro = {
  usuarios: { id: string; nome: string }[];
  acoes: string[];
  entidades: string[];
};

export async function opcoesDeFiltro(): Promise<OpcoesDeFiltro> {
  const supabase = await criarClienteServidor();

  const [valores, usuarios] = await Promise.all([
    supabase.rpc("auditoria_opcoes_de_filtro"),
    supabase.from("usuarios").select("id, nome, email_login").order("nome"),
  ]);

  if (valores.error) throw new Error(valores.error.message);
  if (usuarios.error) throw new Error(usuarios.error.message);

  const de = (campo: string) =>
    (valores.data ?? [])
      .filter((v) => v.campo === campo)
      .map((v) => v.valor)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    usuarios: (usuarios.data ?? []).map((u) => ({
      id: u.id,
      nome: `${u.nome} · ${u.email_login}`,
    })),
    acoes: de("acao"),
    entidades: de("entidade"),
  };
}

/**
 * Teto da exportação. Não é regra de negócio: é o tamanho que cabe numa
 * resposta de função serverless sem estourar tempo nem memória. Acima disso a
 * pessoa recebe o pedido de estreitar o período, e não um arquivo cortado
 * sem aviso — CSV truncado em silêncio numa apuração é pior que nenhum.
 */
export const LIMITE_EXPORTACAO = 50_000;
const LOTE = 1_000;

export async function eventosParaExportacao(
  filtros: FiltrosAuditoria,
): Promise<LinhaCsvAuditoria[]> {
  const supabase = await criarClienteServidor();

  const { count, error: erroContagem } = await consulta(supabase, filtros, {
    count: "exact",
    head: true,
  });
  if (erroContagem) throw new Error(erroContagem.message);

  const total = count ?? 0;
  if (total > LIMITE_EXPORTACAO) {
    throw new ErroDeNegocio(
      `O recorte tem ${total.toLocaleString("pt-BR")} eventos, e a exportação aceita até ` +
        `${LIMITE_EXPORTACAO.toLocaleString("pt-BR")}. Reduza o período ou use mais filtros.`,
    );
  }

  const linhas: EventoAuditoria[] = [];
  // Em lotes: o PostgREST devolve no máximo 1.000 linhas por requisição.
  for (let inicio = 0; inicio < total; inicio += LOTE) {
    const { data, error } = await consulta(supabase, filtros).range(inicio, inicio + LOTE - 1);
    if (error) throw new Error(error.message);
    const usuarios = await nomesDosUsuarios(
      supabase,
      (data ?? []).flatMap((l) => (l.usuario_id ? [l.usuario_id] : [])),
    );
    linhas.push(...montar(data ?? [], usuarios));
    if ((data ?? []).length < LOTE) break;
  }

  return linhas.map((e) => ({
    criado_em: e.criado_em,
    usuario_nome: e.usuario?.nome ?? null,
    usuario_email: e.usuario?.email_login ?? null,
    acao: e.acao,
    entidade: e.entidade,
    entidade_id: e.entidade_id,
    ip: e.ip,
    user_agent: e.user_agent,
    detalhes: e.detalhes,
  }));
}
