import { describe, expect, it } from "vitest";

import { lerFiltroDaCaixa } from "@/features/solicitacoes/filtro-da-caixa";

import { campanhasMaisUrgentes, percentual, type PendenciaComEscopo } from "./campanhas";
import { dataPorExtenso, plural, saudacao } from "./saudacao";

const linha = (x: Partial<PendenciaComEscopo>): PendenciaComEscopo => ({
  documento_id: "d1",
  titulo: "Comunicado",
  tipo_nome: "Comunicado",
  prazo_ciencia: "2026-10-10",
  escopo: "coletivo",
  tipo_id: "t-com",
  ...x,
});

describe("campanhasMaisUrgentes", () => {
  it("espelhos individuais do mesmo fechamento viram uma campanha; coletivo fica sozinho", () => {
    const espelho = { titulo: "Espelho de ponto — 08/2026", tipo_nome: "Espelho de ponto", escopo: "individual" as const, tipo_id: "t-esp" };
    const r = campanhasMaisUrgentes(
      [
        linha({ ...espelho, documento_id: "e1", prazo_ciencia: "2026-10-05" }),
        linha({ ...espelho, documento_id: "e2", prazo_ciencia: "2026-10-03" }),
        linha({ documento_id: "c1" }),
        linha({ documento_id: "c2" }),
      ],
      10,
    );
    expect(r.map((c) => [c.chave, c.prazo])).toEqual([
      ["i:t-esp:Espelho de ponto — 08/2026", "2026-10-03"],
      ["c:c1", "2026-10-10"],
      ["c:c2", "2026-10-10"],
    ]);
  });

  it("prazo mais próximo primeiro, sem prazo por último, e respeita o limite", () => {
    const r = campanhasMaisUrgentes(
      [
        linha({ documento_id: "a", titulo: "Sem prazo", prazo_ciencia: null }),
        linha({ documento_id: "b", titulo: "Depois", prazo_ciencia: "2026-11-01" }),
        linha({ documento_id: "c", titulo: "Antes", prazo_ciencia: "2026-10-01" }),
      ],
      2,
    );
    expect(r.map((c) => c.titulo)).toEqual(["Antes", "Depois"]);
  });
});

describe("percentual", () => {
  it("arredonda para baixo: 100% só quando ninguém falta", () => {
    expect(percentual(339, 340)).toBe(99);
    expect(percentual(340, 340)).toBe(100);
    expect(percentual(0, 0)).toBe(0);
  });
});

describe("saudação", () => {
  it("usa a hora de Brasília, não a do servidor", () => {
    // 11:30 UTC = 08:30 em Brasília; 23:00 UTC = 20:00.
    expect(saudacao(new Date("2026-09-29T11:30:00Z"))).toBe("Bom dia");
    expect(saudacao(new Date("2026-09-29T17:00:00Z"))).toBe("Boa tarde");
    expect(saudacao(new Date("2026-09-29T23:00:00Z"))).toBe("Boa noite");
  });

  it("data por extenso em sentence case, no dia de Brasília", () => {
    expect(dataPorExtenso(new Date("2026-09-30T02:00:00Z"))).toBe("Terça-feira, 29 de setembro");
  });

  it("plural acompanha o número, inclusive o zero", () => {
    const r = ["solicitação vencida", "solicitações vencidas"] as const;
    expect(plural(0, r)).toBe("solicitações vencidas");
    expect(plural(1, r)).toBe("solicitação vencida");
  });
});

describe("lerFiltroDaCaixa", () => {
  it("aceita só os valores dos contadores; o resto abre a caixa no padrão", () => {
    expect(lerFiltroDaCaixa({ responsavel: "comigo", prazo: "vencidas" })).toEqual({ responsavel: "comigo", prazo: "vencidas" });
    expect(lerFiltroDaCaixa({ responsavel: "outro-id", prazo: "ontem" })).toEqual({ responsavel: "", prazo: "" });
  });
});
