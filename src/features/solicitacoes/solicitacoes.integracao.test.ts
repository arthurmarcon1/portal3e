import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Solicitações (F4.2), pelas Server Actions reais e pela RLS da 0020.
 *
 * - SLA: o prazo sai do banco (hoje + N dias úteis) e quem abre não o escolhe;
 * - quem abre o quê: funcionário só os tipos dele e só para si; contratante
 *   só ocorrência/substituição e só no escopo;
 * - linha do tempo: o evento de status é UM por mudança (trigger), e ninguém
 *   forja evento, apaga ou edita;
 * - transições inválidas e solicitação encerrada recusadas pelo banco;
 * - nota interna invisível ao solicitante; resposta do solicitante volta para
 *   análise;
 * - anexo sai só pela rota, e só para quem vê a solicitação.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.88", "user-agent": "teste-f42" }),
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
const EMAILS = {
  maria: "01000791998@func.3e.portal3e",
  rhDp: "rh_dp@3e.com.br",
  suporte: "suporte_auditoria@3e.com.br",
  fiscal: "fiscal@hsaolucas.com.br",
} as const;
const MARIA = { usuarioId: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2", pessoaId: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c" };
const RH = "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3";
const C042 = "d594b950-e556-5f78-ae9b-98f6b1d12b63";
const C077 = "e716f5c1-3603-596b-a331-1d307ccf82f3";

let admin: Cliente;
const clientes = new Map<string, Cliente>();
const criadas = new Set<string>();

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

async function actionsComo(email: string) {
  estado.cliente = await como(email);
  vi.resetModules();
  return import("./actions");
}

/** Hoje (Brasília) + N dias úteis — calculado aqui, à parte do banco. */
function diasUteis(n: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  let faltam = n;
  while (faltam > 0) {
    data.setUTCDate(data.getUTCDate() + 1);
    const dia = data.getUTCDay();
    if (dia !== 0 && dia !== 6) faltam--;
  }
  return data.toISOString().slice(0, 10);
}

function formulario(campos: Record<string, string | Blob>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function eventos(id: string) {
  const { data } = await admin
    .from("solicitacao_eventos")
    .select("tipo, status_anterior, status_novo, interno, usuario_id, conteudo")
    .eq("solicitacao_id", id)
    .order("criado_em");
  return data ?? [];
}

async function abrirComoMaria(tipo = "ferias", descricao = "Quero férias de 10 a 24 de novembro.") {
  const { abrirSolicitacao } = await actionsComo(EMAILS.maria);
  const r = await abrirSolicitacao(formulario({ tipo, descricao }));
  if (!r.ok) throw new Error(`abrir: ${r.erro}`);
  criadas.add(r.dados.id);
  return r.dados.id;
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });
  const { error } = await admin.from("sla_solicitacoes").select("tipo").limit(1);
  if (error) throw new Error(`migração 0020 ausente no alvo de teste: ${error.message}`);
}, 30_000);

afterAll(async () => {
  if (!admin || criadas.size === 0) return;
  const ids = [...criadas];
  const { data: anexos } = await admin.from("anexos").select("id, arquivo_path").in("solicitacao_id", ids);
  if (anexos?.length) {
    await admin.storage.from("anexos").remove(anexos.map((a) => a.arquivo_path));
    await admin.from("auditoria").delete().in("entidade_id", anexos.map((a) => a.id));
  }
  await admin.from("auditoria").delete().in("entidade_id", ids);
  await admin.from("solicitacoes").delete().in("id", ids);
}, 30_000);

