import { describe, expect, it } from "vitest";

import { caminhoDoAviso, dentroDaJanela, montarEmail, primeiroNome, type Motivo } from "./modelo";

const MOTIVOS: Motivo[] = ["publicado", "lembrete", "vencido", "respondida", "concluida"];

describe("montarEmail", () => {
  for (const motivo of MOTIVOS) {
    it(`${motivo}: primeiro nome, uma frase, o botão e nada mais`, () => {
      const e = montarEmail({
        motivo,
        primeiroNome: "Maria",
        link: "https://portal.exemplo/documentos/abc",
        prazo: "2026-10-03",
        protocolo: "2026-000123",
      });
      expect(e.texto).toMatch(/^Olá, Maria\./);
      expect(e.html).toContain("Abrir no Portal");
      expect(e.html).toContain('href="https://portal.exemplo/documentos/abc"');
      expect(e.texto).toContain("Abrir no Portal: https://portal.exemplo/documentos/abc");
      // Nunca botão de confirmar nem anexo.
      expect(e.html).not.toMatch(/confirmar ciência|<form|<input|attachment/i);
      expect(e.html.match(/<a /g)).toHaveLength(1);
    });
  }

  it("não leva sobrenome, título de documento, CPF nem conteúdo", () => {
    const e = montarEmail({ motivo: "publicado", primeiroNome: primeiroNome("Maria Aparecida Ferreira"), link: "https://x/y" });
    expect(e.texto + e.html + e.assunto).not.toMatch(/Aparecida|Ferreira|\d{3}\.\d{3}/);
  });

  it("prazo em data brasileira; protocolo nos avisos de solicitação", () => {
    expect(montarEmail({ motivo: "lembrete", primeiroNome: "Ana", link: "l", prazo: "2026-10-03" }).texto).toContain("até 03/10/2026");
    expect(montarEmail({ motivo: "concluida", primeiroNome: "Ana", link: "l", protocolo: "2026-000009" }).texto).toContain("2026-000009");
  });

  it("escapa o que vai no HTML", () => {
    expect(montarEmail({ motivo: "publicado", primeiroNome: "<b>Ana</b>", link: "https://x/?a=1&b=2" }).html).toContain(
      "&lt;b&gt;Ana&lt;/b&gt;",
    );
  });
});

describe("dentroDaJanela", () => {
  it("8h às 20h em Brasília", () => {
    expect(dentroDaJanela(new Date("2026-09-29T11:00:00Z"))).toBe(true); // 08:00
    expect(dentroDaJanela(new Date("2026-09-29T10:59:00Z"))).toBe(false); // 07:59
    expect(dentroDaJanela(new Date("2026-09-29T23:00:00Z"))).toBe(false); // 20:00
  });
});

describe("caminhoDoAviso", () => {
  it("leva cada um para a própria área", () => {
    expect(caminhoDoAviso("documentos", "d", "funcionario")).toBe("/documentos/d");
    expect(caminhoDoAviso("solicitacoes", "s", "funcionario")).toBe("/pedidos/s");
    expect(caminhoDoAviso("solicitacoes", "s", "contratante")).toBe("/cliente/solicitacoes/s");
    expect(caminhoDoAviso("solicitacoes", "s", "interno")).toBe("/admin/solicitacoes/s");
  });
});
