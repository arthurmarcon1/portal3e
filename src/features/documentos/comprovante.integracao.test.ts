import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Comprovante em PDF (F3.5), pela rota de verdade, contra o banco de verdade.
 *
 * Critério da Fase 3 que mora aqui: **o comprovante abre e o hash bate com o
 * arquivo** — o hash impresso é o sha256 do arquivo que a rota de download
 * (F3.2) entrega. E a RLS decide quem gera: a titular sempre; terceiro só
 * com a categoria do documento (0016), com contraponto que gera o mesmo
 * comprovante.
 *
 * A ciência é gravada pela Server Action real, como a Maria — desde a 0018
 * é o único caminho.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.77", "user-agent": "teste-f35" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

type Cliente = SupabaseClient<Database>;

const SENHA = "portal3e2026";
const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const MARIA = "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c";
const EMAILS = {
  maria: "01000791998@func.3e.portal3e",
  rhDp: "rh_dp@3e.com.br",
  suporte: "suporte_auditoria@3e.com.br",
  fiscal: "fiscal@hsaolucas.com.br",
} as const;
const TIPOS = {
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2",
  aso: "a5ea6ce3-223a-5b48-b69c-9be2c7bcc720",
} as const;

let admin: Cliente;
const clientes = new Map<string, Cliente>();
const documentos: { id: string; caminho: string }[] = [];
let comunicado: { documento: string; ciencia: string; protocolo: string };
let aso: { documento: string; ciencia: string };

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

/** Liga os módulos à persona (ou a ninguém), com o `cache()` da sessão zerado. */
async function persona(email: keyof typeof EMAILS | null) {
  if (email) {
    estado.cliente = await como(EMAILS[email]);
  } else {
    const { url, anon } = ambiente();
    estado.cliente = createClient<Database>(url, anon, { auth: { persistSession: false } });
  }
  vi.resetModules();
}

async function comprovante(email: keyof typeof EMAILS | null, cienciaId: string) {
  await persona(email);
  const { GET } = await import("@/app/api/ciencias/[id]/comprovante/route");
  return GET(new Request(`http://portal.teste/api/ciencias/${cienciaId}/comprovante`), {
    params: Promise.resolve({ id: cienciaId }),
  });
}

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

/** Documento publicado para a Maria, com PDF de verdade no bucket. */
async function documento(tipoId: string, titulo: string): Promise<string> {
  const id = crypto.randomUUID();
  const caminho = `${ORG}/teste-f35/${id}.pdf`;
  const conteudo = new TextEncoder().encode(`%PDF-1.4\n% F3.5 ${titulo} ${id}\n%%EOF\n`);
  const up = await admin.storage.from("documentos").upload(caminho, conteudo, { contentType: "application/pdf" });
  if (up.error) throw new Error(`fixture upload: ${up.error.message}`);
  documentos.push({ id, caminho });
  const { error } = await admin.from("documentos").insert({
    id,
    org_id: ORG,
    tipo_id: tipoId,
    escopo: "individual",
    pessoa_id: MARIA,
    titulo,
    arquivo_path: caminho,
    arquivo_hash: createHash("sha256").update(conteudo).digest("hex"),
    arquivo_bytes: conteudo.byteLength,
    status: "publicado",
    publicado_em: new Date().toISOString(),
    prazo_ciencia: "2099-12-31",
  });
  if (error) throw new Error(`fixture ${titulo}: ${error.message}`);
  return id;
}

/** A Maria responde pela Server Action; devolve o id e o protocolo da ciência. */
async function mariaResponde(documentoId: string, tipo: "confirmacao" | "divergencia", justificativa?: string) {
  await persona("maria");
  const { registrarCiencia } = await import("./ciencia");
  const f = new FormData();
  f.set("documento_id", documentoId);
  f.set("tipo", tipo);
  if (justificativa) f.set("justificativa", justificativa);
  const r = await registrarCiencia(f);
  if (!r.ok) throw new Error(`ciência: ${r.erro}`);
  const { data } = await admin.from("ciencias").select("id").eq("documento_id", documentoId).single();
  return { ciencia: data!.id, protocolo: r.dados.protocolo };
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  const doc = await documento(TIPOS.comunicado, "F3.5 comunicado de outubro");
  comunicado = { documento: doc, ...(await mariaResponde(doc, "confirmacao")) };

  const docAso = await documento(TIPOS.aso, "F3.5 ASO periódico");
  aso = {
    documento: docAso,
    ...(await mariaResponde(docAso, "divergencia", "O exame de audiometria listado não foi feito por mim.")),
  };
}, 60_000);