describe("abrir", () => {
  it("funcionário abre férias: nasce aberta, sem responsável, sem contrato, com prazo do SLA (5 dias úteis)", async () => {
    const id = await abrirComoMaria();
    const { data } = await admin
      .from("solicitacoes")
      .select("status, responsavel_id, contrato_id, pessoa_id, aberta_por, prazo, titulo")
      .eq("id", id)
      .single();
    expect(data).toEqual({
      status: "aberta",
      responsavel_id: null,
      contrato_id: null,
      pessoa_id: MARIA.pessoaId,
      aberta_por: MARIA.usuarioId,
      prazo: diasUteis(5),
      titulo: "Férias",
    });
  });

  it("quem abre não escolhe prazo, situação nem responsável — o banco sobrescreve", async () => {
    const maria = await como(EMAILS.maria);
    const { data, error } = await maria
      .from("solicitacoes")
      .insert({
        org_id: ORG,
        tipo: "correcao_ponto",
        titulo: "direto",
        pessoa_id: MARIA.pessoaId,
        aberta_por: MARIA.usuarioId,
        status: "concluida",
        prazo: "2099-01-01",
        responsavel_id: RH,
      })
      .select("id, status, prazo, responsavel_id")
      .single();
    expect(error).toBeNull();
    criadas.add(data!.id);
    expect(data).toMatchObject({ status: "aberta", prazo: diasUteis(3), responsavel_id: null });
  });

  it("funcionário não abre ocorrência (tipo do contratante): nem pela action, nem direto", async () => {
    const { abrirSolicitacao } = await actionsComo(EMAILS.maria);
    expect(await abrirSolicitacao(formulario({ tipo: "ocorrencia", descricao: "tentando abrir ocorrência" }))).toMatchObject({ ok: false });
    const maria = await como(EMAILS.maria);
    const { error } = await maria.from("solicitacoes").insert({
      org_id: ORG,
      tipo: "ocorrencia",
      titulo: "direto",
      pessoa_id: MARIA.pessoaId,
      aberta_por: MARIA.usuarioId,
    });
    expect(error?.code).toBe("42501");
  });

  it("contratante abre ocorrência no contrato do escopo, e não em contrato de outro cliente", async () => {
    const { abrirSolicitacao } = await actionsComo(EMAILS.fiscal);
    const ok = await abrirSolicitacao(
      formulario({ tipo: "ocorrencia", contrato_id: C042, titulo: "Posto descoberto", descricao: "Portaria B sem vigia às 7h." }),
    );
    expect(ok.ok, ok.ok ? "" : ok.erro).toBe(true);
    if (ok.ok) criadas.add(ok.dados.id);

    const fora = await abrirSolicitacao(
      formulario({ tipo: "ocorrencia", contrato_id: C077, titulo: "Outro cliente", descricao: "Não devia conseguir abrir." }),
    );
    expect(fora.ok).toBe(false);
    const { data } = await admin.from("solicitacoes").select("id").eq("contrato_id", C077).eq("titulo", "Outro cliente");
    expect(data).toEqual([]);
  });

  it("o pedido de férias da funcionária não chega ao contratante do contrato dela", async () => {
    const id = await abrirComoMaria("ferias", "Férias de dezembro, por favor.");
    const fiscal = await como(EMAILS.fiscal);
    expect((await fiscal.from("solicitacoes").select("id").eq("id", id)).data).toEqual([]);
    // Contraponto: o RH vê.
    const rh = await como(EMAILS.rhDp);
    expect((await rh.from("solicitacoes").select("id").eq("id", id)).data).toEqual([{ id }]);
  });
});

describe("linha do tempo à prova de falsificação", () => {
  let id: string;
  beforeAll(async () => {
    id = await abrirComoMaria("suporte", "Não consigo ver meu espelho de setembro.");
  });

  it("funcionário não grava evento: nem mudança de status falsa, nem nota interna, nem comentário direto", async () => {
    const maria = await como(EMAILS.maria);
    for (const evento of [
      { tipo: "mudanca_status", status_anterior: "aberta", status_novo: "concluida", interno: false },
      { tipo: "comentario", conteudo: "nota falsa", interno: true },
      { tipo: "comentario", conteudo: "comentário direto", interno: false },
    ] as const) {
      const { error } = await maria
        .from("solicitacao_eventos")
        .insert({ solicitacao_id: id, usuario_id: MARIA.usuarioId, ...evento });
      expect(error?.code, JSON.stringify(evento)).toBe("42501");
    }
    expect(await eventos(id)).toEqual([]);
  });

  it("funcionário não muda a própria solicitação", async () => {
    const maria = await como(EMAILS.maria);
    await maria.from("solicitacoes").update({ status: "concluida" }).eq("id", id);
    const { data } = await admin.from("solicitacoes").select("status").eq("id", id).single();
    expect(data?.status).toBe("aberta");
  });
});

