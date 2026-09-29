import { describe, expect, it } from "vitest";

import { conformidade, resumoPorUnidade, situacaoDe, type DocumentoQueVence, type Lotacao } from "./conformidade";

const HOJE = "2026-09-30";

function doc(p: Partial<DocumentoQueVence>): DocumentoQueVence {
  return {
    id: "d1",
    titulo: "ASO periódico",
    tipo_id: "aso",
    tipo_nome: "ASO",
    regra: "por_pessoa",
    pessoa_id: "p1",
    pessoa_nome: "Ana",
    valido_ate: "2027-01-01",
    ...p,
  };
}

const LOT: Lotacao = { pessoa_id: "p1", contrato_id: "c1", contrato_numero: "042", unidade_id: "u1", unidade_nome: "Central" };

describe("situacaoDe", () => {
  it("vencido antes de hoje; a vencer de hoje até 30 dias; em dia depois", () => {
    expect(situacaoDe("2026-09-29", HOJE)).toEqual({ situacao: "vencido", dias: -1 });
    expect(situacaoDe(HOJE, HOJE)).toEqual({ situacao: "a_vencer", dias: 0 });
    expect(situacaoDe("2026-10-30", HOJE)).toEqual({ situacao: "a_vencer", dias: 30 });
    expect(situacaoDe("2026-10-31", HOJE)).toEqual({ situacao: "em_dia", dias: 31 });
  });
});

describe("conformidade", () => {
  it("ASO é por pessoa: o mais novo substitui o vencido, mesmo com outro título", () => {
    const linhas = conformidade(
      [
        doc({ id: "velho", titulo: "ASO admissional", valido_ate: "2026-01-01" }),
        doc({ id: "novo", titulo: "ASO periódico", valido_ate: "2027-01-01" }),
      ],
      [LOT],
      HOJE,
    );
    expect(linhas.map((l) => l.documento_id)).toEqual(["novo"]);
  });

  it("treinamento é por título: NR-35 vencido não é renovado pelo NR-10", () => {
    const base = { tipo_id: "trein", tipo_nome: "Treinamento", regra: "por_titulo" as const };
    const linhas = conformidade(
      [
        doc({ ...base, id: "nr35", titulo: "NR-35", valido_ate: "2026-09-01" }),
        doc({ ...base, id: "nr10", titulo: "NR-10", valido_ate: "2027-09-01" }),
        doc({ ...base, id: "nr35b", titulo: " nr-35 ", valido_ate: "2026-05-01" }),
      ],
      [LOT],
      HOJE,
    );
    expect(linhas.map((l) => [l.documento_id, l.situacao])).toEqual([
      ["nr35", "vencido"],
      ["nr10", "em_dia"],
    ]);
  });

  it("pessoa sem alocação vigente fica de fora", () => {
    expect(conformidade([doc({ pessoa_id: "saiu" })], [LOT], HOJE)).toEqual([]);
  });

  it("resumo conta por contrato e unidade", () => {
    const linhas = conformidade(
      [doc({ valido_ate: "2026-09-01" }), doc({ id: "d2", pessoa_id: "p2", valido_ate: "2026-10-10" })],
      [LOT, { ...LOT, pessoa_id: "p2" }],
      HOJE,
    );
    expect(resumoPorUnidade(linhas)).toEqual([
      { contrato_numero: "042", unidade_id: "u1", unidade_nome: "Central", vencido: 1, a_vencer: 1, em_dia: 0 },
    ]);
  });
});
