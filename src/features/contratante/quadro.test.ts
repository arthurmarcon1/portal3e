import { describe, expect, it } from "vitest";

import { cpfParcial, situacaoPorUnidade, totalDePessoas, type PessoaDoQuadro } from "./quadro";

function pessoa(parcial: Partial<PessoaDoQuadro>): PessoaDoQuadro {
  return {
    pessoa_id: "p1",
    nome: "Fulana",
    matricula: null,
    cpf_final: "998",
    funcao: "Recepção",
    contrato_id: "c1",
    contrato_numero: "042",
    unidade_id: "u1",
    unidade_nome: "Centro",
    situacao: "ativa",
    data_inicio: "2025-01-01",
    ...parcial,
  };
}

describe("cpfParcial", () => {
  it("mostra só os 3 últimos dígitos", () => {
    expect(cpfParcial("998")).toBe("***.***.**9-98");
  });

  it("recebendo mais que 3 dígitos por engano, não mostra o resto", () => {
    expect(cpfParcial("01000791998")).toBe("***.***.**9-98");
  });
});

describe("situacaoPorUnidade", () => {
  it("conta por contrato e unidade, separando férias e afastados", () => {
    const linhas = situacaoPorUnidade([
      pessoa({ pessoa_id: "a" }),
      pessoa({ pessoa_id: "b", situacao: "ferias" }),
      pessoa({ pessoa_id: "c", situacao: "afastado" }),
      pessoa({ pessoa_id: "d", unidade_id: "u2", unidade_nome: "Anexo" }),
    ]);
    expect(linhas).toEqual([
      { unidade_id: "u2", unidade_nome: "Anexo", contrato_numero: "042", alocados: 1, ativa: 1, ferias: 0, afastado: 0 },
      { unidade_id: "u1", unidade_nome: "Centro", contrato_numero: "042", alocados: 3, ativa: 1, ferias: 1, afastado: 1 },
    ]);
  });

  it("pessoa em duas unidades conta nas duas, mas uma vez no total de pessoas", () => {
    const quadro = [pessoa({}), pessoa({ unidade_id: "u2", unidade_nome: "Anexo" })];
    expect(situacaoPorUnidade(quadro)).toHaveLength(2);
    expect(totalDePessoas(quadro)).toBe(1);
  });
});