describe("tratamento pela equipe interna", () => {
  let id: string;
  beforeAll(async () => {
    id = await abrirComoMaria("atualizacao_cadastral", "Mudei de telefone: (51) 99999-0000.");
  });

  it("atribuir e mudar situação: UM evento por mudança, gravado pelo trigger", async () => {
    const rh = await actionsComo(EMAILS.rhDp);
    expect(await rh.atribuirResponsavel({ solicitacao_id: id, responsavel_id: RH })).toEqual({ ok: true });
    expect(await rh.mudarStatusSolicitacao({ solicitacao_id: id, status: "em_analise" })).toEqual({ ok: true });
    expect(
      await rh.mudarStatusSolicitacao({
        solicitacao_id: id,
        status: "pendente_solicitante",
        comentario: "Qual o DDD do telefone novo?",
      }),
    ).toEqual({ ok: true });

    const linha = await eventos(id);
    expect(linha.map((e) => [e.tipo, e.status_anterior, e.status_novo])).toEqual([
      ["atribuicao", null, null],
      ["mudanca_status", "aberta", "em_analise"],
      ["comentario", null, null],
      ["mudanca_status", "em_analise", "pendente_solicitante"],
    ]);
    const { data: audit } = await admin
      .from("auditoria")
      .select("acao, detalhes")
      .eq("entidade_id", id)
      .eq("acao", "mudar_status")
      .order("id");
    expect(audit?.map((a) => a.detalhes)).toEqual([
      { de: "aberta", para: "em_analise" },
      { de: "em_analise", para: "pendente_solicitante" },
    ]);
  });

  it("nota interna: o RH vê, a funcionária não", async () => {
    const rh = await actionsComo(EMAILS.rhDp);
    expect(await rh.comentarSolicitacao({ solicitacao_id: id, texto: "Conferir no cadastro antigo", interno: true })).toEqual({ ok: true });
    const maria = await como(EMAILS.maria);
    const { data: daMaria } = await maria.from("solicitacao_eventos").select("conteudo").eq("solicitacao_id", id);
    expect(daMaria?.map((e) => e.conteudo)).not.toContain("Conferir no cadastro antigo");
    const rhCliente = await como(EMAILS.rhDp);
    const { data: doRh } = await rhCliente.from("solicitacao_eventos").select("conteudo").eq("solicitacao_id", id);
    expect(doRh?.map((e) => e.conteudo)).toContain("Conferir no cadastro antigo");
  });

  it("comentário nasce interno (0026): sem o campo, e em insert que omite a coluna, a funcionária não vê", async () => {
    const rh = await actionsComo(EMAILS.rhDp);
    expect(await rh.comentarSolicitacao({ solicitacao_id: id, texto: "Esqueci de marcar — F4.2 padrao" })).toEqual({ ok: true });
    const rhCliente = await como(EMAILS.rhDp);
    const { error } = await rhCliente
      .from("solicitacao_eventos")
      .insert({ solicitacao_id: id, usuario_id: RH, tipo: "comentario", conteudo: "Insert direto sem coluna" });
    expect(error).toBeNull();

    const gravados = (await eventos(id)).filter((e) => e.conteudo === "Esqueci de marcar — F4.2 padrao" || e.conteudo === "Insert direto sem coluna");
    expect(gravados.map((e) => e.interno)).toEqual([true, true]);

    const maria = await como(EMAILS.maria);
    const { data: daMaria } = await maria.from("solicitacao_eventos").select("conteudo, tipo").eq("solicitacao_id", id);
    const conteudos = daMaria?.map((e) => e.conteudo);
    expect(conteudos).not.toContain("Esqueci de marcar — F4.2 padrao");
    expect(conteudos).not.toContain("Insert direto sem coluna");
    // O evento de status (trigger, que agora diz `false` explícito) continua visível a ela.
    expect(daMaria?.some((e) => e.tipo === "mudanca_status")).toBe(true);
  });

  it("marcado visível, a funcionária vê", async () => {
    const rh = await actionsComo(EMAILS.rhDp);
    expect(await rh.comentarSolicitacao({ solicitacao_id: id, texto: "Pode mandar o DDD?", interno: false })).toEqual({ ok: true });
    const maria = await como(EMAILS.maria);
    const { data } = await maria.from("solicitacao_eventos").select("conteudo").eq("solicitacao_id", id);
    expect(data?.map((e) => e.conteudo)).toContain("Pode mandar o DDD?");
  });

  it("a funcionária responde: comentário dela + volta para análise, com o evento de status do trigger", async () => {
    const { responderSolicitacao } = await actionsComo(EMAILS.maria);
    expect(await responderSolicitacao({ solicitacao_id: id, texto: "DDD 51, Porto Alegre." })).toEqual({ ok: true });
    const { data } = await admin.from("solicitacoes").select("status").eq("id", id).single();
    expect(data?.status).toBe("em_analise");
    const fim = (await eventos(id)).slice(-2);
    expect(fim).toMatchObject([
      { tipo: "comentario", usuario_id: MARIA.usuarioId, conteudo: "DDD 51, Porto Alegre." },
      { tipo: "mudanca_status", status_anterior: "pendente_solicitante", status_novo: "em_analise" },
    ]);
    // Não está mais esperando por ela.
    expect(await responderSolicitacao({ solicitacao_id: id, texto: "de novo" })).toEqual({
      ok: false,
      erro: "Esta solicitação não está esperando resposta sua.",
    });
  });

  it("transição inválida é recusada pelo banco; encerrada não muda mais", async () => {
    const rh = await actionsComo(EMAILS.rhDp);
    expect(await rh.mudarStatusSolicitacao({ solicitacao_id: id, status: "aberta" })).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/Não é possível mudar a situação/),
    });
    expect(await rh.mudarStatusSolicitacao({ solicitacao_id: id, status: "concluida" })).toEqual({ ok: true });
    const { data } = await admin.from("solicitacoes").select("concluida_em").eq("id", id).single();
    expect(data?.concluida_em).not.toBeNull();
    expect(await rh.atribuirResponsavel({ solicitacao_id: id, responsavel_id: null })).toMatchObject({
      ok: false,
      erro: "Solicitação encerrada não muda mais.",
    });
  });

  it("ninguém edita nem apaga evento — nem o RH", async () => {
    const rh = await como(EMAILS.rhDp);
    const upd = await rh.from("solicitacao_eventos").update({ conteudo: "reescrito" }).eq("solicitacao_id", id).select("id");
    expect(upd.error?.code).toBe("42501");
    const del = await rh.from("solicitacao_eventos").delete().eq("solicitacao_id", id).select("id");
    expect(del.error?.code).toBe("42501");
  });

  it("Suporte/Auditoria (solicitacoes só V) não trata", async () => {
    const outra = await abrirComoMaria("suporte", "Outra dúvida sobre o Portal.");
    const suporte = await actionsComo(EMAILS.suporte);
    expect(await suporte.mudarStatusSolicitacao({ solicitacao_id: outra, status: "em_analise" })).toMatchObject({ ok: false });
    expect(await suporte.comentarSolicitacao({ solicitacao_id: outra, texto: "oi", interno: false })).toMatchObject({ ok: false });
  });
});

describe("anexo", () => {
  it("vai para o bucket anexos e sai só pela rota, para quem vê a solicitação", async () => {
    const { abrirSolicitacao } = await actionsComo(EMAILS.maria);
    const foto = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" });
    const r = await abrirSolicitacao(formulario({ tipo: "afastamento", descricao: "Atestado de 3 dias em anexo.", anexo: foto }));
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    if (!r.ok) return;
    criadas.add(r.dados.id);

    const { data: anexo } = await admin.from("anexos").select("id").eq("solicitacao_id", r.dados.id).single();
    const baixar = async (email: string) => {
      estado.cliente = await como(email);
      vi.resetModules();
      const { GET } = await import("@/app/api/anexos/[id]/route");
      return GET(new Request("http://portal.teste/x"), { params: Promise.resolve({ id: anexo!.id }) });
    };
    expect((await baixar(EMAILS.maria)).status).toBe(302);
    expect((await baixar(EMAILS.rhDp)).status).toBe(302);
    // O contratante não vê o pedido de afastamento — nem o atestado.
    expect((await baixar(EMAILS.fiscal)).status).toBe(404);
  });
});
