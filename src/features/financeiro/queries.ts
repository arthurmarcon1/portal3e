import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

import { calcularPainel, type Painel, type PostoDoPainel } from "./painel";

/**
 * Leitura do financeiro do contrato.
 *
 * Sempre com o client do usuário: a policy (`app.financeiro_alcanca`) decide
 * que contrato aparece — escopo, permissão e tipo interno. Nenhum `where
 * org_id` aqui (CLAUDE.md, invariante 1).
 */

type StatusLancamento = "confirmado" | "em_conferencia" | "descartado";

export type ResumoDeContrato = {
  id: string;
  numero: string;
  descricao: string | null;
  contratante: string;
  planilha: { versao: number; valor_mensal: number; postos: number; vigente_desde: string } | null;
  competencia: {
    mes: string;
    status: "aberta" | "fechada";
    resultado: number;
    margem: number | null;
    receitaLancada: boolean;
    aConferir: number;
  } | null;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0);

function postoDoPainel(p: {
  id: string; cargo: string; quantidade: number; valor_total: number | null;
  valor_unitario: number; remuneracao: number; beneficios: number; insumos: number;
  encargos: number; custos_indiretos: number; tributos: number; lucro: number;
}): PostoDoPainel {
  return {
    id: p.id,
    cargo: p.cargo,
    quantidade: p.quantidade,
    valor_total: num(p.valor_total ?? p.quantidade * p.valor_unitario),
    remuneracao: num(p.remuneracao),
    beneficios: num(p.beneficios),
    insumos: num(p.insumos),
    encargos: num(p.encargos),
    custos_indiretos: num(p.custos_indiretos),
    tributos: num(p.tributos),
    lucro: num(p.lucro),
  };
}

/** A versão que vale no mês: a mais nova, ativa, com vigência até ele. */
export function planilhaVigente<T extends { versao: number; vigente_desde: string; status: string }>(
  planilhas: T[],
  mes: string,
): T | null {
  return (
    planilhas
      .filter((p) => p.status === "ativo" && p.vigente_desde <= mes)
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde) || b.versao - a.versao)[0] ?? null
  );
}

/**
 * Contratos que o usuário enxerga, com a base financeira e a última
 * competência. A "visão master" da 3e: escopo total vê todos.
 */
export async function listarContratosDoFinanceiro(): Promise<ResumoDeContrato[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, numero, descricao, status, contratantes(nome), planilhas_de_custo(id, versao, vigente_desde, valor_mensal, status, planilha_postos(id, cargo, quantidade, valor_unitario, valor_total, remuneracao, beneficios, insumos, encargos, custos_indiretos, tributos, lucro)), competencias(id, mes, status, planilha_id, lancamentos(categoria, valor, status, posto_id))",
    )
    .eq("status", "ativo")
    .order("numero");

  if (error) throw new Error(error.message);

  const hoje = new Date().toISOString().slice(0, 8) + "01";
  return (data ?? []).map((c) => {
    const planilhas = c.planilhas_de_custo ?? [];
    const vigente = planilhaVigente(planilhas, hoje) ?? planilhas.sort((a, b) => b.versao - a.versao)[0] ?? null;
    const ultima = [...(c.competencias ?? [])].sort((a, b) => b.mes.localeCompare(a.mes))[0] ?? null;

    let competencia: ResumoDeContrato["competencia"] = null;
    if (ultima) {
      const daCompetencia = planilhas.find((p) => p.id === ultima.planilha_id);
      const painel = calcularPainel(
        (daCompetencia?.planilha_postos ?? []).map(postoDoPainel),
        (ultima.lancamentos ?? []).map((l) => ({
          categoria: l.categoria,
          valor: num(l.valor),
          status: l.status as StatusLancamento,
          posto_id: l.posto_id,
        })),
      );
      competencia = {
        mes: ultima.mes,
        status: ultima.status,
        resultado: painel.resultado.realizado,
        margem: painel.margem.realizada,
        receitaLancada: !painel.semFaturamento,
        aConferir: painel.aConferir.quantidade,
      };
    }

    return {
      id: c.id,
      numero: c.numero,
      descricao: c.descricao,
      contratante: c.contratantes?.nome ?? "—",
      planilha: vigente
        ? {
            versao: vigente.versao,
            valor_mensal: num(vigente.valor_mensal),
            postos: (vigente.planilha_postos ?? []).reduce((s, p) => s + p.quantidade, 0),
            vigente_desde: vigente.vigente_desde,
          }
        : null,
      competencia,
    };
  });
}

export type LancamentoDaTela = {
  id: string;
  natureza: "receita" | "despesa";
  categoria: string;
  descricao: string;
  valor: number;
  data_documento: string | null;
  origem: "plataforma" | "whatsapp";
  status: StatusLancamento;
  motivo_descarte: string | null;
  posto_id: string | null;
  cargo: string | null;
  criado_em: string;
  duvidas: string[];
  transcricao: string | null;
  anexos: { id: string; nome: string; mime: string }[];
};

export type PostoDaTela = PostoDoPainel & {
  valor_unitario: number;
  salario_base: number;
};

export type DetalheDoContrato = {
  contrato: { id: string; numero: string; descricao: string | null; contratante: string };
  planilhas: {
    id: string;
    versao: number;
    vigente_desde: string;
    valor_mensal: number;
    meses_execucao: number | null;
    regime_tributario: string | null;
    arquivo_nome: string;
    status: string;
    criado_em: string;
  }[];
  competencias: { id: string; mes: string; status: "aberta" | "fechada" }[];
  /** A competência na tela: a pedida por `?mes=`, ou a mais recente. */
  competencia: {
    id: string;
    mes: string;
    status: "aberta" | "fechada";
    fechada_em: string | null;
    planilha_versao: number;
  } | null;
  /** Mês pedido que ainda não tem competência aberta. */
  mesSemCompetencia: string | null;
  postos: PostoDaTela[];
  lancamentos: LancamentoDaTela[];
  painel: Painel | null;
};

