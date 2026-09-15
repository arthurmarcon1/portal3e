import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LIMITE_FALHAS } from "@/lib/auth/bloqueio";
import { chaveDoLogin } from "@/lib/auth/tentativas";
import type { Database } from "@/lib/supabase/types";

/**
 * Bloqueio de login por tentativas, contra o banco de verdade.
 *
 * A regra (janela, limite, o que zera) está coberta sem banco em
 * `src/lib/auth/bloqueio.test.ts`. O que só o banco prova é o circuito: a
 * `falha_login` gravada pela action leva a `chave_login` certa, a leitura
 * pelo índice da 0011 a encontra, e a tentativa bloqueada não chega ao Auth.
 *
 * **As falhas anteriores são semeadas pelo fixture, não geradas por login.**
 * O Supabase limita sign-in a 30 por 5 minutos por IP, para a suíte inteira;
 * cinco palpites errados por caso estourariam esse limite e derrubariam os
 * arquivos seguintes por um motivo que não é deles. Cada caso faz no máximo
 * UMA ida ao Auth.
 *
 * `service_role` só no fixture (semear e limpar `auditoria`, restaurar a
 * persona). A action roda com o client anônimo, como na tela de login.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const SENHA = "portal3e2026";

/** CPF válido, fora da faixa do seed e sem cadastro nenhum. */
const CPF_SEM_CADASTRO = "09000000157";
const EMAIL_SEM_CADASTRO = `${CPF_SEM_CADASTRO}@func.3e.portal3e`;

/** Persona do seed que nenhum outro arquivo usa pelo login da action. */
const FINANCEIRO = { id: "b8864205-4ba3-5295-886e-f0c8e843f3b8", email: "financeiro@3e.com.br" };

let admin: SupabaseClient<Database>;
let ultimoAcessoOriginal: string | null = null;
let chamadasAoAuth = 0;

function clienteAnonimo(): SupabaseClient<Database> {
  const cliente = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  // Conta as idas ao Auth: é o que prova que a senha não foi testada.
  const original = cliente.auth.signInWithPassword.bind(cliente.auth);
  cliente.auth.signInWithPassword = (credenciais) => {
    chamadasAoAuth += 1;
    return original(credenciais);
  };
  return cliente;
}

async function entrar(identificador: string, senha: string) {
  estado.cliente = clienteAnonimo();
  vi.resetModules();
  const { entrar: action } = await import("./actions");
  try {
    return await action({ identificador, senha });
  } catch (erro) {
    // Sucesso termina em redirect, que o mock transforma em exceção.
    if (erro instanceof Error && erro.message.startsWith("NEXT_REDIRECT:")) {
      return { redirecionou: erro.message.slice("NEXT_REDIRECT:".length) };
    }
    throw erro;
  }
}

/** Grava falhas passadas para a chave, como a action teria gravado. */
async function semearFalhas(email: string, quantidade: number, minutosAtras = 2) {
  const quando = new Date(Date.now() - minutosAtras * 60_000).toISOString();
  const { error } = await admin.from("auditoria").insert(
    Array.from({ length: quantidade }, () => ({
      org_id: ORG,
      acao: "falha_login",
      entidade: "usuarios",
      criado_em: quando,
      detalhes: { chave_login: chaveDoLogin(email), motivo: "fixture_de_teste" },
    })),
  );
  if (error) throw new Error(`fixture (falhas): ${error.message}`);
}

async function eventosDa(email: string) {
  const { data } = await admin
    .from("auditoria")
    .select("acao, org_id, usuario_id, detalhes")
    .eq("detalhes->>chave_login", chaveDoLogin(email))
    .order("id");
  return data ?? [];
}

