import { describe, expect, it } from "vitest";

import {
  ErroDePlanilhaDeCusto,
  lerPlanilhaDeCusto,
  normalizar,
  numero,
  previstoDosPostos,
  type MatrizDeAba,
} from "./planilha-de-custo";

/**
 * Planilha FICTÍCIA no formato do Anexo VIII-A: valores inventados, mesma
 * forma da planilha real (células mescladas repetidas, duas colunas lado a
 * lado, rótulos de cabeçalho sem número). Dado real de contrato não entra no
 * repositório (CLAUDE.md).
 */

type Cargo = {
  aba: string;
  servico: string;
  salario: number;
  beneficios: number;
  insumos: number;
  encargos: number;
  indiretos: number;
  tributos: number;
  lucro: number;
  meses?: number;
  /** Simula o submódulo 4.5 com % e valor vazio, como já apareceu em planilha real. */
  submodulo45Vazio?: boolean;
};

function abaDeCargo(c: Cargo): MatrizDeAba {
  const mod5 = c.indiretos + c.tributos + c.lucro;
  const total = c.salario + c.beneficios + c.insumos + c.encargos + mod5;
  const dir = (n: number) => String(n * 0.9); // cenário da direita, que não vale
  return {
    nome: c.aba,
    linhas: [
      ["", "ANEXO VIII-A"],
      ["", "Regime de Tributação: (1)Real (2)Presumido (3 e 4)Simples", "", "2", "Lucro Presumido"],
      ["", "D", "N° de meses de execução contratual", "N° de meses de execução contratual", "", String(c.meses ?? 12)],
      ["", "Tipo de Serviço", "Unidade de Medida", "Quantidade Total a Contratar"],
      ["", c.servico, "Posto", "1"],
      ["", "MÓDULO 1", "COMPOSIÇÃO DA REMUNERAÇÃO"],
      ["", "A", "Salário Base - 220h", "Salário Base - 220h", "", String(c.salario), "", "A"],
      ["", "Total da Remuneração", "Total da Remuneração", "", String(c.salario), "", "Total da Remuneração", String(c.salario)],
      ["", "4.1", "Encargos Previdenciários e FGTS", "%", "Valor (R$)"],
      ["", "Quadro Resumo - Módulo 4", "Quadro Resumo - Módulo 4", "Encargos Sociais e Trabalhistas"],
      ["", "4", "Módulo 4 - Encargos Sociais e Trabalhistas", "Módulo 4 - Encargos Sociais e Trabalhistas", "%", "", "Valor (R$)"],
      ["", "4.1", "Encargos Previdenciários e FGTS", "Encargos Previdenciários e FGTS", "0.368", "", String(c.encargos), "", "4.1", "Encargos Previdenciários e FGTS", "0.368", dir(c.encargos)],
      c.submodulo45Vazio
        ? ["", "4.5", "Custo de Reposição de Profissional Ausente", "Custo de Reposição de Profissional Ausente", "0.1283", "", "", "", "4.5", "Custo de Reposição de Profissional Ausente", "0.1283", "639.03"]
        : ["", "4.5", "Custo de Reposição de Profissional Ausente", "Custo de Reposição de Profissional Ausente", "0", "", "0"],
      ["", "5", "Custos Indiretos, Tributos e Lucro", "Custos Indiretos, Tributos e Lucro", "%", "", "Valor (R$)"],
      ["", "A", "Custos Indiretos ", "Custos Indiretos ", "0.15", "", String(c.indiretos), "", "A", "Custos Indiretos ", "0.15", dir(c.indiretos)],
      ["", "Total dos Tributos", "Total dos Tributos", "", "0.1945", "", String(c.tributos), "", "Total dos Tributos", "0.1945", dir(c.tributos)],
      ["", "C", "Lucro", "Lucro", "0.10", "", String(c.lucro), "", "C", "Lucro", "0.10", dir(c.lucro)],
      ["", "QUADRO RESUMO DO CUSTO FIXO POR EMPREGADO", "", "", "", "", "", "", "QUADRO RESUMO DO CUSTO FIXO POR EMPREGADO"],
      ["", "A", "Módulo 1 - Composição da Remuneração", "Módulo 1 - Composição da Remuneração", "", String(c.salario), "", "A", "Módulo 1 - Composição da Remuneração", dir(c.salario)],
      ["", "B", "Módulo 2 - Benefícios Mensais e Diários", "Módulo 2 - Benefícios Mensais e Diários", "", String(c.beneficios), "", "B", "Módulo 2 - Benefícios Mensais e Diários", "0"],
      ["", "C", "Módulo 3 - Insumos Diverso", "Módulo 3 - Insumos Diverso", "", String(c.insumos), "", "C", "Módulo 3 - Insumos Diverso", "0"],
      ["", "D", "Módulo 4 - Encargos Sociais e Trabalhistas", "Módulo 4 - Encargos Sociais e Trabalhistas", "", String(c.encargos), "", "D", "Módulo 4 - Encargos Sociais e Trabalhistas", dir(c.encargos)],
      ["", "E", "Módulo 5 - Custos Indiretos, Tributos e Lucro", "Módulo 5 - Custos Indiretos, Tributos e Lucro", "", String(mod5), "", "E", "Módulo 5 - Custos Indiretos, Tributos e Lucro", dir(mod5)],
      ["", "Valor Total FIXO por Empregado", "Valor Total FIXO por Empregado", "", String(total), "", "Valor Total FIXO por Empregado", dir(total)],
    ],
  };
}

