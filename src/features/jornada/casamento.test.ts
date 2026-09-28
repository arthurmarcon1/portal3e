import { describe, expect, it } from "vitest";

import {
  casarArquivos,
  compilarRegra,
  competenciaDoMes,
  ErroDeRegra,
  extrairChave,
  nomeBase,
  rotuloCompetencia,
  type PessoaParaCasar,
} from "./casamento";

const PADRAO = "(\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2})";

const maria: PessoaParaCasar = { id: "m", nome: "Maria", cpf: "01000791998", matricula: "A-102" };
const joao: PessoaParaCasar = { id: "j", nome: "João", cpf: "01001583825", matricula: "A-205" };
const ana: PessoaParaCasar = { id: "a", nome: "Ana", cpf: "01002375720", matricula: null };

describe("compilarRegra", () => {
  it("recusa vazia, longa demais e inválida, com mensagem que ajuda", () => {
    expect(() => compilarRegra("  ")).toThrow(ErroDeRegra);
    expect(() => compilarRegra("a".repeat(201))).toThrow(/200 caracteres/);
    expect(() => compilarRegra("(\\d{11}")).toThrow(/não é válida/);
  });
});

describe("extrairChave", () => {
  const regra = compilarRegra(PADRAO);

  it("acha o CPF com ou sem pontuação, em qualquer lugar do nome", () => {
    expect(extrairChave("espelho_010.007.919-98_ago.pdf", regra, "cpf")).toBe("01000791998");
    expect(extrairChave("01000791998.pdf", regra, "cpf")).toBe("01000791998");
  });

  it("olha só o nome, não a pasta de dentro do ZIP", () => {
    expect(extrairChave("12345678901/espelho.pdf", regra, "cpf")).toBeNull();
    expect(nomeBase("lote/agosto/01000791998.pdf")).toBe("01000791998.pdf");
  });

  it("CPF com menos de 11 dígitos não vale", () => {
    expect(extrairChave("x.pdf", compilarRegra("(\\d+)"), "cpf")).toBeNull();
    expect(extrairChave("123.pdf", compilarRegra("(\\d+)"), "cpf")).toBeNull();
  });

  it("matrícula pelo primeiro grupo, sem diferença de caixa", () => {
    const porMatricula = compilarRegra("^ESP_([A-Za-z]-\\d+)_");
    expect(extrairChave("ESP_a-102_2026-08.pdf", porMatricula, "matricula")).toBe("A-102");
  });

  it("sem grupo, vale o casamento inteiro", () => {
    expect(extrairChave("mat A-205 ago.pdf", compilarRegra("A-\\d+"), "matricula")).toBe("A-205");
  });
});

describe("casarArquivos", () => {
  const regra = { expressao: PADRAO, campo: "cpf" as const };

  it("separa casados, sem chave, sem pessoa, repetidos e já publicados, e lista quem ficou sem espelho", () => {
    const r = casarArquivos(
      [
        "010.007.919-98.pdf", // Maria
        "espelho-sem-cpf.pdf",
        "99999999999.pdf", // ninguém
        "01000791998-copia.pdf", // Maria de novo
        "01001583825.pdf", // João, já publicado
      ],
      regra,
      [maria, joao, ana],
      [maria, joao, ana],
      new Set(["j"]),
    );

    expect(r.casados).toEqual([{ arquivo: "010.007.919-98.pdf", pessoaId: "m", pessoaNome: "Maria" }]);
    expect(r.naoCasados.map((n) => [n.arquivo, n.motivo])).toEqual([
      ["espelho-sem-cpf.pdf", "sem_chave"],
      ["99999999999.pdf", "sem_pessoa"],
      ["01000791998-copia.pdf", "repetido"],
      ["01001583825.pdf", "ja_publicado"],
    ]);
    // João já tem; Ana é a única esperada sem arquivo.
    expect(r.semEspelho).toEqual([{ id: "a", nome: "Ana" }]);
  });

  it("por matrícula, quem não tem matrícula não casa", () => {
    const r = casarArquivos(
      ["A-102.pdf", "B-9.pdf"],
      { expressao: "([A-Z]-\\d+)", campo: "matricula" },
      [maria, ana],
      [],
      new Set(),
    );
    expect(r.casados.map((c) => c.pessoaId)).toEqual(["m"]);
    expect(r.naoCasados).toEqual([{ arquivo: "B-9.pdf", motivo: "sem_pessoa", chave: "B-9" }]);
  });
});

describe("competência", () => {
  it("mês do input vira o 1º dia; mês inválido vira null", () => {
    expect(competenciaDoMes("2026-08")).toBe("2026-08-01");
    expect(competenciaDoMes("2026-13")).toBeNull();
    expect(competenciaDoMes("08/2026")).toBeNull();
    expect(rotuloCompetencia("2026-08-01")).toBe("08/2026");
  });
});
