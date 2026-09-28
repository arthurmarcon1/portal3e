import { describe, expect, it } from "vitest";

import { dataHoraBrasilia, gerarComprovante, type DadosDoComprovante } from "./comprovante";

/** Texto das páginas do PDF, pelo mesmo pdf.js da tela de ciência. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const conteudo = await (await doc.getPage(i)).getTextContent();
    partes.push(conteudo.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return partes.join("\n").replace(/\s+/g, " ");
}

const HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const base: DadosDoComprovante = {
  protocolo: "2026-000123",
  tipo: "confirmacao",
  justificativa: null,
  respondidoEm: "2026-09-29T01:30:05Z",
  pessoa: { nome: "Maria Aparecida Ferreira", cpf: "01000791998" },
  documento: { titulo: "Espelho de ponto — agosto/2026", tipoNome: "Espelho de ponto", versao: 2, hash: HASH },
  organizacao: { nome: "3e Gestao de Pessoas", cnpj: "09876543000141" },
  geradoEm: new Date("2026-09-30T12:00:00Z"),
};

describe("gerarComprovante", () => {
  it("é um PDF com tudo que docs/05 pede", async () => {
    const bytes = new Uint8Array(await gerarComprovante(base));
    expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");

    const texto = await textoDoPdf(bytes);
    expect(texto).toContain("Comprovante de ciência");
    expect(texto).toContain("2026-000123");
    expect(texto).toContain("Maria Aparecida Ferreira");
    expect(texto).toContain("***.007.919-**");
    expect(texto).toContain("Espelho de ponto — agosto/2026");
    expect(texto).toMatch(/Versão\s+2/);
    expect(texto.replace(/\s/g, "")).toContain(HASH);
    expect(texto).toContain("Ciência confirmada");
    // 01:30 UTC de 29/09 = 22:30 de 28/09 em Brasília.
    expect(texto).toContain("28/09/2026 às 22:30:05");
    expect(texto).toContain("CNPJ 09.876.543/0001-41");
  });

  it("não traz o CPF inteiro em lugar nenhum", async () => {
    const texto = await textoDoPdf(new Uint8Array(await gerarComprovante(base)));
    expect(texto).not.toContain("01000791998");
    expect(texto).not.toContain("010.007.919-98");
  });

  it("divergência traz a justificativa; confirmação não", async () => {
    const divergencia = await textoDoPdf(
      new Uint8Array(
        await gerarComprovante({
          ...base,
          tipo: "divergencia",
          justificativa: "Faltou o sábado dia 16, trabalhei das 7h às 13h.",
        }),
      ),
    );
    expect(divergencia).toContain("Comprovante de divergência");
    expect(divergencia).toContain("Faltou o sábado dia 16");

    const confirmacao = await textoDoPdf(new Uint8Array(await gerarComprovante(base)));
    expect(confirmacao).not.toContain("Justificativa");
  });
});

describe("dataHoraBrasilia", () => {
  it("diz o fuso por extenso", () => {
    expect(dataHoraBrasilia(new Date("2026-09-28T15:04:05Z"))).toBe(
      "28/09/2026 às 12:04:05 (horário de Brasília)",
    );
  });
});
