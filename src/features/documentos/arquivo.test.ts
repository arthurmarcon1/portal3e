import { describe, expect, it } from "vitest";

import {
  caminhoNoStorage,
  dataMaisDias,
  ErroDeArquivo,
  hashDoArquivo,
  TAMANHO_MAXIMO,
  validarPdf,
} from "./arquivo";

const pdf = (resto = "1.7\n%fim") => new TextEncoder().encode(`%PDF-${resto}`);

describe("validarPdf", () => {
  it("aceita arquivo que começa com a assinatura de PDF", () => {
    expect(() => validarPdf(pdf())).not.toThrow();
  });

  it("recusa arquivo vazio", () => {
    expect(() => validarPdf(new Uint8Array())).toThrow(ErroDeArquivo);
  });

  it("recusa o que não é PDF, qualquer que seja a extensão", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(() => validarPdf(png)).toThrow(/não é um PDF/);
  });

  it("recusa acima do limite", () => {
    const grande = new Uint8Array(TAMANHO_MAXIMO + 1);
    grande.set(pdf());
    expect(() => validarPdf(grande)).toThrow(/7 MB/);
  });
});

describe("hashDoArquivo", () => {
  it("é o sha256 hex do conteúdo", () => {
    // sha256("abc"), vetor de teste do FIPS 180-2.
    expect(hashDoArquivo(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("caminhoNoStorage", () => {
  it("segue {org}/{ano}/{tipo}/{id}.pdf", () => {
    expect(caminhoNoStorage("org", "comunicado", "doc", new Date("2026-09-28T12:00:00Z"))).toBe(
      "org/2026/comunicado/doc.pdf",
    );
  });

  it("usa o ano de Brasília na virada do ano", () => {
    // 02:00 UTC de 1º/jan ainda é 31/dez em Brasília.
    expect(caminhoNoStorage("o", "t", "d", new Date("2027-01-01T02:00:00Z"))).toBe(
      "o/2026/t/d.pdf",
    );
  });
});

describe("dataMaisDias", () => {
  it("soma dias corridos à data de Brasília", () => {
    expect(dataMaisDias(5, new Date("2026-09-28T12:00:00Z"))).toBe("2026-10-03");
  });

  it("parte do dia de Brasília, não do UTC", () => {
    // 01:00 UTC de 29/set ainda é 28/set em Brasília.
    expect(dataMaisDias(5, new Date("2026-09-29T01:00:00Z"))).toBe("2026-10-03");
  });

  it("vira o mês", () => {
    expect(dataMaisDias(5, new Date("2026-12-29T12:00:00Z"))).toBe("2027-01-03");
  });
});
