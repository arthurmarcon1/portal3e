import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Download seguro (F3.2), pela rota de verdade, contra o banco de verdade.
 *
 * Critérios da Fase 3 que moram aqui: **o hash bate com o arquivo** (o que
 * sai do Storage é o que foi publicado) e **download de documento sensível
 * aparece na auditoria com IP**. E os passos de docs/03: a RLS decide (404
 * para quem não vê, sempre com um contraponto que vê o mesmo documento),
 * 2FA devolve 428 sem entregar nada, rascunho não sai por aqui.
 *
 * Os documentos são de fixture (`service_role`), com arquivo real no bucket:
 * o que se testa é a entrega, não a publicação — essa está em
 * `publicacao.integracao.test.ts`.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "198.51.100.23", "user-agent": "teste-f32" }),
}));

type Cliente = SupabaseClient<Database>;

const SENHA = "portal3e2026";
const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const MARIA = "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c";
const EMAILS = {
  maria: "01000791998@func.3e.portal3e",
  rhDp: "rh_dp@3e.com.br",
  fiscal: "fiscal@hsaolucas.com.br",
} as const;
const TIPOS = {
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2",
  aso: "a5ea6ce3-223a-5b48-b69c-9be2c7bcc720",
  holerite: "485e0b90-d471-5f86-ac73-b942a9d8759e",
} as const;

let admin: Cliente;
const clientes = new Map<string, Cliente>();
const criados: { id: string; caminho: string }[] = [];
const docs = {} as Record<"comunicado" | "aso" | "holerite" | "rascunho" | "arquivado", string>;
const hashes = {} as Record<string, string>;

function ambiente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "Credenciais do Supabase ausentes. Este teste precisa do banco: rode `npm test` " +
        "(ver a seção Testes do CLAUDE.md).",
    );
  }
  return { url, anon, service };
}

async function como(email: string): Promise<Cliente> {
  const existente = clientes.get(email);
  if (existente) return existente;
  const { url, anon } = ambiente();
  const cliente = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw new Error(`não foi possível autenticar ${email}: ${error.message}`);
  clientes.set(email, cliente);
  return cliente;
}

/** Chama a rota como a persona (ou sem sessão), com o `cache()` zerado. */
async function baixar(persona: keyof typeof EMAILS | null, id: string, query = "") {
  if (persona) {
    estado.cliente = await como(EMAILS[persona]);
  } else {
    const { url, anon } = ambiente();
    estado.cliente = createClient<Database>(url, anon, { auth: { persistSession: false } });
  }
  vi.resetModules();
  const { GET } = await import("@/app/api/documentos/[id]/download/route");
  return GET(new Request(`http://portal.teste/api/documentos/${id}/download${query}`), {
    params: Promise.resolve({ id }),
  });
}

async function fixture(
  chave: keyof typeof docs,
  tipoId: string,
  status: "publicado" | "rascunho" | "arquivado",
) {
  const id = crypto.randomUUID();
  const caminho = `${ORG}/teste-f32/${id}.pdf`;
  const conteudo = new TextEncoder().encode(`%PDF-1.4\n% F3.2 ${chave} ${id}\n%%EOF\n`);
  hashes[chave] = createHash("sha256").update(conteudo).digest("hex");

  const upload = await admin.storage
    .from("documentos")
    .upload(caminho, conteudo, { contentType: "application/pdf" });
  if (upload.error) throw new Error(`fixture upload ${chave}: ${upload.error.message}`);
  criados.push({ id, caminho });

  const { error } = await admin.from("documentos").insert({
    id,
    org_id: ORG,
    tipo_id: tipoId,
    escopo: "individual",
    pessoa_id: MARIA,
    titulo: `F3.2 ${chave} da Maria`,
    arquivo_path: caminho,
    arquivo_hash: hashes[chave],
    arquivo_bytes: conteudo.byteLength,
    status,
    publicado_em: status === "rascunho" ? null : new Date().toISOString(),
  });
  if (error) throw new Error(`fixture ${chave}: ${error.message}`);
  docs[chave] = id;
}

async function eventos(id: string) {
  const { data } = await admin
    .from("auditoria")
    .select("acao, ip, user_agent, usuario_id, detalhes")
    .eq("entidade", "documentos")
    .eq("entidade_id", id)
    .order("id");
  return data ?? [];
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  await fixture("comunicado", TIPOS.comunicado, "publicado");
  await fixture("aso", TIPOS.aso, "publicado");
  await fixture("holerite", TIPOS.holerite, "publicado");
  await fixture("rascunho", TIPOS.comunicado, "rascunho");
  await fixture("arquivado", TIPOS.comunicado, "arquivado");
}, 60_000);

