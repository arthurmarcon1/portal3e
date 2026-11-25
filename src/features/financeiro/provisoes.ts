/**
 * Provisão da folha: a partir do salário bruto de um empregado (ou da soma da
 * folha do mês), estima o que a prestadora paga ALÉM do salário — encargos
 * (INSS patronal, RAT/SAT, terceiros, FGTS) e provisões (13º, férias + 1/3) —
 * e devolve lançamentos sugeridos nas categorias que já existem (`folha`,
 * `encargos`, `ferias_13`), do grupo `pessoal` do painel.
 *
 * Puro, sem banco, sem `server-only` e sem IA: recebe o salário e as alíquotas,
 * devolve números. Testável em `npm run test:unidade`. É o "estimar provisões"
 * do financeiro; quem lê a folha (de qualquer arquivo) é outra peça, plugável,
 * que depende de decisão de fornecedor e de LGPD (docs/06) — esta aqui só faz
 * a conta, e serve também quando a equipe digita o total da folha na tela.
 *
 * Por que alíquota e não a planilha de custo: a planilha guarda o módulo 4
 * (encargos) como UM valor só por posto — ela não separa INSS de FGTS de férias
 * de 13º. A quebra pedida (GPS/INSS, FGTS, férias, 13º) só sai de alíquota sobre
 * o salário. As alíquotas de referência abaixo são **PROVISÓRIAS** (docs/06):
 * variam por contrato (desoneração/CPRB, grau de risco no RAT, regime
 * tributário) e precisam ser confirmadas antes de valerem para faturamento.
 */

import type { Categoria } from "./categorias";

/** Alíquotas de provisão sobre o salário. Fração (0,20 = 20%), não percentual. */
export type AliquotasDeProvisao = {
  /** INSS patronal — 20% no regime não desonerado (0 se desonerado/CPRB). */
  inssPatronal: number;
  /** RAT/SAT × FAP — 1%, 2% ou 3% conforme o grau de risco da atividade. */
  rat: number;
  /** Terceiros (Sistema S + salário-educação + Incra/Sebrae), ~5,8%. */
  terceiros: number;
  /** FGTS — 8%. */
  fgts: number;
  /** Provisão de 13º por mês — 1/12 do salário. */
  decimoTerceiro: number;
  /** Provisão de férias por mês — 1/12 do salário. */
  ferias: number;
  /** Adicional de 1/3 sobre as férias — (1/12) / 3. */
  tercoDeFerias: number;
};

/**
 * Alíquotas de REFERÊNCIA — provisórias, a confirmar por contrato (docs/06).
 * Não use como verdade para faturamento sem o grau de risco (RAT), se o
 * contrato é desonerado e o regime tributário confirmados pela Marcon/contador.
 */
export const ALIQUOTAS_DE_REFERENCIA: AliquotasDeProvisao = {
  inssPatronal: 0.2,
  rat: 0.02,
  terceiros: 0.058,
  fgts: 0.08,
  decimoTerceiro: 1 / 12,
  ferias: 1 / 12,
  tercoDeFerias: 1 / 12 / 3,
};

/** Uma linha estimada, pronta para virar lançamento em conferência. */
export type LinhaDeProvisao = {
  /** Categoria de `lancamentos` (todas do grupo `pessoal`). */
  categoria: Extract<Categoria, "folha" | "encargos" | "ferias_13">;
  /** Texto para a tela e para a descrição do lançamento sugerido. */
  descricao: string;
  valor: number;
};

const centavos = (v: number) => Math.round(v * 100) / 100;
const pct = (fracao: number) =>
  (fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Soma INSS patronal + RAT + terceiros + FGTS: a carga de encargo sobre o salário. */
export function taxaDeEncargos(a: AliquotasDeProvisao): number {
  return a.inssPatronal + a.rat + a.terceiros + a.fgts;
}

/** Soma 13º + férias + 1/3: a carga de provisão anual, por mês. */
export function taxaDeProvisoes(a: AliquotasDeProvisao): number {
  return a.decimoTerceiro + a.ferias + a.tercoDeFerias;
}

/**
 * Lançamentos estimados para um salário bruto.
 *
 * Primeira versão, deliberadamente direta: encargos incidem sobre o salário.
 * A incidência de segunda ordem (INSS/FGTS sobre o próprio 13º e férias) e a
 * provisão de rescisão/reposição ficaram de fora até a decisão de convenção
 * contábil (docs/06) — como o motor é puro e parametrizado, entram depois sem
 * reescrever nada.
 */
export function calcularProvisoesDaFolha(
  salarioBase: number,
  aliquotas: AliquotasDeProvisao = ALIQUOTAS_DE_REFERENCIA,
): LinhaDeProvisao[] {
  const base = centavos(salarioBase);
  const a = aliquotas;
  return [
    { categoria: "folha", descricao: "Salário (folha)", valor: base },
    {
      categoria: "encargos",
      descricao: `Encargos (INSS ${pct(a.inssPatronal)}% + RAT ${pct(a.rat)}% + terceiros ${pct(a.terceiros)}% + FGTS ${pct(a.fgts)}%)`,
      valor: centavos(base * taxaDeEncargos(a)),
    },
    {
      categoria: "ferias_13",
      descricao: "Provisão de 13º e férias (1/12 + 1/12 + 1/3)",
      valor: centavos(base * taxaDeProvisoes(a)),
    },
  ];
}

/**
 * Lançamentos estimados para a folha inteira do mês — soma os salários e
 * aplica as mesmas alíquotas. As provisões são lineares no salário, então
 * somar os salários e estimar uma vez dá o mesmo que estimar um a um e somar.
 */
export function calcularProvisoesDaFolhaDoMes(
  salarios: number[],
  aliquotas: AliquotasDeProvisao = ALIQUOTAS_DE_REFERENCIA,
): LinhaDeProvisao[] {
  const total = salarios.reduce((s, v) => s + v, 0);
  return calcularProvisoesDaFolha(total, aliquotas);
}
