import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Teste das guardas de permissão contra o Supabase de verdade.
 *
 * Permissão neste projeto é **dado** (`perfil_permissoes`), não código. Um
 * teste com banco dublê provaria apenas que um `Set` funciona; o que precisa
 * ser provado é que a matriz de docs/02, como está no seed, produz as
 * respostas certas. Por isso aqui autentica-se cada persona de verdade.
 *
 * O que é dublado é só o encanamento que não existe fora de uma requisição
 * do Next: o client vindo de cookie e o `redirect()`.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

// Personas do seed. Senha única, documentada em supabase/seed.sql.
const SENHA = "portal3e2026";
const PERSONAS = {
  adminGeral: "admin_geral@3e.com.br",
  rhDp: "rh_dp@3e.com.br",
  sst: "sst@3e.com.br",
  fiscalContratante: "fiscal@hsaolucas.com.br",
  funcionaria: "01000791998@func.3e.portal3e",
} as const;

const clientes = new Map<string, SupabaseClient<Database>>();

function novoCliente(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes. Estes testes falam com o Supabase: " +
        "preencha .env.local antes de rodar.",
    );
  }
  return createClient<Database>(url, anon, { auth: { persistSession: false } });
}

beforeAll(async () => {
  for (const email of Object.values(PERSONAS)) {
    const cliente = novoCliente();
    const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA });
    if (error) {
      throw new Error(`não foi possível autenticar ${email}: ${error.message}`);
    }
    clientes.set(email, cliente);
  }
}, 30_000);

/**
 * Devolve o módulo de sessão ligado à persona pedida.
 *
 * `resetModules` a cada chamada porque `getUsuario`/`permissoesDoUsuario` são
 * memoizados com `cache()`: sem isso, a segunda persona leria a primeira.
 * `undefined` significa sem sessão.
 */
async function guardasComo(email?: string) {
  estado.cliente = email ? clientes.get(email) : novoCliente();
  vi.resetModules();
  return import("./sessao");
}

/** Captura o erro de uma guarda que deveria barrar. */
async function barrouCom(promessa: Promise<unknown>): Promise<Error> {
  try {
    await promessa;
  } catch (erro) {
    return erro as Error;
  }
  throw new Error("a guarda deixou passar, mas deveria ter barrado");
}

describe("exigirPermissao — perfil interno com a permissão", () => {
  it("deixa o Admin geral entrar em administracao:ver", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.adminGeral);
    const usuario = await exigirPermissao("administracao", "ver");
    expect(usuario.tipo).toBe("interno");
  });

  it("deixa o Admin geral excluir pessoas (ação forte da matriz)", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.adminGeral);
    await expect(exigirPermissao("pessoas", "excluir")).resolves.toBeDefined();
  });

  it("deixa o RH/DP criar pessoas", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.rhDp);
    await expect(exigirPermissao("pessoas", "criar")).resolves.toBeDefined();
  });
});

describe("exigirPermissao — perfil interno sem a permissão", () => {
  it("barra o RH/DP em administracao:ver (docs/02 dá '—' nessa célula)", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.rhDp);
    const erro = await barrouCom(exigirPermissao("administracao", "ver"));
    expect(erro.name).toBe("ErroDePermissao");
  });

  it("barra o SST em jornada:ver, mas libera sst:excluir", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.sst);
    expect((await barrouCom(exigirPermissao("jornada", "ver"))).name).toBe(
      "ErroDePermissao",
    );
    await expect(exigirPermissao("sst", "excluir")).resolves.toBeDefined();
  });

  it("barra o RH/DP na ação sem ser no módulo: pessoas:excluir", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.rhDp);
    const erro = await barrouCom(exigirPermissao("pessoas", "excluir"));
    expect(erro.name).toBe("ErroDePermissao");
  });
});

describe("exigirPermissao — usuário sem perfil nenhum", () => {
  it("barra a funcionária em qualquer permissão de módulo", async () => {
    const { exigirPermissao, permissoesDoUsuario } = await guardasComo(
      PERSONAS.funcionaria,
    );

    // O seed não vincula perfil a funcionário de propósito: o acesso dele ao
    // próprio dado vem da RLS por pessoa_id, não da matriz.
    expect((await permissoesDoUsuario()).size).toBe(0);

    for (const modulo of ["pessoas", "documentos", "administracao"] as const) {
      expect((await barrouCom(exigirPermissao(modulo, "ver"))).name).toBe(
        "ErroDePermissao",
      );
    }
  });
});

describe("exigirPermissao — tipos externos em módulo interno", () => {
  it("barra a funcionária em administracao:ver", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.funcionaria);
    expect((await barrouCom(exigirPermissao("administracao", "ver"))).name).toBe(
      "ErroDePermissao",
    );
  });

  it("barra o fiscal do contratante em administracao:ver e documentos:criar", async () => {
    const { exigirPermissao } = await guardasComo(PERSONAS.fiscalContratante);
    expect((await barrouCom(exigirPermissao("administracao", "ver"))).name).toBe(
      "ErroDePermissao",
    );
    expect((await barrouCom(exigirPermissao("documentos", "criar"))).name).toBe(
      "ErroDePermissao",
    );
  });

  it("MAS deixa o fiscal passar em pessoas:ver — por isso exigirPermissao não substitui exigirTipo", async () => {
    const { exigirPermissao, temPermissao } = await guardasComo(
      PERSONAS.fiscalContratante,
    );

    // docs/02 dá `pessoas: V` ao fiscal, no escopo do contrato dele. Ou seja:
    // a permissão de módulo sozinha NÃO o mantém fora de /admin/pessoas.
    // Quem faz isso é o exigirTipo("interno") do layout da área, e o que
    // limita as linhas que ele enxerga é a RLS. Se alguém remover a guarda de
    // área achando que a de módulo cobre, este teste explica o buraco.
    expect(await temPermissao("pessoas", "ver")).toBe(true);
    const usuario = await exigirPermissao("pessoas", "ver");
    expect(usuario.tipo).toBe("contratante");
  });
});

describe("exigirPermissao — sem sessão", () => {
  it("manda para /login em vez de devolver erro de permissão", async () => {
    const { exigirPermissao } = await guardasComo();
    const erro = await barrouCom(exigirPermissao("pessoas", "ver"));
    expect(erro.message).toBe("NEXT_REDIRECT:/login");
  });
});
