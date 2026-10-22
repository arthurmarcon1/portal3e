import { describe, expect, it } from "vitest";

import {
  dataPorExtenso,
  linhaDoPrazo,
  mesPorExtenso,
  momentoPorExtenso,
  textosDaResposta,
  tituloParaFuncionario,
} from "./textos";

describe("mesPorExtenso", () => {
  it("competência vira o mês por extenso", () => {
    expect(mesPorExtenso("2026-08-01")).toBe("agosto de 2026");
    expect(mesPorExtenso("2026-03")).toBe("março de 2026");
  });

  it("o que não é mês não inventa nome", () => {
    expect(mesPorExtenso(null)).toBeNull();
    expect(mesPorExtenso("2026-13-01")).toBeNull();
    expect(mesPorExtenso("agosto")).toBeNull();
  });
});

describe("tituloParaFuncionario", () => {
  it("reescreve só o título que a publicação de espelhos gera", () => {
    expect(tituloParaFuncionario("Espelho de ponto — 08/2026")).toBe("Espelho de ponto de agosto de 2026");
    expect(tituloParaFuncionario("Espelho de ponto — 12/2025")).toBe("Espelho de ponto de dezembro de 2025");
  });

  it("título digitado pela equipe passa como está", () => {
    expect(tituloParaFuncionario("Comunicado de férias coletivas")).toBe("Comunicado de férias coletivas");
    expect(tituloParaFuncionario("Espelho de ponto — agosto, retificado")).toBe("Espelho de ponto — agosto, retificado");
    expect(tituloParaFuncionario("Espelho de ponto — 13/2026")).toBe("Espelho de ponto — 13/2026");
  });
});

describe("datas por extenso", () => {
  it("prazo sem o ano quando é o ano corrente", () => {
    expect(dataPorExtenso("2026-09-10", "2026-10-22")).toBe("10 de setembro");
    expect(dataPorExtenso("2027-01-05", "2026-10-22")).toBe("5 de janeiro de 2027");
  });

  it("momento da resposta em Brasília, não em UTC", () => {
    // 01h31 UTC do dia 23 = 22h31 do dia 22 em Brasília.
    expect(momentoPorExtenso("2026-10-23T01:31:00Z")).toBe("22 de outubro de 2026, às 22h31");
    expect(momentoPorExtenso("2026-10-22T13:05:00Z")).toBe("22 de outubro de 2026, às 10h05");
  });
});

describe("linhaDoPrazo", () => {
  it("prazo em aberto diz até quando", () => {
    expect(linhaDoPrazo("2026-10-30", "2026-10-22")).toEqual({ texto: "Responda até 30 de outubro.", vencido: false });
  });

  it("vence no fim do dia: no próprio dia ainda está em aberto", () => {
    expect(linhaDoPrazo("2026-10-22", "2026-10-22").vencido).toBe(false);
  });

  it("prazo vencido diz que ainda dá para responder", () => {
    expect(linhaDoPrazo("2026-09-10", "2026-10-22")).toEqual({
      texto: "O prazo era 10 de setembro. Você ainda pode responder.",
      vencido: true,
    });
  });
});

describe("textosDaResposta", () => {
  it("espelho: confirmar é concordar com a jornada, não só acusar recebimento", () => {
    const t = textosDaResposta("espelho_ponto", "Espelho de ponto — 08/2026");
    expect(t.confirmar).toBe("Está tudo certo");
    expect(t.apontarErro).toBe("Tem algo errado");
    expect(t.dialogoTitulo).toBe("Confirmar que o espelho de agosto está certo?");
    expect(t.dialogoTexto).toContain("concorda com este espelho");
    expect(t.confirmar).not.toMatch(/recebi/i);
  });

  it("espelho com título fora do padrão não inventa o mês", () => {
    expect(textosDaResposta("espelho_ponto", "Espelho avulso").dialogoTitulo).toBe(
      "Confirmar que este espelho está certo?",
    );
  });

  it("comunicado e norma: confirmar é dizer que leu", () => {
    expect(textosDaResposta("comunicado", "Férias").pergunta).toBe("Você leu este comunicado?");
    expect(textosDaResposta("norma_interna", "Uniforme").pergunta).toBe("Você leu esta norma?");
    expect(textosDaResposta("outro", "X").confirmar).toBe("Confirmar que li");
  });

  it("nenhum texto da tela do funcionário usa o vocabulário da equipe", () => {
    for (const chave of ["espelho_ponto", "comunicado", "norma_interna", "outro"]) {
      const textos = Object.values(textosDaResposta(chave, "Espelho de ponto — 08/2026")).join(" ");
      expect(textos).not.toMatch(/ciência|divergência|competência|protocolo/i);
    }
  });
});
