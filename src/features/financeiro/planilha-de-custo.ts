/**
 * Leitura da planilha de custos e formação de preços (modelo IN 05/2017,
 * "Anexo VIII-A"), a base do cadastro financeiro do contrato.
 *
 * Puro, sem banco e sem `server-only`: recebe as abas já como matriz de texto
 * (`lerAbasXlsx`) e devolve o que vai ser gravado, mais os avisos. Testável em
 * `npm run test:unidade`.
 *
 * O formato que chega da licitação:
 *
 * - **uma aba de resumo** com `Cargo | Quantidade | Valor Unitário | Valor
 *   Total` e uma linha `Total Mês` — é o que é cobrado da contratante;
 * - **uma aba por cargo**, com a composição de custo por empregado em cinco
 *   módulos (remuneração, benefícios, insumos, encargos, e custos indiretos +
 *   tributos + lucro), e o "Valor Total FIXO por Empregado".
 *
 * A leitura é por RÓTULO, não por endereço de célula: cada licitação mexe um
 * pouco no modelo (linha a mais, coluna a mais), e endereço fixo quebraria em
 * silêncio, gravando número errado. Rótulo que não aparece vira erro ou aviso
 * dito em português.
 *
 * Muitas abas têm DUAS colunas lado a lado (o cenário cobrado à esquerda e
 * uma variação à direita). Vale sempre a da esquerda: depois do rótulo, os
 * números até a próxima célula de texto.
 */

export type MatrizDeAba = { nome: string; linhas: (string | undefined)[][] };

export type ComposicaoPosto = {
  salario_base: number;
  remuneracao: number;
  beneficios: number;
  insumos: number;
  encargos: number;
  custos_indiretos: number;
  tributos: number;
  lucro: number;
};

export type PostoLido = {
  cargo: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  /** Aba de onde a composição saiu, ou `null` se o cargo não tem aba. */
  aba: string | null;
  composicao: ComposicaoPosto;
};

export type PlanilhaLida = {
  valor_mensal: number;
  meses_execucao: number | null;
  regime_tributario: string | null;
  postos: PostoLido[];
  /** O que não impede gravar, mas alguém precisa olhar. */
  avisos: string[];
};

export class ErroDePlanilhaDeCusto extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDePlanilhaDeCusto";
  }
}

const TOLERANCIA = 0.05; // centavos de arredondamento entre abas

/** Minúsculas, sem acento, espaços colapsados. "EDUCADOR SOCIAl" → "educador social". */
export function normalizar(texto: string | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[°º]/g, "o")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Número de uma célula, ou `null` se ela não é número.
 *
 * Aceita o que o exceljs devolve ("2850", "0.15", "9273.9798") e o texto que
 * alguém digitou à brasileira ("R$ 1.234,56", "12,5%").
 */
export function numero(celula: string | undefined): number | null {
  const bruto = (celula ?? "").trim();
  if (!bruto) return null;
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(bruto)) return Number(bruto);
  const br = bruto.replace(/^R\$\s*/i, "").replace(/%$/, "").trim();
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(br) || /^-?\d+(,\d+)?$/.test(br)) {
    const valor = Number(br.replace(/\./g, "").replace(",", "."));
    return bruto.endsWith("%") ? valor / 100 : valor;
  }
  return null;
}

const vazio = (c: string | undefined) => (c ?? "").trim() === "";

/**
 * Números logo depois do rótulo, na mesma linha, até a próxima célula de
 * texto. É assim que se lê só a coluna da esquerda.
 */
function numerosAposRotulo(linha: (string | undefined)[], indiceRotulo: number): number[] {
  const achados: number[] = [];
  // Célula mesclada chega repetida: "Módulo 1 - …" três vezes seguidas.
  const rotulo = normalizar(linha[indiceRotulo]);
  for (let i = indiceRotulo + 1; i < linha.length; i++) {
    const celula = linha[i];
    if (vazio(celula)) continue;
    if (!achados.length && normalizar(celula) === rotulo) continue;
    const n = numero(celula);
    if (n === null) break;
    achados.push(n);
  }
  return achados;
}

type Busca = {
  /** O rótulo bate se a célula normalizada for igual a ele... */
  igual?: string;
  /** ...ou começar com ele. */
  comeca?: string;
  /** Só procura a partir desta linha (inclusive). */
  aPartirDe?: number;
};

function celulaBate(celula: string | undefined, busca: Busca): boolean {
  const n = normalizar(celula);
  if (!n) return false;
  if (busca.igual !== undefined) return n === busca.igual;
  if (busca.comeca !== undefined) return n.startsWith(busca.comeca);
  return false;
}

