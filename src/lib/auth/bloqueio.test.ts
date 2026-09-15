import { describe, expect, it } from "vitest";

import {
  avaliarBloqueio,
  JANELA_MINUTOS,
  LIMITE_FALHAS,
  mensagemDeBloqueio,
  type EventoDeTentativa,
} from "./bloqueio";

const AGORA = new Date("2026-09-14T15:00:00Z");

/** Evento `minutos` antes de AGORA. */
function ha(minutos: number, acao = "falha_login"): EventoDeTentativa {
  return { acao, criado_em: new Date(AGORA.getTime() - minutos * 60_000).toISOString() };
}

describe("avaliarBloqueio", () => {
  it("não bloqueia abaixo do limite", () => {
    const eventos = Array.from({ length: LIMITE_FALHAS - 1 }, (_, i) => ha(i + 1));
    expect(avaliarBloqueio(eventos, AGORA)).toEqual({
      bloqueado: false,
      falhasRecentes: LIMITE_FALHAS - 1,
    });
  });

  it("bloqueia ao atingir o limite dentro da janela", () => {
    const eventos = Array.from({ length: LIMITE_FALHAS }, (_, i) => ha(i + 1));
    const situacao = avaliarBloqueio(eventos, AGORA);
    expect(situacao.bloqueado).toBe(true);
  });

  it("libera quando a falha mais antiga das que bloqueiam sai da janela", () => {
    // Falhas a 1, 2, 3, 4 e 10 minutos: a de 10 minutos é a quinta mais
    // recente, e sai da janela daqui a JANELA - 10 minutos.
    const eventos = [ha(1), ha(2), ha(3), ha(4), ha(10)];
    const situacao = avaliarBloqueio(eventos, AGORA);

    expect(situacao).toMatchObject({ bloqueado: true, minutosRestantes: JANELA_MINUTOS - 10 });
    if (situacao.bloqueado) {
      expect(situacao.ate.toISOString()).toBe(
        new Date(AGORA.getTime() + (JANELA_MINUTOS - 10) * 60_000).toISOString(),
      );
    }
  });

  it("ignora falhas fora da janela", () => {
    const eventos = [ha(1), ha(2), ha(3), ha(4), ha(JANELA_MINUTOS + 1)];
    expect(avaliarBloqueio(eventos, AGORA).bloqueado).toBe(false);
  });

  it("login bem-sucedido zera a contagem", () => {
    const eventos = [ha(1), ha(2), ha(3, "login"), ha(4), ha(5), ha(6), ha(7)];
    expect(avaliarBloqueio(eventos, AGORA)).toEqual({ bloqueado: false, falhasRecentes: 2 });
  });

  it("senha redefinida pela recuperação também zera", () => {
    const eventos = [ha(1, "senha_redefinida"), ha(2), ha(3), ha(4), ha(5), ha(6)];
    expect(avaliarBloqueio(eventos, AGORA)).toEqual({ bloqueado: false, falhasRecentes: 0 });
  });

  it("não depende da ordem em que os eventos chegam", () => {
    const eventos = [ha(5), ha(3, "login"), ha(1), ha(4), ha(2)];
    expect(avaliarBloqueio(eventos, AGORA)).toEqual({ bloqueado: false, falhasRecentes: 2 });
  });

  it("conta falha gravada com relógio do banco um pouco à frente", () => {
    const adiantada = { acao: "falha_login", criado_em: new Date(AGORA.getTime() + 2_000).toISOString() };
    const eventos = [adiantada, ha(1), ha(2), ha(3), ha(4)];
    expect(avaliarBloqueio(eventos, AGORA).bloqueado).toBe(true);
  });

  it("nunca diz 0 minutos a quem está bloqueado", () => {
    const eventos = [ha(1), ha(2), ha(3), ha(4), ha(JANELA_MINUTOS - 0.1)];
    expect(avaliarBloqueio(eventos, AGORA)).toMatchObject({ bloqueado: true, minutosRestantes: 1 });
  });
});

describe("mensagemDeBloqueio", () => {
  it("diz o horário de Brasília em que libera e quanto falta", () => {
    const ate = new Date(AGORA.getTime() + 12 * 60_000); // 15:12 UTC = 12:12 em Brasília
    const mensagem = mensagemDeBloqueio(ate, AGORA);
    expect(mensagem).toContain("até 12:12");
    expect(mensagem).toContain("daqui a 12 minutos");
    expect(mensagem).toContain("A conta não foi desativada");
    expect(mensagem).toContain("Esqueci minha senha");
  });

  it("no singular e nunca em zero", () => {
    expect(mensagemDeBloqueio(new Date(AGORA.getTime() + 5_000), AGORA)).toContain("daqui a 1 minuto)");
  });
});