afterAll(async () => {
  if (!admin || criados.length === 0) return;
  const ids = criados.map((c) => c.id);
  await admin.from("auditoria").delete().in("entidade_id", ids);
  await admin.from("documentos").delete().in("id", ids);
  await admin.storage.from("documentos").remove(criados.map((c) => c.caminho));
}, 30_000);

describe("entrega do arquivo", () => {
  it("a titular recebe um redirect para URL assinada, e o arquivo é o publicado: o hash bate", async () => {
    const r = await baixar("maria", docs.comunicado);
    expect(r.status).toBe(302);
    const destino = r.headers.get("location")!;
    expect(destino).toMatch(/\/storage\/v1\/object\/sign\/documentos\//);

    const arquivo = await fetch(destino);
    expect(arquivo.status).toBe(200);
    const recebido = new Uint8Array(await arquivo.arrayBuffer());
    expect(createHash("sha256").update(recebido).digest("hex")).toBe(hashes.comunicado);
  });

  it("sem `baixar`, o acesso é registrado como visualização, com IP e user-agent", async () => {
    const [evento] = (await eventos(docs.comunicado)).filter((e) => e.acao === "ver");
    expect(evento).toMatchObject({
      acao: "ver",
      ip: "198.51.100.23",
      user_agent: "teste-f32",
      usuario_id: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2",
    });
  });

  it("`?baixar=1` força o download com o título como nome, e registra `download`", async () => {
    const r = await baixar("maria", docs.comunicado, "?baixar=1");
    expect(r.status).toBe(302);
    const arquivo = await fetch(r.headers.get("location")!);
    expect(arquivo.headers.get("content-disposition")).toMatch(
      /attachment; filename="?F3\.2-comunicado-da-Maria\.pdf/,
    );
    expect((await eventos(docs.comunicado)).map((e) => e.acao)).toContain("download");
  });

  it("a URL assinada vence: TTL de 60 segundos", async () => {
    const r = await baixar("maria", docs.comunicado);
    const token = new URL(r.headers.get("location")!).searchParams.get("token")!;
    const { exp, iat } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(exp - iat).toBe(60);
  });
});

describe("a RLS decide quem recebe", () => {
  it("contratante não recebe documento médico de quem está no escopo dele: 404", async () => {
    const r = await baixar("fiscal", docs.aso);
    expect(r.status).toBe(404);
    // Nada entregue, nada registrado em nome do fiscal.
    const doFiscal = (await eventos(docs.aso)).filter(
      (e) => e.usuario_id === "4a2ade92-25e1-58f2-afda-9198dd3da8df",
    );
    expect(doFiscal).toEqual([]);
  });

  it("contraponto: a titular recebe o próprio ASO, qualquer categoria", async () => {
    expect((await baixar("maria", docs.aso)).status).toBe(302);
  });

  it("download de documento sensível aparece na auditoria com IP (critério da Fase 3)", async () => {
    const r = await baixar("rhDp", docs.aso, "?baixar=1");
    expect(r.status).toBe(302);
    const download = (await eventos(docs.aso)).find(
      (e) => e.acao === "download" && e.usuario_id === "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3",
    );
    expect(download).toMatchObject({ ip: "198.51.100.23", detalhes: { categoria: "medico" } });
  });

  it("sem sessão: 401, e nada é entregue", async () => {
    const r = await baixar(null, docs.comunicado);
    expect(r.status).toBe(401);
    expect(r.headers.get("location")).toBeNull();
  });

  it("id que não é uuid: 404 sem consultar", async () => {
    estado.cliente = await como(EMAILS.maria);
    vi.resetModules();
    const { GET } = await import("@/app/api/documentos/[id]/download/route");
    const r = await GET(new Request("http://portal.teste/x"), {
      params: Promise.resolve({ id: "../../etc" }),
    });
    expect(r.status).toBe(404);
  });
});

describe("estados e verificação", () => {
  it("tipo com código de uso único devolve 428 e não entrega nem registra", async () => {
    const r = await baixar("maria", docs.holerite);
    expect(r.status).toBe(428);
    expect(r.headers.get("location")).toBeNull();
    expect(await eventos(docs.holerite)).toEqual([]);
  });

  it("rascunho não sai por aqui, nem para quem edita: 404", async () => {
    expect((await baixar("rhDp", docs.rascunho)).status).toBe(404);
  });

  it("arquivado continua saindo para a titular — é a prova do que ela respondeu (0016)", async () => {
    expect((await baixar("maria", docs.arquivado)).status).toBe(302);
  });
});