/** Primeira linha (a partir de `aPartirDe`) onde o rótulo aparece com número depois. */
function acharValores(aba: MatrizDeAba, busca: Busca): { linha: number; numeros: number[] } | null {
  for (let l = busca.aPartirDe ?? 0; l < aba.linhas.length; l++) {
    const linha = aba.linhas[l];
    for (let c = 0; c < linha.length; c++) {
      if (!celulaBate(linha[c], busca)) continue;
      const numeros = numerosAposRotulo(linha, c);
      if (numeros.length) return { linha: l, numeros };
      break; // rótulo de cabeçalho (sem número): tenta a próxima linha
    }
  }
  return null;
}

/** Último número depois do rótulo (o valor em R$, quando há % antes). */
function valor(aba: MatrizDeAba, busca: Busca): number | null {
  const achado = acharValores(aba, busca);
  return achado ? achado.numeros[achado.numeros.length - 1] : null;
}

function linhaDoRotulo(aba: MatrizDeAba, busca: Busca): number {
  for (let l = busca.aPartirDe ?? 0; l < aba.linhas.length; l++) {
    if (aba.linhas[l].some((c) => celulaBate(c, busca))) return l;
  }
  return -1;
}

/** Texto não numérico mais à direita da linha do rótulo ("Lucro Presumido"). */
function textoAposRotulo(aba: MatrizDeAba, busca: Busca): string | null {
  const l = linhaDoRotulo(aba, busca);
  if (l < 0) return null;
  const linha = aba.linhas[l];
  for (let i = linha.length - 1; i >= 0; i--) {
    const c = (linha[i] ?? "").trim();
    if (c && numero(c) === null && !celulaBate(c, busca)) return c;
  }
  return null;
}

const centavos = (v: number) => Math.round(v * 100) / 100;
const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------------------------------------------------------------------
// Aba de resumo
// ---------------------------------------------------------------------

type LinhaResumo = { cargo: string; quantidade: number; valor_unitario: number; valor_total: number };

function acharResumo(abas: MatrizDeAba[]): { aba: MatrizDeAba; cabecalho: number; colunas: Record<string, number> } {
  for (const aba of abas) {
    for (let l = 0; l < aba.linhas.length; l++) {
      const normal = aba.linhas[l].map(normalizar);
      const cargo = normal.indexOf("cargo");
      const qtd = normal.findIndex((c) => c.startsWith("quantidade"));
      const unit = normal.findIndex((c) => c.startsWith("valor unit"));
      if (cargo >= 0 && qtd >= 0 && unit >= 0) {
        const total = normal.findIndex((c) => c.startsWith("valor total"));
        return { aba, cabecalho: l, colunas: { cargo, qtd, unit, total } };
      }
    }
  }
  throw new ErroDePlanilhaDeCusto(
    "Não achei a aba de resumo. Ela precisa de uma linha com as colunas Cargo, Quantidade e Valor Unitário.",
  );
}

function lerResumo(abas: MatrizDeAba[]): { aba: string; linhas: LinhaResumo[]; totalMes: number | null } {
  const { aba, cabecalho, colunas } = acharResumo(abas);
  const linhas: LinhaResumo[] = [];
  let totalMes: number | null = null;

  for (let l = cabecalho + 1; l < aba.linhas.length; l++) {
    const linha = aba.linhas[l];
    const cargo = (linha[colunas.cargo] ?? "").trim();
    const rotuloLinha = normalizar(linha.find((c) => !vazio(c)));

    if (rotuloLinha.startsWith("total")) {
      const nums = linha.map(numero).filter((n): n is number => n !== null);
      totalMes = nums.length ? nums[nums.length - 1] : null;
      break;
    }
    if (!cargo) continue;

    const quantidade = numero(linha[colunas.qtd]);
    const unitario = numero(linha[colunas.unit]);
    if (quantidade === null || unitario === null) {
      throw new ErroDePlanilhaDeCusto(
        `Na aba "${aba.nome}", o cargo "${cargo}" está sem quantidade ou sem valor unitário.`,
      );
    }
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      throw new ErroDePlanilhaDeCusto(
        `Na aba "${aba.nome}", a quantidade de "${cargo}" precisa ser um número inteiro de postos.`,
      );
    }
    const total = colunas.total >= 0 ? numero(linha[colunas.total]) : null;
    linhas.push({
      cargo,
      quantidade,
      valor_unitario: centavos(unitario),
      valor_total: centavos(total ?? quantidade * unitario),
    });
  }

  if (!linhas.length) {
    throw new ErroDePlanilhaDeCusto(`A aba "${aba.nome}" não tem nenhum cargo abaixo do cabeçalho.`);
  }
  return { aba: aba.nome, linhas, totalMes };
}

