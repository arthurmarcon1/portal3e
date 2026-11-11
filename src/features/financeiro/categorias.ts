/**
 * Categorias de lançamento do financeiro do contrato.
 *
 * Puro: a tela (Client Component), o esquema Zod, o cálculo do painel e a
 * leitura da IA usam a mesma lista. O `check` de `lancamentos` (migração
 * 0029) reproduz as chaves no banco — categoria nova entra aqui, lá e em
 * docs/03.
 *
 * O `grupo` é onde o lançamento cai no painel, e cada grupo tem um "previsto"
 * na planilha de custo:
 *
 * | grupo      | previsto (planilha)                    |
 * |------------|----------------------------------------|
 * | receita    | soma dos postos (valor cobrado)        |
 * | pessoal    | módulos 1, 2 e 4 × quantidade          |
 * | insumos    | módulo 3 × quantidade                  |
 * | operacao   | custos indiretos (módulo 5-A)          |
 * | tributos   | tributos (módulo 5-B)                  |
 */

export type Natureza = "receita" | "despesa";
export type Grupo = "receita" | "pessoal" | "insumos" | "operacao" | "tributos";

type Definicao = {
  natureza: Natureza;
  grupo: Grupo;
  rotulo: string;
  /** -1 subtrai do grupo (glosa reduz o faturado). */
  sinal: 1 | -1;
};

export const CATEGORIAS = {
  faturamento: { natureza: "receita", grupo: "receita", rotulo: "Nota fiscal emitida (valor bruto)", sinal: 1 },
  extra: { natureza: "receita", grupo: "receita", rotulo: "Extra cobrado (hora extra, reembolso)", sinal: 1 },
  glosa: { natureza: "receita", grupo: "receita", rotulo: "Glosa (desconto na medição)", sinal: -1 },

  folha: { natureza: "despesa", grupo: "pessoal", rotulo: "Folha (salários)", sinal: 1 },
  encargos: { natureza: "despesa", grupo: "pessoal", rotulo: "Encargos (INSS, FGTS)", sinal: 1 },
  beneficios: { natureza: "despesa", grupo: "pessoal", rotulo: "Benefícios (VT, VA)", sinal: 1 },
  ferias_13: { natureza: "despesa", grupo: "pessoal", rotulo: "Férias e 13º", sinal: 1 },
  rescisao: { natureza: "despesa", grupo: "pessoal", rotulo: "Rescisão", sinal: 1 },

  epi_uniforme: { natureza: "despesa", grupo: "insumos", rotulo: "EPI e uniforme", sinal: 1 },
  materiais: { natureza: "despesa", grupo: "insumos", rotulo: "Materiais", sinal: 1 },
  equipamentos: { natureza: "despesa", grupo: "insumos", rotulo: "Equipamentos", sinal: 1 },

  viagem: { natureza: "despesa", grupo: "operacao", rotulo: "Viagem e hospedagem", sinal: 1 },
  alimentacao: { natureza: "despesa", grupo: "operacao", rotulo: "Alimentação", sinal: 1 },
  deslocamento: { natureza: "despesa", grupo: "operacao", rotulo: "Deslocamento e combustível", sinal: 1 },
  exames_treinamentos: { natureza: "despesa", grupo: "operacao", rotulo: "Exames e treinamentos", sinal: 1 },
  outros: { natureza: "despesa", grupo: "operacao", rotulo: "Outra despesa", sinal: 1 },

  tributos: { natureza: "despesa", grupo: "tributos", rotulo: "Tributos pagos", sinal: 1 },
} as const satisfies Record<string, Definicao>;

export type Categoria = keyof typeof CATEGORIAS;

export const CHAVES_CATEGORIA = Object.keys(CATEGORIAS) as [Categoria, ...Categoria[]];

export const ROTULOS_GRUPO: Record<Grupo, string> = {
  receita: "Receita do contrato",
  pessoal: "Pessoal",
  insumos: "Insumos",
  operacao: "Despesas do contrato",
  tributos: "Tributos",
};

export function ehCategoria(valor: string): valor is Categoria {
  return Object.hasOwn(CATEGORIAS, valor);
}

/** Opções do combo, agrupadas na ordem em que aparecem no painel. */
export function opcoesDeCategoria(): { grupo: string; itens: { id: Categoria; nome: string }[] }[] {
  const grupos: Grupo[] = ["receita", "pessoal", "insumos", "operacao", "tributos"];
  return grupos.map((g) => ({
    grupo: ROTULOS_GRUPO[g],
    itens: CHAVES_CATEGORIA.filter((c) => CATEGORIAS[c].grupo === g).map((c) => ({
      id: c,
      nome: CATEGORIAS[c].rotulo,
    })),
  }));
}
