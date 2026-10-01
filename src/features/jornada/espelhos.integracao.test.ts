import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { apagarAuditoriaDoArquivo, marcarAuditoria } from "../../../tests/rls/apoio";

/**
 * Publicação de espelhos em lote (F4.1), pelas Server Actions reais, contra
 * o banco real.
 *
 * - a análise casa por CPF no nome e devolve não casados com motivo;
 * - publicar refaz o casamento no servidor, cria um espelho por pessoa com
 *   competência e prazo, e notifica;
 * - republicar o mesmo lote não duplica (já publicado);
 * - arquivo que não é PDF é recusado sem derrubar o resto do lote;
 * - só quem tem `jornada:criar` publica, e só quem tem `jornada:editar`
 *   muda a regra.
 *
 * Competência em 2031 para não cruzar com nada; tudo sai no afterAll, e a
 * regra da organização volta exatamente como estava.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.61" }),
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
const EMAILS = { rhDp: "rh_dp@3e.com.br", contratos: "contratos@3e.com.br" } as const;
const MARIA = { pessoaId: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c", usuarioId: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2" };
const JOAO = "8605334e-658a-5360-a78a-79e3ff3736e8";
const COMPETENCIA = "2031-08";
const REGRA = { expressao: "(\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2})", campo: "cpf" as const };

let admin: Cliente;
/** Maior id de `auditoria` antes do arquivo; `null` até o beforeAll marcar. */
let marcaAuditoria: number | null = null;
const IP_DO_ARQUIVO = "203.0.113.61";
const clientes = new Map<string, Cliente>();
/** `undefined` até o beforeAll ler; `null` = não havia regra. */
let regraOriginal: { expressao: string; campo: string } | null | undefined = undefined;

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

async function actionsComo(email: string) {
  let cliente = clientes.get(email);
  if (!cliente) {
    const { url, anon } = ambiente();
    cliente = createClient<Database>(url, anon, { auth: { persistSession: false } });
    const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA });
    if (error) throw new Error(`não foi possível autenticar ${email}: ${error.message}`);
    clientes.set(email, cliente);
  }
  estado.cliente = cliente;
  vi.resetModules();
  return import("./actions");
}

const pdf = (nome: string) =>
  new File([`%PDF-1.4\n% espelho ${nome} ${crypto.randomUUID()}\n%%EOF\n`], nome, { type: "application/pdf" });

function lote(arquivos: File[], extra: Record<string, unknown> = {}): FormData {
  const f = new FormData();
  f.append("dados", JSON.stringify({ ...REGRA, competencia: COMPETENCIA, contrato_id: null, prazo_ciencia: "", ...extra }));
  for (const a of arquivos) f.append("arquivos", a, a.name);
  return f;
}

async function espelhosDaCompetencia() {
  const { data } = await admin
    .from("documentos")
    .select("id, pessoa_id, status, competencia, prazo_ciencia, titulo, arquivo_path, documento_tipos(chave)")
    .eq("org_id", ORG)
    .eq("competencia", `${COMPETENCIA}-01`);
  return data ?? [];
}

function hojeMais(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });
  marcaAuditoria = await marcarAuditoria(admin);
  const { data, error } = await admin.from("regras_espelho").select("expressao, campo").eq("org_id", ORG).maybeSingle();
  if (error) throw new Error(`migração 0019 ausente no alvo de teste: ${error.message}`);
  regraOriginal = data;
  if ((await espelhosDaCompetencia()).length) {
    throw new Error(`já existe documento na competência ${COMPETENCIA}: sobra de execução anterior — limpe antes.`);
  }
}, 30_000);

afterAll(async () => {
  if (!admin) return;
  await apagarAuditoriaDoArquivo(admin, marcaAuditoria, IP_DO_ARQUIVO);
  const docs = await espelhosDaCompetencia();
  const ids = docs.map((d) => d.id);
  if (ids.length) {
    await admin.from("notificacoes").delete().in("referencia_id", ids);
    await admin.from("auditoria").delete().in("entidade_id", ids);
    await admin.from("documentos").delete().in("id", ids);
    await admin.storage.from("documentos").remove(docs.map((d) => d.arquivo_path));
  }
  // A regra volta exatamente como estava. `undefined` = a leitura nem chegou a
  // acontecer: não há o que devolver, e apagar seria destruir a regra da org.
  if (regraOriginal === undefined) return;
  if (regraOriginal) {
    const { error } = await admin.from("regras_espelho").update(regraOriginal).eq("org_id", ORG);
    if (error) throw new Error(`devolver a regra de espelho: ${error.message}`);
  } else {
    // Não havia regra antes: só a que o teste criou sai.
    await admin.from("regras_espelho").delete().eq("org_id", ORG);
  }
}, 30_000);