// ---------------------------------------------------------------------
// Aba do cargo
// ---------------------------------------------------------------------

/** A aba do cargo: pelo nome da aba ou pela linha "Tipo de Serviço". */
function acharAbaDoCargo(abas: MatrizDeAba[], cargo: string, resumo: string): MatrizDeAba | null {
  const alvo = normalizar(cargo);
  const candidatas = abas.filter((a) => a.nome !== resumo);
  const peloNome = candidatas.find((a) => normalizar(a.nome) === alvo);
  if (peloNome) return peloNome;
  return (
    candidatas.find((a) => {
      const l = linhaDoRotulo(a, { comeca: "tipo de servico" });
      return l >= 0 && a.linhas[l + 1]?.some((c) => normalizar(c) === alvo);
    }) ?? null
  );
}

function lerComposicao(aba: MatrizDeAba, cargo: string, avisos: string[]): {
  composicao: ComposicaoPosto;
  totalPorEmpregado: number | null;
} {
  const resumo = linhaDoRotulo(aba, { comeca: "quadro resumo do custo" });
  const aPartirDe = resumo >= 0 ? resumo : 0;

  const modulo = (n: number) => valor(aba, { comeca: `modulo ${n} -`, aPartirDe });
  const composicao: ComposicaoPosto = {
    salario_base: valor(aba, { comeca: "salario base" }) ?? 0,
    remuneracao: modulo(1) ?? valor(aba, { igual: "total da remuneracao" }) ?? 0,
    beneficios: modulo(2) ?? valor(aba, { igual: "total dos beneficios mensais e diarios" }) ?? 0,
    insumos: modulo(3) ?? valor(aba, { igual: "total dos insumos diversos" }) ?? 0,
    encargos: modulo(4) ?? 0,
    custos_indiretos: valor(aba, { igual: "custos indiretos" }) ?? 0,
    tributos: valor(aba, { igual: "total dos tributos" }) ?? 0,
    lucro: valor(aba, { igual: "lucro" }) ?? 0,
  };
  for (const chave of Object.keys(composicao) as (keyof ComposicaoPosto)[]) {
    composicao[chave] = centavos(composicao[chave]);
  }

  if (resumo < 0) {
    avisos.push(`${cargo}: a aba "${aba.nome}" não tem o "Quadro resumo do custo fixo por empregado". Confira a composição.`);
  }

  // Submódulo do módulo 4 com percentual e sem valor: o custo não entrou no
  // total. É o tipo de erro que passa na conferência visual.
  const quadro4 = linhaDoRotulo(aba, { comeca: "quadro resumo - modulo 4" });
  if (quadro4 >= 0) {
    for (let l = quadro4 + 1; l < Math.min(aba.linhas.length, quadro4 + 12); l++) {
      const linha = aba.linhas[l];
      const i = linha.findIndex((c) => /^4\.\d$/.test(normalizar(c)) || /^4\.\d\s/.test(normalizar(c)));
      if (i < 0) continue;
      const rotulo = (linha[i + 1] ?? "").trim();
      if (!rotulo || normalizar(rotulo).startsWith("modulo 4")) continue;
      // Só a coluna da esquerda: para onde o código do submódulo se repete
      // (é ali que começa o cenário da direita).
      const codigo = normalizar(linha[i]);
      const fim = linha.findIndex((c, j) => j > i && normalizar(c) === codigo);
      const nums = numerosAposRotulo(fim > 0 ? linha.slice(0, fim) : linha, i + 1);
      const pct = nums[0] ?? 0;
      const val = nums.length >= 2 ? nums[1] : 0;
      if (pct > 0 && val === 0) {
        avisos.push(
          `${cargo}: o submódulo ${normalizar(linha[i])} "${rotulo}" tem ${(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% e valor zerado — o custo não entrou nos encargos. Confira com quem montou a planilha.`,
        );
      }
    }
  }

  const totalPorEmpregado = valor(aba, { comeca: "valor total fixo por empregado" });
  if (totalPorEmpregado !== null) {
    const soma =
      composicao.remuneracao + composicao.beneficios + composicao.insumos + composicao.encargos +
      (modulo(5) ?? composicao.custos_indiretos + composicao.tributos + composicao.lucro);
    if (Math.abs(soma - totalPorEmpregado) > TOLERANCIA) {
      avisos.push(
        `${cargo}: os módulos somam ${reais(soma)}, mas o total por empregado da aba é ${reais(totalPorEmpregado)}.`,
      );
    }
  }
  return { composicao, totalPorEmpregado };
}