afterAll(async () => {
  if (!admin || documentos.length === 0) return;
  const ids = documentos.map((d) => d.id);
  const { data: ciencias } = await admin.from("ciencias").select("id").in("documento_id", ids);
  const cienciaIds = (ciencias ?? []).map((c) => c.id);
  await admin.from("solicitacoes").delete().in("documento_id", ids);
  await admin.from("ciencias").delete().in("documento_id", ids);
  if (cienciaIds.length) await admin.from("auditoria").delete().in("entidade_id", cienciaIds);
  await admin.from("auditoria").delete().in("entidade_id", ids);
  await admin.from("documentos").delete().in("id", ids);
  await admin.storage.from("documentos").remove(documentos.map((d) => d.caminho));
}, 30_000);

describe("o comprovante", () => {
  it("abre, e o hash impresso bate com o arquivo que a rota de download entrega (critério da Fase 3)", async () => {
    // O arquivo, pelo caminho do funcionário (F3.2).
    await persona("maria");
    const { GET: baixar } = await import("@/app/api/documentos/[id]/download/route");
    const r = await baixar(new Request("http://portal.teste/x"), {
      params: Promise.resolve({ id: comunicado.documento }),
    });
    const arquivo = new Uint8Array(await (await fetch(r.headers.get("location")!)).arrayBuffer());
    const hashDoArquivo = createHash("sha256").update(arquivo).digest("hex");

    const resposta = await comprovante("maria", comunicado.ciencia);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toBe("application/pdf");
    expect(resposta.headers.get("cache-control")).toBe("private, no-store");
    expect(resposta.headers.get("content-disposition")).toBe(
      `attachment; filename="comprovante-${comunicado.protocolo}.pdf"`,
    );

    const texto = await textoDoPdf(new Uint8Array(await resposta.arrayBuffer()));
    expect(texto.replace(/\s/g, "")).toContain(hashDoArquivo);
    expect(texto).toContain(comunicado.protocolo);
    expect(texto).toContain("Maria Aparecida Ferreira");
    expect(texto).toContain("***.007.919-**");
    expect(texto).not.toContain("01000791998");
    expect(texto).toContain("F3.5 comunicado de outubro");
    expect(texto).toContain("Ciência confirmada");
    expect(texto).toMatch(/CNPJ \d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  });

  it("a geração fica na auditoria, com IP", async () => {
    const { data } = await admin
      .from("auditoria")
      .select("acao, entidade, ip, detalhes")
      .eq("entidade", "ciencias")
      .eq("entidade_id", comunicado.ciencia)
      // A mesma ciência também tem o evento `ciencia`, de quando foi gravada.
      .eq("acao", "download");
    expect(data).toEqual([
      {
        acao: "download",
        entidade: "ciencias",
        ip: "198.51.100.77",
        detalhes: { comprovante: true, protocolo: comunicado.protocolo },
      },
    ]);
  });

  it("divergência sai com a justificativa", async () => {
    const texto = await textoDoPdf(new Uint8Array(await (await comprovante("maria", aso.ciencia)).arrayBuffer()));
    expect(texto).toContain("Comprovante de divergência");
    expect(texto).toContain("audiometria");
  });
});

describe("quem gera", () => {
  it("Suporte/Auditoria (sem a categoria médico) não gera o comprovante do ASO: 404", async () => {
    expect((await comprovante("suporte", aso.ciencia)).status).toBe(404);
  });

  it("contratante também não: 404", async () => {
    expect((await comprovante("fiscal", aso.ciencia)).status).toBe(404);
  });

  it("contraponto: RH/DP (tem médico) gera o mesmo comprovante", async () => {
    expect((await comprovante("rhDp", aso.ciencia)).status).toBe(200);
  });

  it("contraponto: Suporte gera o do comunicado, que é categoria aberta", async () => {
    expect((await comprovante("suporte", comunicado.ciencia)).status).toBe(200);
  });

  it("sem sessão: 401, e nenhum PDF", async () => {
    const r = await comprovante(null, comunicado.ciencia);
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).not.toBe("application/pdf");
  });

  it("id que não é uuid: 404", async () => {
    expect((await comprovante("maria", "../../etc")).status).toBe(404);
  });
});