const PORTEIRO: Cargo = {
  aba: "Porteiro", servico: "Porteiro", salario: 2000, beneficios: 600, insumos: 40,
  encargos: 1500, indiretos: 500, tributos: 1000, lucro: 400,
};
const AUXILIAR: Cargo = {
  aba: "Auxiliar Adm", servico: "Auxiliar Administrativo", salario: 1800, beneficios: 600, insumos: 40,
  encargos: 1300, indiretos: 400, tributos: 900, lucro: 300,
};
const valorPorPosto = (c: Cargo) =>
  c.salario + c.beneficios + c.insumos + c.encargos + c.indiretos + c.tributos + c.lucro;

function resumo(linhas: (string | undefined)[][], totalMes: number): MatrizDeAba {
  return {
    nome: "Plan1",
    linhas: [
      ["", "RESUMO CONTRATO FICTÍCIO"],
      ["", "Cargo", "Quantidade", "Valor Unitário", "Valor Total"],
      ...linhas,
      ["", "Total Mês", "", "", String(totalMes)],
    ],
  };
}

const planilhaBoa = (): MatrizDeAba[] => [
  abaDeCargo(PORTEIRO),
  abaDeCargo(AUXILIAR),
  resumo(
    [
      ["", "PORTEIRO", "3", String(valorPorPosto(PORTEIRO)), String(3 * valorPorPosto(PORTEIRO))],
      // Caixa e acento diferentes da aba: casa pela linha "Tipo de Serviço".
      ["", "AUXILIAR ADMINISTRATIVO", "1", String(valorPorPosto(AUXILIAR)), String(valorPorPosto(AUXILIAR))],
    ],
    3 * valorPorPosto(PORTEIRO) + valorPorPosto(AUXILIAR),
  ),
];

