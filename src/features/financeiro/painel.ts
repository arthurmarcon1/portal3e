/**
 * Previsto × realizado de uma competência.
 *
 * Puro — o painel, o resumo da lista de contratos e o teste chamam a mesma
 * conta. O previsto sai da planilha de custo da competência (a versão vigente
 * no mês); o realizado, dos lançamentos CONFIRMADOS. Lançamento em conferência
 * aparece à parte, como "a conferir", e não entra no número até alguém
 * confirmar: número que ninguém conferiu não vai para a margem.
 *
 * Tributo: se o mês ainda não tem tributo lançado, o painel estima pela
 * alíquota efetiva da planilha sobre a receita realizada, e diz que estimou.
 * Sem isso a margem do mês aberto pareceria maior do que é.
 */

import { CATEGORIAS, ehCategoria, type Grupo } from "./categorias";

export type PostoDoPainel = {
  id: string;
  cargo: string;
  quantidade: number;
  valor_total: number;
  remuneracao: number;
  beneficios: number;
  insumos: number;
  encargos: number;
  custos_indiretos: number;
  tributos: number;
  lucro: number;
};

export type LancamentoDoPainel = {
  categoria: string;
  valor: number;
  status: "confirmado" | "em_conferencia" | "descartado";
  posto_id: string | null;
};

export type LinhaDoPainel = {
  grupo: Grupo;
  previsto: number;
  realizado: number;
  /** realizado − previsto. Na receita, negativo é ruim; na despesa, positivo é ruim. */
  diferenca: number;
  aConferir: number;
};

export type Painel = {
  linhas: LinhaDoPainel[];
  resultado: { previsto: number; realizado: number };
  margem: { prevista: number | null; realizada: number | null };
  tributoEstimado: boolean;
  /** A nota do mês ainda não entrou: a receita realizada é zero por falta de lançamento, não de dinheiro. */
  semFaturamento: boolean;
  aConferir: { quantidade: number; valor: number };
  porPosto: {
    id: string;
    cargo: string;
    quantidade: number;
    pessoalPrevisto: number;
    pessoalRealizado: number;
  }[];
};

const c = (v: number) => Math.round(v * 100) / 100;

export function calcularPainel(postos: PostoDoPainel[], lancamentos: LancamentoDoPainel[]): Painel {
  const soma = (f: (p: PostoDoPainel) => number) => c(postos.reduce((s, p) => s + f(p), 0));

  const previsto: Record<Grupo, number> = {
    receita: soma((p) => p.valor_total),
    pessoal: soma((p) => p.quantidade * (p.remuneracao + p.beneficios + p.encargos)),
    insumos: soma((p) => p.quantidade * p.insumos),
    operacao: soma((p) => p.quantidade * p.custos_indiretos),
    tributos: soma((p) => p.quantidade * p.tributos),
  };
  const lucroPrevisto = soma((p) => p.quantidade * p.lucro);

  const realizado: Record<Grupo, number> = { receita: 0, pessoal: 0, insumos: 0, operacao: 0, tributos: 0 };
  const aConferirPorGrupo: Record<Grupo, number> = { receita: 0, pessoal: 0, insumos: 0, operacao: 0, tributos: 0 };
  const pessoalPorPosto = new Map<string, number>();
  let qtdConferir = 0;
  let valorConferir = 0;
  let temFaturamento = false;

  for (const l of lancamentos) {
    if (l.status === "descartado" || !ehCategoria(l.categoria)) continue;
    const def = CATEGORIAS[l.categoria];
    const valor = def.sinal * l.valor;
    if (l.status === "em_conferencia") {
      aConferirPorGrupo[def.grupo] += valor;
      qtdConferir += 1;
      valorConferir += l.valor;
      continue;
    }
    realizado[def.grupo] += valor;
    if (l.categoria === "faturamento") temFaturamento = true;
    if (def.grupo === "pessoal" && l.posto_id) {
      pessoalPorPosto.set(l.posto_id, (pessoalPorPosto.get(l.posto_id) ?? 0) + valor);
    }
  }

  let tributoEstimado = false;
  if (realizado.tributos === 0 && realizado.receita > 0 && previsto.receita > 0) {
    realizado.tributos = (previsto.tributos / previsto.receita) * realizado.receita;
    tributoEstimado = true;
  }

  const grupos: Grupo[] = ["receita", "pessoal", "insumos", "operacao", "tributos"];
  const linhas = grupos.map((g) => ({
    grupo: g,
    previsto: c(previsto[g]),
    realizado: c(realizado[g]),
    diferenca: c(realizado[g] - previsto[g]),
    aConferir: c(aConferirPorGrupo[g]),
  }));

  const custo = (r: Record<Grupo, number>) => r.pessoal + r.insumos + r.operacao + r.tributos;
  const resultadoPrevisto = c(previsto.receita - custo(previsto));
  const resultadoRealizado = c(realizado.receita - custo(realizado));

  return {
    linhas,
    // Na planilha, receita − custos − indiretos − tributos é o lucro; o
    // arredondamento por posto pode deixar centavos de diferença.
    resultado: { previsto: Math.abs(resultadoPrevisto - lucroPrevisto) < 1 ? lucroPrevisto : resultadoPrevisto, realizado: resultadoRealizado },
    margem: {
      prevista: previsto.receita > 0 ? lucroPrevisto / previsto.receita : null,
      realizada: realizado.receita > 0 ? resultadoRealizado / realizado.receita : null,
    },
    tributoEstimado,
    semFaturamento: !temFaturamento,
    aConferir: { quantidade: qtdConferir, valor: c(valorConferir) },
    porPosto: postos.map((p) => ({
      id: p.id,
      cargo: p.cargo,
      quantidade: p.quantidade,
      pessoalPrevisto: c(p.quantidade * (p.remuneracao + p.beneficios + p.encargos)),
      pessoalRealizado: c(pessoalPorPosto.get(p.id) ?? 0),
    })),
  };
}

/** "2026-11-01" → "novembro de 2026" (docs/04: competência por extenso). */
export function mesPorExtenso(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[mes - 1]} de ${ano}`;
}

/** "2026-11" ou "2026-11-15" → "2026-11-01"; `null` se não for mês válido. */
export function primeiroDiaDoMes(valor: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec((valor ?? "").trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarPercentual(valor: number | null): string {
  if (valor === null) return "—";
  return (valor * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}
