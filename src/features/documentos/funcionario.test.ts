import { describe, expect, it } from "vitest";

import { hojeEmBrasilia, pendencias, perguntaDaCiencia, type DocumentoDoFuncionario } from "./funcionario";

const doc = (p: Partial<DocumentoDoFuncionario>): DocumentoDoFuncionario => ({
  id: "x",
  titulo: "t",
  tipo_nome: "Comunicado",
  exige_ciencia: true,
  prazo_ciencia: null,
  publicado_em: null,
  resposta: null,
  ...p,
});

describe("pendencias", () => {
  it("só o que pede ciência e não tem resposta, prazo mais próximo primeiro", () => {
    const lista = [
      doc({ id: "sem-prazo" }),
      doc({ id: "tarde", prazo_ciencia: "2026-10-10" }),
      doc({ id: "respondido", resposta: { id: "c", tipo: "confirmacao", protocolo: "p", respondido_em: "", justificativa: null } }),
      doc({ id: "holerite", exige_ciencia: false }),
      doc({ id: "cedo", prazo_ciencia: "2026-10-01" }),
    ];
    expect(pendencias(lista).map((d) => d.id)).toEqual(["cedo", "tarde", "sem-prazo"]);
  });
});

describe("hojeEmBrasilia", () => {
  it("usa o dia de Brasília, não o UTC", () => {
    expect(hojeEmBrasilia(new Date("2026-09-29T02:00:00Z"))).toBe("2026-09-28");
  });
});

describe("perguntaDaCiencia", () => {
  it("espelho pede conferência; o resto, leitura", () => {
    expect(perguntaDaCiencia("espelho_ponto")).toBe("Você confere as informações deste espelho?");
    expect(perguntaDaCiencia("qualquer")).toBe("Você leu e está ciente deste documento?");
  });
});
