import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { lerFiltros, POR_PAGINA } from "./filtros";

/**
 * Trilha de auditoria (F2.2), contra o banco de verdade.
 *
 * O que se prova: quem lê a trilha é decidido pela RLS (`administracao:ver`),
 * a paginação de 100 não perde nem repete linha, e a exportação exige
 * `administracao:exportar` e deixa o próprio rastro.
 *
 * Os eventos de paginação são semeados pelo fixture numa entidade inventada
 * para este arquivo, e o recorte é sempre filtrado por ela — o resto da
 * trilha (que no projeto dev na nuvem só cresce) não interfere na contagem.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.10" }),
}));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const SENHA = "portal3e2026";
const ENTIDADE = `teste_trilha_${Date.now()}`;
const SEMEADOS = POR_PAGINA + 1;

const PERSONAS = {
  adminGeral: "admin_geral@3e.com.br",
  suporte: "suporte_auditoria@3e.com.br",
  rhDp: "rh_dp@3e.com.br",
} as const;

let admin: SupabaseClient<Database>;
const clientes = new Map<string, SupabaseClient<Database>>();

/** Liga o módulo pedido à persona, com a memoização de sessão zerada. */
async function como<T>(email: string, modulo: () => Promise<T>): Promise<T> {
  estado.cliente = clientes.get(email);
  vi.resetModules();
  return modulo();
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "Credenciais do Supabase ausentes. Este teste precisa do banco: veja a seção Testes do CLAUDE.md.",
    );
  }
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  // Um login por persona para o arquivo inteiro (limite de sign-in do Auth).
  for (const email of Object.values(PERSONAS)) {
    const cliente = createClient<Database>(url, anon, { auth: { persistSession: false } });
    const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA });
    if (error) throw new Error(`não foi possível autenticar ${email}: ${error.message}`);
    clientes.set(email, cliente);
  }

  // Instantes distintos, um por segundo, para a ordem ser verificável.
  const base = Date.now() - SEMEADOS * 1_000;
  const { error } = await admin.from("auditoria").insert(
    Array.from({ length: SEMEADOS }, (_, i) => ({
      org_id: ORG,
      acao: "teste",
      entidade: ENTIDADE,
      criado_em: new Date(base + i * 1_000).toISOString(),
      detalhes: { ordem: i },
    })),
  );
  if (error) throw new Error(`fixture: ${error.message}`);
}, 30_000);

afterAll(async () => {
  if (!admin) return;
  await admin.from("auditoria").delete().eq("entidade", ENTIDADE);
  // O rastro das exportações feitas por este arquivo.
  await admin
    .from("auditoria")
    .delete()
    .eq("acao", "exportar")
    .eq("detalhes->filtros->>entidade", ENTIDADE);
});

describe("listagem", () => {
  it("pagina de 100 em 100, do mais recente para o mais antigo, sem perder linha", async () => {
    const { listarAuditoria } = await como(PERSONAS.adminGeral, () => import("./queries"));

    const primeira = await listarAuditoria(lerFiltros({ entidade: ENTIDADE }));
    const segunda = await listarAuditoria(lerFiltros({ entidade: ENTIDADE, pagina: "2" }));

    expect(primeira.total).toBe(SEMEADOS);
    expect(primeira.eventos).toHaveLength(POR_PAGINA);
    expect(segunda.eventos).toHaveLength(1);

    const ordens = [...primeira.eventos, ...segunda.eventos].map(
      (e) => (e.detalhes as { ordem: number }).ordem,
    );
    expect(ordens).toEqual(Array.from({ length: SEMEADOS }, (_, i) => SEMEADOS - 1 - i));
  });

  it("página além da última devolve o total, para a tela redirecionar", async () => {
    const { listarAuditoria } = await como(PERSONAS.adminGeral, () => import("./queries"));

    const r = await listarAuditoria(lerFiltros({ entidade: ENTIDADE, pagina: "9" }));
    expect(r).toEqual({ eventos: [], total: SEMEADOS });
  });

  it("Suporte/Auditoria lê a trilha (tem administracao:ver)", async () => {
    const { listarAuditoria } = await como(PERSONAS.suporte, () => import("./queries"));

    const r = await listarAuditoria(lerFiltros({ entidade: ENTIDADE }));
    expect(r.total).toBe(SEMEADOS);
  });

  it("RH/DP não lê nada, nem as opções de filtro — é a RLS que corta", async () => {
    const { listarAuditoria, opcoesDeFiltro } = await como(PERSONAS.rhDp, () =>
      import("./queries"),
    );

    const r = await listarAuditoria(lerFiltros({ entidade: ENTIDADE }));
    expect(r.total).toBe(0);

    const opcoes = await opcoesDeFiltro();
    expect(opcoes.acoes).toEqual([]);
    expect(opcoes.entidades).toEqual([]);
  });

  it("as opções de filtro vêm do que existe na tabela", async () => {
    const { opcoesDeFiltro } = await como(PERSONAS.adminGeral, () => import("./queries"));

    const opcoes = await opcoesDeFiltro();
    expect(opcoes.entidades).toContain(ENTIDADE);
    expect(opcoes.acoes).toContain("teste");
  });
});

describe("exportação", () => {
  const url = `http://localhost/api/auditoria/exportar?entidade=${ENTIDADE}`;

  it("Suporte/Auditoria não exporta: a matriz não lhe dá administracao:exportar", async () => {
    const { GET } = await como(PERSONAS.suporte, () => import("@/app/api/auditoria/exportar/route"));

    const resposta = await GET(new Request(url));
    expect(resposta.status).toBe(403);
  });

  it("Admin geral recebe o CSV do recorte, e a exportação fica na trilha", async () => {
    const { GET } = await como(PERSONAS.adminGeral, () =>
      import("@/app/api/auditoria/exportar/route"),
    );

    const resposta = await GET(new Request(url));
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toContain("text/csv");

    const csv = await resposta.text();
    const linhas = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(linhas).toHaveLength(SEMEADOS + 1); // + cabeçalho

    const { data: rastro } = await admin
      .from("auditoria")
      .select("acao, usuario_id, detalhes")
      .eq("acao", "exportar")
      .eq("detalhes->filtros->>entidade", ENTIDADE);

    expect(rastro).toHaveLength(1);
    expect(rastro![0]).toMatchObject({
      usuario_id: "460759de-e5a3-5bf7-92ad-41ca4ac4f9a6",
      detalhes: { linhas: SEMEADOS },
    });
  });
});