async function limparTentativas() {
  for (const email of [EMAIL_SEM_CADASTRO, FINANCEIRO.email]) {
    await admin.from("auditoria").delete().eq("detalhes->>chave_login", chaveDoLogin(email));
  }
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes. " +
        "Este teste precisa do banco: veja a seção Testes do CLAUDE.md.",
    );
  }
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  const { data: colisao } = await admin
    .from("usuarios")
    .select("id")
    .eq("email_login", EMAIL_SEM_CADASTRO);
  if (colisao && colisao.length > 0) {
    throw new Error(`O CPF de teste ${CPF_SEM_CADASTRO} tem cadastro. Escolha outro.`);
  }

  const { data: persona } = await admin
    .from("usuarios")
    .select("ultimo_acesso")
    .eq("id", FINANCEIRO.id)
    .single();
  ultimoAcessoOriginal = persona?.ultimo_acesso ?? null;

  // Sobra de uma execução que morreu no meio. Só as chaves deste arquivo.
  await limparTentativas();
});

afterEach(async () => {
  await limparTentativas();
  chamadasAoAuth = 0;
});

afterAll(async () => {
  if (!admin) return;
  await limparTentativas();
  await admin
    .from("usuarios")
    .update({ ultimo_acesso: ultimoAcessoOriginal })
    .eq("id", FINANCEIRO.id);
});

describe("bloqueio por tentativas", () => {
  it("a falha gravada pela action conta, e a seguinte já é bloqueada sem testar a senha", async () => {
    await semearFalhas(EMAIL_SEM_CADASTRO, LIMITE_FALHAS - 1);

    const quinta = await entrar(CPF_SEM_CADASTRO, "senha-errada-1");
    expect(quinta).toMatchObject({ ok: false, erro: expect.stringContaining("incorretos") });
    expect(chamadasAoAuth).toBe(1);

    const sexta = await entrar(CPF_SEM_CADASTRO, "senha-errada-2");
    expect(sexta).toMatchObject({ ok: false, erro: expect.stringContaining("bloqueado") });
    expect(chamadasAoAuth).toBe(1);

    const eventos = await eventosDa(EMAIL_SEM_CADASTRO);
    expect(eventos.map((e) => e.acao)).toEqual([
      ...Array(LIMITE_FALHAS).fill("falha_login"),
      "login_bloqueado",
    ]);
  });

  it("CPF sem cadastro bloqueia igual — o bloqueio não revela quem existe", async () => {
    await semearFalhas(EMAIL_SEM_CADASTRO, LIMITE_FALHAS);

    const resultado = await entrar(CPF_SEM_CADASTRO, "qualquer");
    expect(resultado).toMatchObject({ ok: false, erro: expect.stringContaining("bloqueado") });

    // E o evento tem organização, senão sumiria da trilha (auditoria_leitura
    // filtra por org_id).
    const bloqueio = (await eventosDa(EMAIL_SEM_CADASTRO)).find(
      (e) => e.acao === "login_bloqueado",
    );
    expect(bloqueio).toMatchObject({ org_id: ORG, usuario_id: null });
  });

  it("durante o bloqueio, nem a senha certa entra", async () => {
    await semearFalhas(FINANCEIRO.email, LIMITE_FALHAS);

    const resultado = await entrar(FINANCEIRO.email, SENHA);

    expect(resultado).toMatchObject({ ok: false, erro: expect.stringContaining("bloqueado") });
    expect(chamadasAoAuth).toBe(0);

    const { data } = await admin
      .from("usuarios")
      .select("ultimo_acesso")
      .eq("id", FINANCEIRO.id)
      .single();
    expect(data?.ultimo_acesso ?? null).toBe(ultimoAcessoOriginal);
  });

  it("falhas fora da janela não bloqueiam, e o login grava a chave que zera a contagem", async () => {
    await semearFalhas(FINANCEIRO.email, LIMITE_FALHAS, 60);

    const resultado = await entrar(FINANCEIRO.email, SENHA);
    expect(resultado).toEqual({ redirecionou: "/admin" });

    const eventos = await eventosDa(FINANCEIRO.email);
    expect(eventos.at(-1)).toMatchObject({ acao: "login", usuario_id: FINANCEIRO.id });
  });
});
