import { describe, expect, it } from "vitest";

import { esquemaFormularioRascunho, esquemaPublicacao, esquemaRascunho } from "./schemas";

const TIPO = "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2";
const PESSOA = "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c";
const CONTRATO = "d594b950-e556-5f78-ae9b-98f6b1d12b63";

const formulario = {
  tipo_id: TIPO,
  titulo: "  Comunicado de outubro  ",
  descricao: "",
  escopo: "individual" as const,
  pessoa_id: PESSOA,
  publicos: [{ contrato_id: "", unidade_id: "", funcao: "" }],
};

describe("esquemaFormularioRascunho", () => {
  it("individual leva só a pessoa, e descrição vazia vira null", () => {
    const r = esquemaFormularioRascunho.parse(formulario);
    expect(r).toEqual({
      tipo_id: TIPO,
      titulo: "Comunicado de outubro",
      descricao: null,
      escopo: "individual",
      pessoa_id: PESSOA,
    });
  });

  it("coletivo leva os públicos, com select vazio como null", () => {
    const r = esquemaFormularioRascunho.parse({
      ...formulario,
      escopo: "coletivo",
      pessoa_id: "",
      publicos: [{ contrato_id: CONTRATO, unidade_id: "", funcao: "Porteiro" }],
    });
    expect(r).toMatchObject({
      escopo: "coletivo",
      publicos: [{ contrato_id: CONTRATO, unidade_id: null, funcao: "Porteiro" }],
    });
    expect(r).not.toHaveProperty("pessoa_id");
  });

  it("público só com função é recusado — alcançaria a organização inteira", () => {
    const r = esquemaFormularioRascunho.safeParse({
      ...formulario,
      escopo: "coletivo",
      publicos: [{ contrato_id: "", unidade_id: "", funcao: "Porteiro" }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ["publicos", 0],
      message: "Cada público precisa de um contrato ou de uma unidade.",
    });
  });

  it("individual sem pessoa aponta o erro no campo da pessoa", () => {
    const r = esquemaFormularioRascunho.safeParse({ ...formulario, pessoa_id: "" });
    expect(r.error?.issues[0]?.path).toEqual(["pessoa_id"]);
  });
});

describe("esquemaRascunho (o da Server Action)", () => {
  it("coletivo sem público é recusado", () => {
    const r = esquemaRascunho.safeParse({
      tipo_id: TIPO,
      titulo: "x",
      escopo: "coletivo",
      publicos: [],
    });
    expect(r.success).toBe(false);
  });

  it("não aceita escopo desconhecido", () => {
    expect(
      esquemaRascunho.safeParse({ tipo_id: TIPO, titulo: "x", escopo: "todos" }).success,
    ).toBe(false);
  });
});

describe("esquemaPublicacao", () => {
  it("prazo vazio vira null — o banco aplica o padrão do tipo", () => {
    expect(
      esquemaPublicacao.parse({ documento_id: PESSOA, prazo_ciencia: "" }).prazo_ciencia,
    ).toBeNull();
  });
});