// ---------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------

const COMPOSICAO_ZERADA: ComposicaoPosto = {
  salario_base: 0, remuneracao: 0, beneficios: 0, insumos: 0,
  encargos: 0, custos_indiretos: 0, tributos: 0, lucro: 0,
};

export function lerPlanilhaDeCusto(abas: MatrizDeAba[]): PlanilhaLida {
  if (!abas.length) throw new ErroDePlanilhaDeCusto("A planilha não tem nenhuma aba.");

  const avisos: string[] = [];
  const resumo = lerResumo(abas);

  const vistos = new Set<string>();
  const postos: PostoLido[] = resumo.linhas.map((linha) => {
    const chave = normalizar(linha.cargo);
    if (vistos.has(chave)) {
      throw new ErroDePlanilhaDeCusto(`O cargo "${linha.cargo}" aparece duas vezes no resumo. Junte as quantidades numa linha só.`);
    }
    vistos.add(chave);

    const aba = acharAbaDoCargo(abas, linha.cargo, resumo.aba);
    if (!aba) {
      avisos.push(`${linha.cargo}: não achei a aba de composição do cargo. O posto entra com valor cobrado, sem custo previsto.`);
      return { ...linha, aba: null, composicao: { ...COMPOSICAO_ZERADA } };
    }
    const { composicao, totalPorEmpregado } = lerComposicao(aba, linha.cargo, avisos);
    if (totalPorEmpregado !== null && Math.abs(totalPorEmpregado - linha.valor_unitario) > TOLERANCIA) {
      avisos.push(
        `${linha.cargo}: o resumo cobra ${reais(linha.valor_unitario)} por posto, mas a aba "${aba.nome}" calcula ${reais(totalPorEmpregado)}.`,
      );
    }
    return { ...linha, aba: aba.nome, composicao };
  });

  const soma = centavos(postos.reduce((s, p) => s + p.valor_total, 0));
  if (resumo.totalMes !== null && Math.abs(soma - resumo.totalMes) > TOLERANCIA) {
    avisos.push(`Os cargos somam ${reais(soma)}, mas o "Total Mês" do resumo é ${reais(resumo.totalMes)}. Vale a soma dos cargos.`);
  }

  // Dados gerais saem da primeira aba de cargo que os tiver.
  const abasDeCargo = abas.filter((a) => a.nome !== resumo.aba);
  const mesesPorAba = new Map<string, number>();
  let regime: string | null = null;
  for (const aba of abasDeCargo) {
    const m = valor(aba, { comeca: "no de meses de execucao" }) ?? valor(aba, { comeca: "n. de meses de execucao" });
    if (m !== null) mesesPorAba.set(aba.nome, m);
    regime ??= textoAposRotulo(aba, { comeca: "regime de tributacao" });
  }
  const valoresDeMeses = [...new Set(mesesPorAba.values())];
  if (valoresDeMeses.length > 1) {
    avisos.push(
      `O número de meses de execução muda entre as abas (${[...mesesPorAba].map(([a, m]) => `${a}: ${m}`).join(", ")}). Informe o prazo certo do contrato.`,
    );
  }
  const meses = valoresDeMeses.length === 1 ? valoresDeMeses[0] : null;

  return {
    valor_mensal: soma,
    meses_execucao: meses !== null && Number.isInteger(meses) && meses > 0 ? meses : null,
    regime_tributario: regime,
    postos,
    avisos,
  };
}

/** Previsto do mês a partir dos postos — o mesmo cálculo na tela e no teste. */
export function previstoDosPostos(
  postos: Pick<PostoLido, "quantidade" | "valor_total" | "composicao">[],
) {
  const por = (k: keyof ComposicaoPosto) =>
    centavos(postos.reduce((s, p) => s + p.quantidade * p.composicao[k], 0));
  const receita = centavos(postos.reduce((s, p) => s + p.valor_total, 0));
  const pessoal = centavos(por("remuneracao") + por("beneficios") + por("encargos"));
  return {
    receita,
    pessoal,
    insumos: por("insumos"),
    custos_indiretos: por("custos_indiretos"),
    tributos: por("tributos"),
    lucro: por("lucro"),
  };
}