describe("análise", () => {
  it("casa por CPF no nome e explica o que não casou", async () => {
    const { analisarLoteEspelhos } = await actionsComo(EMAILS.rhDp);
    const r = await analisarLoteEspelhos({
      ...REGRA,
      competencia: COMPETENCIA,
      contrato_id: null,
      nomes: ["ago/010.007.919-98_espelho.pdf", "espelho_01001583825.pdf", "sem-cpf.pdf", "99999999999.pdf"],
    });
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    if (!r.ok) return;
    expect(r.dados.casados.map((c) => c.pessoaId).sort()).toEqual([MARIA.pessoaId, JOAO].sort());
    expect(r.dados.naoCasados.map((n) => [n.arquivo, n.motivo])).toEqual([
      ["sem-cpf.pdf", "sem_chave"],
      ["99999999999.pdf", "sem_pessoa"],
    ]);
    expect(r.dados.semEspelho.length).toBeGreaterThan(0);
    expect(r.dados.semEspelho.map((p) => p.id)).not.toContain(MARIA.pessoaId);
    // Só id e nome vão para a tela.
    expect(Object.keys(r.dados.semEspelho[0]).sort()).toEqual(["id", "nome"]);
  });

  it("expressão inválida volta como mensagem, não como erro cru", async () => {
    const { analisarLoteEspelhos } = await actionsComo(EMAILS.rhDp);
    const r = await analisarLoteEspelhos({
      expressao: "(\\d{11}",
      campo: "cpf",
      competencia: COMPETENCIA,
      nomes: ["x.pdf"],
    });
    expect(r).toEqual({ ok: false, erro: "A expressão não é válida. Confira parênteses e barras." });
  });

  it("Contratos/Coordenação (jornada só V R) não analisa nem publica", async () => {
    const { analisarLoteEspelhos, publicarLoteEspelhos } = await actionsComo(EMAILS.contratos);
    expect(
      await analisarLoteEspelhos({ ...REGRA, competencia: COMPETENCIA, nomes: ["01000791998.pdf"] }),
    ).toMatchObject({ ok: false });
    expect(await publicarLoteEspelhos(lote([pdf("01000791998.pdf")]))).toMatchObject({ ok: false });
    expect(await espelhosDaCompetencia()).toEqual([]);
  });
});

describe("publicação", () => {
  it("publica um espelho por pessoa casada, com competência, título e prazo padrão", async () => {
    const { publicarLoteEspelhos } = await actionsComo(EMAILS.rhDp);
    // CPF de uma pessoa do seed: casa — e é o conteúdo que o derruba.
    const naoPdf = new File(["isto não é pdf"], "010.023.757-62_falso.pdf", { type: "application/pdf" });
    const r = await publicarLoteEspelhos(
      lote([pdf("010.007.919-98.pdf"), pdf("espelho_01001583825.pdf"), pdf("sem-cpf.pdf"), naoPdf]),
    );
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    if (!r.ok) return;

    expect(r.dados.publicados.map((p) => p.arquivo).sort()).toEqual(
      ["010.007.919-98.pdf", "espelho_01001583825.pdf"].sort(),
    );
    const recusados = Object.fromEntries(r.dados.recusados.map((x) => [x.arquivo, x.motivo]));
    expect(recusados["sem-cpf.pdf"]).toMatch(/não tem CPF/);
    expect(recusados["010.023.757-62_falso.pdf"]).toMatch(/não é um PDF/);

    const docs = await espelhosDaCompetencia();
    expect(docs).toHaveLength(2);
    for (const d of docs) {
      expect(d).toMatchObject({
        status: "publicado",
        competencia: `${COMPETENCIA}-01`,
        prazo_ciencia: hojeMais(5),
        titulo: "Espelho de ponto — 08/2031",
        documento_tipos: { chave: "espelho_ponto" },
      });
    }
    expect(docs.map((d) => d.pessoa_id).sort()).toEqual([MARIA.pessoaId, JOAO].sort());
  });

  it("a Maria recebe o aviso do espelho dela", async () => {
    const [daMaria] = (await espelhosDaCompetencia()).filter((d) => d.pessoa_id === MARIA.pessoaId);
    const { data } = await admin
      .from("notificacoes")
      .select("usuario_id, canal")
      .eq("referencia_id", daMaria.id)
      .eq("canal", "portal");
    expect(data).toEqual([{ usuario_id: MARIA.usuarioId, canal: "portal" }]);
  });

  it("republicar o mesmo lote não duplica: vira 'já publicado'", async () => {
    const { publicarLoteEspelhos } = await actionsComo(EMAILS.rhDp);
    const r = await publicarLoteEspelhos(lote([pdf("010.007.919-98.pdf")]));
    expect(r).toMatchObject({ ok: true, dados: { publicados: [] } });
    if (r.ok) expect(r.dados.recusados[0].motivo).toMatch(/já tem espelho publicado/);
    expect(await espelhosDaCompetencia()).toHaveLength(2);
  });
});

describe("regra da organização", () => {
  it("RH/DP (jornada E) salva a regra; Contratos (sem E) não", async () => {
    const rh = await actionsComo(EMAILS.rhDp);
    expect(await rh.salvarRegraEspelho({ expressao: "^ESP_(\\d+)_", campo: "matricula" })).toEqual({ ok: true });
    const { data } = await admin.from("regras_espelho").select("expressao, campo").eq("org_id", ORG).single();
    expect(data).toEqual({ expressao: "^ESP_(\\d+)_", campo: "matricula" });

    const contratos = await actionsComo(EMAILS.contratos);
    expect(await contratos.salvarRegraEspelho({ expressao: "(x)", campo: "cpf" })).toMatchObject({ ok: false });
    const { data: depois } = await admin.from("regras_espelho").select("expressao").eq("org_id", ORG).single();
    expect(depois?.expressao).toBe("^ESP_(\\d+)_");
  });
});