/** `null` quando o contrato não existe ou está fora do alcance (a tela mostra 404). */
export async function detalheDoContrato(
  contratoId: string,
  mesPedido: string | null,
): Promise<DetalheDoContrato | null> {
  const supabase = await criarClienteServidor();

  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .select("id, numero, descricao, contratantes(nome)")
    .eq("id", contratoId)
    .maybeSingle();
  if (erroContrato) throw new Error(erroContrato.message);
  if (!contrato) return null;

  const [planilhas, competencias] = await Promise.all([
    supabase
      .from("planilhas_de_custo")
      .select(
        "id, versao, vigente_desde, valor_mensal, meses_execucao, regime_tributario, arquivo_nome, status, criado_em, planilha_postos(id, cargo, quantidade, valor_unitario, valor_total, salario_base, remuneracao, beneficios, insumos, encargos, custos_indiretos, tributos, lucro, ordem)",
      )
      .eq("contrato_id", contratoId)
      .order("versao", { ascending: false }),
    supabase
      .from("competencias")
      .select("id, mes, status, fechada_em, planilha_id")
      .eq("contrato_id", contratoId)
      .order("mes", { ascending: false }),
  ]);
  if (planilhas.error) throw new Error(planilhas.error.message);
  if (competencias.error) throw new Error(competencias.error.message);

  const listaCompetencias = competencias.data ?? [];
  const escolhida = mesPedido
    ? listaCompetencias.find((c) => c.mes === mesPedido) ?? null
    : listaCompetencias[0] ?? null;

  const hoje = new Date().toISOString().slice(0, 8) + "01";
  const planilhaDaTela = escolhida
    ? (planilhas.data ?? []).find((p) => p.id === escolhida.planilha_id) ?? null
    : planilhaVigente(planilhas.data ?? [], mesPedido ?? hoje);

  const postos: PostoDaTela[] = [...(planilhaDaTela?.planilha_postos ?? [])]
    .sort((a, b) => a.ordem - b.ordem)
    .map((p) => ({ ...postoDoPainel(p), valor_unitario: num(p.valor_unitario), salario_base: num(p.salario_base) }));

  let lancamentos: LancamentoDaTela[] = [];
  if (escolhida) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select(
        "id, natureza, categoria, descricao, valor, data_documento, origem, status, motivo_descarte, posto_id, criado_em, sugestao, lancamento_anexos(id, nome, mime)",
      )
      .eq("competencia_id", escolhida.id)
      .order("criado_em", { ascending: false });
    if (error) throw new Error(error.message);

    const cargoDe = new Map(postos.map((p) => [p.id, p.cargo]));
    lancamentos = (data ?? []).map((l) => {
      const sugestao = (l.sugestao ?? {}) as { duvidas?: unknown; transcricao?: unknown };
      return {
        id: l.id,
        natureza: l.natureza,
        categoria: l.categoria,
        descricao: l.descricao,
        valor: num(l.valor),
        data_documento: l.data_documento,
        origem: l.origem,
        status: l.status,
        motivo_descarte: l.motivo_descarte,
        posto_id: l.posto_id,
        cargo: l.posto_id ? cargoDe.get(l.posto_id) ?? null : null,
        criado_em: l.criado_em,
        duvidas: Array.isArray(sugestao.duvidas) ? sugestao.duvidas.map(String) : [],
        transcricao: typeof sugestao.transcricao === "string" ? sugestao.transcricao : null,
        anexos: l.lancamento_anexos ?? [],
      };
    });
  }

  return {
    contrato: {
      id: contrato.id,
      numero: contrato.numero,
      descricao: contrato.descricao,
      contratante: contrato.contratantes?.nome ?? "—",
    },
    planilhas: (planilhas.data ?? []).map((p) => ({
      id: p.id,
      versao: p.versao,
      vigente_desde: p.vigente_desde,
      valor_mensal: num(p.valor_mensal),
      meses_execucao: p.meses_execucao,
      regime_tributario: p.regime_tributario,
      arquivo_nome: p.arquivo_nome,
      status: p.status,
      criado_em: p.criado_em,
    })),
    competencias: listaCompetencias.map((c) => ({ id: c.id, mes: c.mes, status: c.status })),
    competencia: escolhida
      ? {
          id: escolhida.id,
          mes: escolhida.mes,
          status: escolhida.status,
          fechada_em: escolhida.fechada_em,
          planilha_versao: planilhaDaTela?.versao ?? 0,
        }
      : null,
    mesSemCompetencia: mesPedido && !escolhida ? mesPedido : null,
    postos,
    lancamentos,
    painel: escolhida
      ? calcularPainel(
          postos,
          lancamentos.map((l) => ({ categoria: l.categoria, valor: l.valor, status: l.status, posto_id: l.posto_id })),
        )
      : null,
  };
}

/** Contratos ativos que o usuário pode receber planilha (combo da importação). */
export async function contratosParaImportar(): Promise<{ id: string; nome: string }[]> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("contratos")
    .select("id, numero, contratantes(nome)")
    .eq("status", "ativo")
    .order("numero");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id, nome: `${c.numero} · ${c.contratantes?.nome ?? "—"}` }));
}