describe("lerPlanilhaDeCusto", () => {
  it("lê o resumo e a composição de cada cargo pela coluna da esquerda", () => {
    const r = lerPlanilhaDeCusto(planilhaBoa());

    expect(r.valor_mensal).toBe(3 * 6040 + 5340);
    expect(r.regime_tributario).toBe("Lucro Presumido");
    expect(r.meses_execucao).toBe(12);
    expect(r.avisos).toEqual([]);

    expect(r.postos.map((p) => [p.cargo, p.quantidade, p.valor_unitario, p.aba])).toEqual([
      ["PORTEIRO", 3, 6040, "Porteiro"],
      ["AUXILIAR ADMINISTRATIVO", 1, 5340, "Auxiliar Adm"],
    ]);
    expect(r.postos[0].composicao).toEqual({
      salario_base: 2000, remuneracao: 2000, beneficios: 600, insumos: 40,
      encargos: 1500, custos_indiretos: 500, tributos: 1000, lucro: 400,
    });
  });

  it("avisa quando o valor cobrado no resumo não bate com a aba do cargo", () => {
    const abas = planilhaBoa();
    abas[2].linhas[2][3] = "6100";
    const r = lerPlanilhaDeCusto(abas);
    expect(r.avisos.some((a) => a.includes("PORTEIRO") && a.includes("cobra"))).toBe(true);
  });

  it("avisa o submódulo do módulo 4 com percentual e valor vazio", () => {
    const abas = planilhaBoa();
    abas[0] = abaDeCargo({ ...PORTEIRO, submodulo45Vazio: true });
    const r = lerPlanilhaDeCusto(abas);
    expect(r.avisos.some((a) => a.includes("4.5") && a.includes("valor zerado"))).toBe(true);
  });

  it("não inventa prazo quando as abas discordam, e diz quais são", () => {
    const abas = planilhaBoa();
    abas[1] = abaDeCargo({ ...AUXILIAR, meses: 9 });
    const r = lerPlanilhaDeCusto(abas);
    expect(r.meses_execucao).toBeNull();
    expect(r.avisos.some((a) => a.includes("Porteiro: 12") && a.includes("Auxiliar Adm: 9"))).toBe(true);
  });

  it("aceita cargo sem aba, com aviso e composição zerada", () => {
    const abas = planilhaBoa();
    abas[2].linhas.splice(4, 0, ["", "VIGIA", "2", "5000", "10000"]);
    const r = lerPlanilhaDeCusto(abas);
    const vigia = r.postos.find((p) => p.cargo === "VIGIA");
    expect(vigia?.aba).toBeNull();
    expect(vigia?.composicao.remuneracao).toBe(0);
    expect(r.avisos.some((a) => a.startsWith("VIGIA"))).toBe(true);
  });

  it("recusa planilha sem aba de resumo, dizendo o que falta", () => {
    expect(() => lerPlanilhaDeCusto([abaDeCargo(PORTEIRO)])).toThrow(ErroDePlanilhaDeCusto);
    expect(() => lerPlanilhaDeCusto([abaDeCargo(PORTEIRO)])).toThrow(/Cargo, Quantidade e Valor Unitário/);
  });

  it("recusa quantidade quebrada e cargo repetido", () => {
    const quebrada = planilhaBoa();
    quebrada[2].linhas[2][2] = "2.5";
    expect(() => lerPlanilhaDeCusto(quebrada)).toThrow(/número inteiro/);

    const repetida = planilhaBoa();
    repetida[2].linhas.splice(3, 0, ["", "Porteiro", "1", "6040", "6040"]);
    expect(() => lerPlanilhaDeCusto(repetida)).toThrow(/duas vezes/);
  });
});

describe("previstoDosPostos", () => {
  it("multiplica a composição por empregado pela quantidade", () => {
    const r = lerPlanilhaDeCusto(planilhaBoa());
    expect(previstoDosPostos(r.postos)).toEqual({
      receita: 23460,
      pessoal: 3 * (2000 + 600 + 1500) + (1800 + 600 + 1300),
      insumos: 160,
      custos_indiretos: 1900,
      tributos: 3900,
      lucro: 1500,
    });
  });
});

describe("numero e normalizar", () => {
  it("lê o número do exceljs e o digitado à brasileira", () => {
    expect(numero("9273.9798")).toBe(9273.9798);
    expect(numero("R$ 1.234,56")).toBe(1234.56);
    expect(numero("12,5%")).toBe(0.125);
    expect(numero("Valor (R$)")).toBeNull();
    expect(numero("")).toBeNull();
  });

  it("ignora caixa, acento e o símbolo de grau", () => {
    expect(normalizar("EDUCADOR SOCIAl")).toBe("educador social");
    expect(normalizar("N° de  meses")).toBe("no de meses");
  });
});
