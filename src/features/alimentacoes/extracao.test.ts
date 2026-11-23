import { describe, expect, it } from "vitest";

import {
  extrair,
  extrairCompetencia,
  extrairRubrica,
  extrairUnidade,
  extrairValor,
  numeroPorExtenso,
} from "./extracao";

const HOJE = new Date("2026-11-23T12:00:00Z");

const RUBRICAS = [
  { id: "combustivel", palavras_chave: ["gasolina", "diesel", "abasteci", "posto"] },
  { id: "venda_gado", palavras_chave: ["gado", "boi", "bois", "novilho", "terneiros"] },
  { id: "venda_graos", palavras_chave: ["soja", "milho", "sacas"] },
  { id: "manutencao", palavras_chave: ["pneu", "oficina", "troca de oleo"] },
  { id: "outras", palavras_chave: [] },
];

const UNIDADES = [
  { id: "aurora", nome: "Estância Aurora (provisório)" },
  { id: "sao-pedro", nome: "Fazenda São Pedro (provisório)" },
];

describe("o áudio de exemplo", () => {
  it("abasteci a caminhonete da Estância Aurora, R$ 320 de gasolina em novembro", () => {
    const r = extrair(
      "abasteci a caminhonete da Estância Aurora, foram R$ 320 de gasolina em novembro",
      { rubricas: RUBRICAS, unidades: UNIDADES, hoje: HOJE },
    );
    expect(r).toMatchObject({
      unidade_id: "aurora",
      rubrica_id: "combustivel",
      valor: 320,
      competencia: "2026-11-01",
      faltou: [],
    });
    expect(r.descricao).toMatch(/^Abasteci a caminhonete/);
  });

  it("o que não acha fica vazio e é listado — nunca chute", () => {
    const r = extrair("comprei umas coisas pra fazenda", { rubricas: RUBRICAS, unidades: UNIDADES, hoje: HOJE });
    expect(r).toMatchObject({ unidade_id: null, rubrica_id: null, valor: null, competencia: null });
    expect(r.faltou).toEqual(["cliente", "rubrica", "valor", "competencia"]);
  });
});

describe("valor", () => {
  it.each([
    ["foram R$ 320 de gasolina", 320],
    ["R$320,50 no posto", 320.5],
    ["paguei R$ 1.500,00", 1500],
    ["deu R$ 1.500", 1500],
    ["R$ 2 mil de adubo", 2000],
    ["foram 320 reais", 320],
    ["uns 2 mil reais", 2000],
    ["1,5 mil pila", 1500],
    ["trezentos e vinte reais de gasolina", 320],
    ["dois mil e quinhentos reais", 2500],
    ["cem pila", 100],
  ])("%s → %d", (texto, esperado) => {
    expect(extrairValor(texto)).toBe(esperado);
  });

  it("sem moeda não é valor: '3 sacas' não vira R$ 3", () => {
    expect(extrairValor("vendi 300 sacas de soja")).toBeNull();
  });

  it("por extenso", () => {
    expect(numeroPorExtenso(["trezentos", "e", "vinte"])).toBe(320);
    expect(numeroPorExtenso(["mil"])).toBe(1000);
    expect(numeroPorExtenso(["caminhonete"])).toBeNull();
  });
});

describe("competência", () => {
  it.each([
    ["em novembro", "2026-11-01"],
    ["em março", "2026-03-01"],
    ["dezembro", "2025-12-01"], // mês sem ano nunca é futuro
    ["novembro de 2025", "2025-11-01"],
    ["foi mês passado", "2026-10-01"],
    ["neste mês", "2026-11-01"],
  ])("%s → %s", (texto, esperado) => {
    expect(extrairCompetencia(texto, HOJE)).toBe(esperado);
  });

  it("mês passado em janeiro volta o ano", () => {
    expect(extrairCompetencia("mês passado", new Date("2026-01-10T12:00:00Z"))).toBe("2025-12-01");
  });

  it("sem mês, sem competência", () => {
    expect(extrairCompetencia("abasteci ontem", HOJE)).toBeNull();
  });
});

describe("rubrica", () => {
  it("a de mais termos encontrados", () => {
    expect(extrairRubrica("vendi 40 bois e 10 terneiros", RUBRICAS)).toBe("venda_gado");
    expect(extrairRubrica("troca de óleo na oficina", RUBRICAS)).toBe("manutencao");
  });

  it("termo é palavra inteira: 'bois' não acha 'boi' dentro de 'boiada'", () => {
    expect(extrairRubrica("vendi a boiada", RUBRICAS)).toBeNull();
  });

  it("empate não sugere", () => {
    expect(extrairRubrica("gasolina e soja", RUBRICAS)).toBeNull();
  });
});

describe("cliente (unidade do contrato)", () => {
  it("pelo nome inteiro, sem o '(provisório)'", () => {
    expect(extrairUnidade("lá na Estância Aurora", UNIDADES)).toBe("aurora");
    expect(extrairUnidade("na fazenda são pedro", UNIDADES)).toBe("sao-pedro");
  });

  it("pela parte própria, quando ela identifica uma só", () => {
    expect(extrairUnidade("o diesel da Aurora", UNIDADES)).toBe("aurora");
  });

  it("nome que não está no contrato não vira cliente", () => {
    expect(extrairUnidade("na Estância Boa Vista", UNIDADES)).toBeNull();
  });
});
