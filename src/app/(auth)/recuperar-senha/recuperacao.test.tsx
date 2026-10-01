import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pedirCodigo } from "@/features/auth/actions";
import { RECUPERACAO_INDISPONIVEL } from "@/features/auth/schemas";

import PaginaRecuperarSenha from "./page";

/**
 * Recuperação de senha sem e-mail ligado (docs/06, 2026-10-01).
 *
 * Uma tela que pede o CPF e nunca entrega o código é pior que a função
 * ausente. Sem `emailAtivo()`, a página não mostra formulário nenhum e diz a
 * quem recorrer; a action recusa do mesmo jeito, para quem a chamar direto.
 * Com as três variáveis, tudo volta ao normal — sem mudança de código.
 */

// Fora de uma requisição do Next, `connection()` lança. Aqui só importa o que
// a página desenha.
vi.mock("next/server", () => ({ connection: async () => {} }));

function emailLigado() {
  vi.stubEnv("NOTIFICACOES_EMAIL", "ativo");
  vi.stubEnv("RESEND_API_KEY", "re_teste");
  vi.stubEnv("EMAIL_REMETENTE", "Portal 3e <nao-responda@exemplo.invalid>");
}

function emailDesligado() {
  vi.stubEnv("NOTIFICACOES_EMAIL", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("EMAIL_REMETENTE", "");
}

async function pagina(): Promise<string> {
  return renderToStaticMarkup(await PaginaRecuperarSenha());
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tela de recuperação de senha", () => {
  it("sem e-mail: aponta os administradores, sem citar setor, e não pede CPF nem e-mail", async () => {
    emailDesligado();
    const html = await pagina();
    expect(html).toContain("indisponível");
    expect(html).toContain("redefinida pelos administradores do Portal");
    expect(html).not.toMatch(/\bRH\b|supervisor/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("CPF ou e-mail");
    expect(html).not.toContain("Enviamos um código");
    expect(html).toContain('href="/login"');
  });

  it("basta faltar uma das três variáveis para a tela não prometer código", async () => {
    emailLigado();
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await pagina()).not.toContain("<form");
  });

  it("com e-mail ligado: volta ao formulário de código", async () => {
    emailLigado();
    const html = await pagina();
    expect(html).toContain("<form");
    expect(html).toContain("CPF ou e-mail");
    expect(html).toContain("Enviamos um código");
    expect(html).not.toContain("indisponível");
    expect(html).not.toMatch(/\bRH\b|supervisor/);
  });
});

describe("pedirCodigo", () => {
  it("sem e-mail: recusa antes de olhar o identificador, com a mesma resposta para todos", async () => {
    emailDesligado();
    const esperado = { ok: false, erro: RECUPERACAO_INDISPONIVEL };
    // Nenhum dos dois chega ao banco: um CPF bem formado e um lixo dão o mesmo.
    expect(await pedirCodigo({ identificador: "010.007.919-98" })).toEqual(esperado);
    expect(await pedirCodigo({ identificador: "x" })).toEqual(esperado);
  });
});
