import { describe, expect, it } from "vitest";

import { CATEGORIAS, CHAVES_CATEGORIA } from "./categorias";
import { sugestaoParaLancamento, type ContextoDeLeitura, type SugestaoDeLancamento } from "./ia";
import {
  calcularPainel,
  mesPorExtenso,
  primeiroDiaDoMes,
  type LancamentoDoPainel,
  type PostoDoPainel,
} from "./painel";

// Valores fictícios: dois cargos, 1 + 2 postos.
const POSTOS: PostoDoPainel[] = [
  { id: "p1", cargo: "Coordenador", quantidade: 1, valor_total: 10000, remuneracao: 3000, beneficios: 600, encargos: 2000, insumos: 50, custos_indiretos: 1000, tributos: 2000, lucro: 1350 },
  { id: "p2", cargo: "Visitador", quantidade: 2, valor_total: 12000, remuneracao: 2000, beneficios: 600, encargos: 1500, insumos: 50, custos_indiretos: 500, tributos: 1200, lucro: 150 },
];

const lanc = (categoria: string, valor: number, extra: Partial<LancamentoDoPainel> = {}): LancamentoDoPainel => ({
  categoria, valor, status: "confirmado", posto_id: null, ...extra,
});

describe("calcularPainel", () => {
  it("monta o previsto pela planilha, multiplicando pela quantidade", () => {
    const p = calcularPainel(POSTOS, []);
    const previsto = Object.fromEntries(p.linhas.map((l) => [l.grupo, l.previsto]));
    expect(previsto).toEqual({
      receita: 22000,
      pessoal: 5600 + 2 * 4100,
      insumos: 150,
      operacao: 2000,
      tributos: 4400,
    });
    expect(p.resultado.previsto).toBe(1650);
    expect(p.margem.prevista).toBeCloseTo(1650 / 22000);
    expect(p.semFaturamento).toBe(true);
    expect(p.margem.realizada).toBeNull();
  });

  it("realizado: glosa subtrai, em conferência fica de fora, descartado some", () => {
    const p = calcularPainel(POSTOS, [
      lanc("faturamento", 22000),
      lanc("glosa", 500),
      lanc("tributos", 4300),
      lanc("folha", 9000, { posto_id: "p2" }),
      lanc("ferias_13", 2500, { posto_id: "p1" }),
      lanc("viagem", 800),
      lanc("alimentacao", 120, { status: "em_conferencia" }),
      lanc("materiais", 9999, { status: "descartado" }),
    ]);
    const r = Object.fromEntries(p.linhas.map((l) => [l.grupo, l.realizado]));
    expect(r).toEqual({ receita: 21500, pessoal: 11500, insumos: 0, operacao: 800, tributos: 4300 });
    expect(p.resultado.realizado).toBe(21500 - 11500 - 800 - 4300);
    expect(p.aConferir).toEqual({ quantidade: 1, valor: 120 });
    expect(p.linhas.find((l) => l.grupo === "operacao")?.aConferir).toBe(120);
    expect(p.tributoEstimado).toBe(false);
    expect(p.semFaturamento).toBe(false);
    expect(p.porPosto.map((x) => [x.cargo, x.pessoalRealizado])).toEqual([
      ["Coordenador", 2500],
      ["Visitador", 9000],
    ]);
  });

  it("sem tributo lançado, estima pela alíquota da planilha e avisa", () => {
    const p = calcularPainel(POSTOS, [lanc("faturamento", 11000)]);
    expect(p.tributoEstimado).toBe(true);
    expect(p.linhas.find((l) => l.grupo === "tributos")?.realizado).toBe(2200); // 4400/22000 × 11000
  });

  it("ignora categoria desconhecida em vez de somar no lugar errado", () => {
    const p = calcularPainel(POSTOS, [lanc("inventada", 1000)]);
    expect(p.linhas.every((l) => l.realizado === 0)).toBe(true);
  });
});

describe("categorias", () => {
  it("toda categoria tem natureza coerente com o grupo (o check do banco espera isso)", () => {
    for (const chave of CHAVES_CATEGORIA) {
      const def = CATEGORIAS[chave];
      expect(def.natureza === "receita").toBe(def.grupo === "receita");
    }
  });
});

describe("datas da competência", () => {
  it("normaliza o mês e escreve por extenso", () => {
    expect(primeiroDiaDoMes("2026-11")).toBe("2026-11-01");
    expect(primeiroDiaDoMes("2026-11-20")).toBe("2026-11-01");
    expect(primeiroDiaDoMes("2026-13")).toBeNull();
    expect(primeiroDiaDoMes("nov")).toBeNull();
    expect(mesPorExtenso("2026-11-01")).toBe("novembro de 2026");
  });
});

describe("sugestaoParaLancamento (regra de conferência da IA)", () => {
  const contexto: ContextoDeLeitura = {
    contrato: "Santo Ângelo",
    competencia: "2026-11-01",
    cargos: [{ id: "p1", cargo: "Coordenador" }, { id: "p2", cargo: "Visitador" }],
  };
  const base: SugestaoDeLancamento = {
    categoria: "alimentacao", valor: 95.5, descricao: "Almoço da equipe", data_documento: "2026-11-10",
    cargo: null, confianca: 0.95, duvidas: [], transcricao: "gastei 95,50 no almoço da equipe",
  };

  it("confiança alta e sem dúvida entra confirmado", () => {
    expect(sugestaoParaLancamento(base, contexto)).toMatchObject({
      natureza: "despesa", categoria: "alimentacao", valor: 95.5, status: "confirmado",
    });
  });

  it("confiança baixa, dúvida declarada ou categoria estranha vai para conferência", () => {
    expect(sugestaoParaLancamento({ ...base, confianca: 0.6 }, contexto)?.status).toBe("em_conferencia");
    expect(sugestaoParaLancamento({ ...base, duvidas: ["Qual competência?"] }, contexto)?.status).toBe("em_conferencia");
    const estranha = sugestaoParaLancamento({ ...base, categoria: "lanche" }, contexto);
    expect(estranha).toMatchObject({ categoria: "outros", status: "em_conferencia" });
    expect(sugestaoParaLancamento({ ...base, confianca: Number.NaN }, contexto)?.status).toBe("em_conferencia");
  });

  it("casa o cargo com a planilha; ambíguo vira pergunta", () => {
    expect(sugestaoParaLancamento({ ...base, cargo: "visitador" }, contexto)?.posto_id).toBe("p2");
    const ambiguo = sugestaoParaLancamento({ ...base, cargo: "o" }, contexto);
    expect(ambiguo?.posto_id).toBeNull();
    expect(ambiguo?.status).toBe("em_conferencia");
  });

  it("sem valor não grava nada", () => {
    expect(sugestaoParaLancamento({ ...base, valor: null }, contexto)).toBeNull();
    expect(sugestaoParaLancamento({ ...base, valor: 0 }, contexto)).toBeNull();
  });
});
