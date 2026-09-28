import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Ciência e divergência (F3.4), pela Server Action real, contra o banco real.
 *
 * O que se prova:
 * - o comunicado coletivo vira pendência para quem ele alcança, e some da
 *   lista quando respondido;
 * - a ciência grava versão e hash DO DOCUMENTO, IP e user-agent, e sai com
 *   protocolo; resposta é uma só;
 * - divergência exige 20 caracteres e abre a solicitação do tipo que o
 *   mapeamento manda (espelho → correcao_ponto, comunicado → outro; nunca
 *   ocorrencia), sem responsável e sem prazo, na mesma transação;
 * - foto inválida é recusada ANTES de gravar qualquer coisa — ciência é
 *   imutável, não pode sobrar meio registro;
 * - só o funcionário a quem o documento chega responde.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.44", "user-agent": "Mozilla/5.0 (Linux; Android 11) teste-f34" }),
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
const MARIA = {
  email: "01000791998@func.3e.portal3e",
  usuarioId: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2",
  pessoaId: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c",
};
const PESSOA_JOAO = "8605334e-658a-5360-a78a-79e3ff3736e8";
const EMAILS = { rhDp: "rh_dp@3e.com.br", fiscal: "fiscal@hsaolucas.com.br" } as const;
const C042 = "d594b950-e556-5f78-ae9b-98f6b1d12b63";
const TIPOS = {
  espelho: "941fb37f-659c-5222-9dfd-f2fc3b893e37",
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2",
  holerite: "485e0b90-d471-5f86-ac73-b942a9d8759e",
} as const;

let admin: Cliente;
const clientes = new Map<string, Cliente>();
const criados: string[] = [];

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

async function modulosComo(email: string) {
  estado.cliente = await como(email);
  vi.resetModules();
  return {
    ...(await import("./ciencia")),
    ...(await import("./funcionario")),
  };
}

/** Documento publicado de fixture. A ciência não olha o Storage. */
async function documento(
  tipoId: string,
  titulo: string,
  alvo: { pessoaId: string } | { contratoId: string },
  status: "publicado" | "arquivado" = "publicado",
): Promise<string> {
  const individual = "pessoaId" in alvo;
  const { data, error } = await admin
    .from("documentos")
    .insert({
      org_id: ORG,
      tipo_id: tipoId,
      escopo: individual ? "individual" : "coletivo",
      pessoa_id: individual ? alvo.pessoaId : null,
      titulo,
      arquivo_path: `teste-f34/${crypto.randomUUID()}.pdf`,
      arquivo_hash: crypto.randomUUID().replace(/-/g, "").padEnd(64, "0"),
      status,
      publicado_em: new Date().toISOString(),
      prazo_ciencia: "2099-12-31",
    })
    .select("id")
    .single();
  if (error) throw new Error(`fixture ${titulo}: ${error.message}`);
  criados.push(data.id);
  if (!individual) {
    const { error: e } = await admin
      .from("documento_destinatarios")
      .insert({ documento_id: data.id, contrato_id: alvo.contratoId });
    if (e) throw new Error(`fixture público ${titulo}: ${e.message}`);
  }
  return data.id;
}

function resposta(
  documentoId: string,
  tipo: "confirmacao" | "divergencia",
  extra: { justificativa?: string; foto?: Blob } = {},
): FormData {
  const f = new FormData();
  f.set("documento_id", documentoId);
  f.set("tipo", tipo);
  if (extra.justificativa !== undefined) f.set("justificativa", extra.justificativa);
  if (extra.foto) f.set("foto", extra.foto, "foto.jpg");
  return f;
}

async function cienciasDe(documentoId: string) {
  const { data } = await admin
    .from("ciencias")
    .select("tipo, documento_versao, documento_hash, ip, user_agent, justificativa, protocolo, pessoa_id, usuario_id")
    .eq("documento_id", documentoId);
  return data ?? [];
}

async function solicitacoesDe(documentoId: string) {
  const { data } = await admin
    .from("solicitacoes")
    .select("id, tipo, status, pessoa_id, aberta_por, responsavel_id, prazo, descricao, protocolo")
    .eq("documento_id", documentoId);
  return data ?? [];
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });
  const { error } = await admin.from("documento_tipos").select("tipo_solicitacao_divergencia").limit(1);
  if (error) throw new Error(`migração 0017 ausente no alvo de teste: ${error.message}`);
}, 30_000);

afterAll(async () => {
  if (!admin || criados.length === 0) return;
  const { data: sols } = await admin.from("solicitacoes").select("id").in("documento_id", criados);
  const solIds = (sols ?? []).map((s) => s.id);
  if (solIds.length) {
    const { data: anexos } = await admin.from("anexos").select("arquivo_path").in("solicitacao_id", solIds);
    const caminhos = (anexos ?? []).map((a) => a.arquivo_path);
    if (caminhos.length) await admin.storage.from("anexos").remove(caminhos);
    await admin.from("anexos").delete().in("solicitacao_id", solIds);
    await admin.from("solicitacoes").delete().in("id", solIds);
  }
  await admin.from("ciencias").delete().in("documento_id", criados);
  await admin.from("auditoria").delete().eq("acao", "ciencia").in("detalhes->>documento_id", criados);
  await admin.from("documentos").delete().in("id", criados);
}, 30_000);

describe("pendência e confirmação", () => {
  let coletivo: string;

  beforeAll(async () => {
    coletivo = await documento(TIPOS.comunicado, "F3.4 comunicado do 042", { contratoId: C042 });
  });

  it("o comunicado dirigido ao contrato dela aparece como pendência", async () => {
    const { documentosDoFuncionario, pendencias } = await modulosComo(MARIA.email);
    const ids = pendencias(await documentosDoFuncionario()).map((d) => d.id);
    expect(ids).toContain(coletivo);
  });

  it("confirmar grava versão e hash do documento, IP e user-agent, e devolve o protocolo", async () => {
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(resposta(coletivo, "confirmacao"));
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    if (!r.ok) return;
    expect(r.dados.protocolo).toMatch(/^\d{4}-\d{6}$/);
    expect(r.dados.solicitacao_protocolo).toBeNull();

    const { data: doc } = await admin.from("documentos").select("versao, arquivo_hash").eq("id", coletivo).single();
    expect(await cienciasDe(coletivo)).toEqual([
      {
        tipo: "confirmacao",
        documento_versao: doc!.versao,
        documento_hash: doc!.arquivo_hash,
        ip: "203.0.113.44",
        user_agent: "Mozilla/5.0 (Linux; Android 11) teste-f34",
        justificativa: null,
        protocolo: r.dados.protocolo,
        pessoa_id: MARIA.pessoaId,
        usuario_id: MARIA.usuarioId,
      },
    ]);
    // Confirmação não abre solicitação.
    expect(await solicitacoesDe(coletivo)).toEqual([]);
  });

  it("a ciência fica na auditoria", async () => {
    const { data } = await admin
      .from("auditoria")
      .select("acao, entidade, ip, usuario_id")
      .eq("acao", "ciencia")
      .eq("detalhes->>documento_id", coletivo);
    expect(data).toEqual([
      { acao: "ciencia", entidade: "ciencias", ip: "203.0.113.44", usuario_id: MARIA.usuarioId },
    ]);
  });

  it("respondido, sai das pendências", async () => {
    const { documentosDoFuncionario, pendencias } = await modulosComo(MARIA.email);
    const todos = await documentosDoFuncionario();
    expect(pendencias(todos).map((d) => d.id)).not.toContain(coletivo);
    expect(todos.find((d) => d.id === coletivo)?.resposta?.tipo).toBe("confirmacao");
  });

  it("resposta é uma só: a segunda é recusada e nada muda", async () => {
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(
      resposta(coletivo, "divergencia", { justificativa: "Mudei de ideia sobre este comunicado." }),
    );
    expect(r).toEqual({ ok: false, erro: "Você já respondeu este documento." });
    expect(await cienciasDe(coletivo)).toHaveLength(1);
    expect(await solicitacoesDe(coletivo)).toEqual([]);
  });
});

describe("divergência", () => {
  it("menos de 20 caracteres é recusado — e nada é gravado", async () => {
    const espelho = await documento(TIPOS.espelho, "F3.4 espelho curto", { pessoaId: MARIA.pessoaId });
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(resposta(espelho, "divergencia", { justificativa: "  faltou dia 3  " }));
    expect(r.ok).toBe(false);
    expect(await cienciasDe(espelho)).toEqual([]);

    // Pela função direto, sem a validação da action: o banco confere igual.
    const maria = await como(MARIA.email);
    const { error } = await maria.rpc("registrar_ciencia", {
      p_documento: espelho,
      p_tipo: "divergencia",
      p_justificativa: "faltou dia 3",
      p_ip: null,
      p_user_agent: "",
    });
    expect(error?.code).toBe("55000");
    expect(await cienciasDe(espelho)).toEqual([]);
  });

  it("espelho abre solicitação correcao_ponto, sem responsável e sem prazo", async () => {
    const espelho = await documento(TIPOS.espelho, "F3.4 espelho de agosto", { pessoaId: MARIA.pessoaId });
    const justificativa = "Faltou o sábado dia 16, trabalhei das 7h às 13h.";
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(resposta(espelho, "divergencia", { justificativa }));
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    if (!r.ok) return;

    const [sol] = await solicitacoesDe(espelho);
    expect(sol).toMatchObject({
      tipo: "correcao_ponto",
      status: "aberta",
      pessoa_id: MARIA.pessoaId,
      aberta_por: MARIA.usuarioId,
      responsavel_id: null,
      prazo: null,
      descricao: justificativa,
      protocolo: r.dados.solicitacao_protocolo,
    });
    expect((await cienciasDe(espelho))[0]).toMatchObject({ tipo: "divergencia", justificativa });
  });

  it("comunicado abre solicitação `outro` — nunca `ocorrencia`, que é a fila do contratante", async () => {
    const comunicado = await documento(TIPOS.comunicado, "F3.4 comunicado de escala", {
      pessoaId: MARIA.pessoaId,
    });
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(
      resposta(comunicado, "divergencia", { justificativa: "Minha escala não é essa, sou do turno da noite." }),
    );
    expect(r.ok, r.ok ? "" : r.erro).toBe(true);
    expect((await solicitacoesDe(comunicado)).map((s) => s.tipo)).toEqual(["outro"]);
  });

  it("a foto vai para o bucket anexos, ligada à solicitação", async () => {
    const espelho = await documento(TIPOS.espelho, "F3.4 espelho com foto", { pessoaId: MARIA.pessoaId });
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])], {
      type: "image/jpeg",
    });
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(
      resposta(espelho, "divergencia", { justificativa: "A folha de ponto física mostra outro horário.", foto: jpeg }),
    );
    expect(r).toMatchObject({ ok: true, dados: { aviso: null } });

    const [sol] = await solicitacoesDe(espelho);
    const { data: anexos } = await admin
      .from("anexos")
      .select("arquivo_path, mime, enviado_por")
      .eq("solicitacao_id", sol.id);
    expect(anexos).toHaveLength(1);
    expect(anexos![0]).toMatchObject({ mime: "image/jpeg", enviado_por: MARIA.usuarioId });
    expect(anexos![0].arquivo_path).toMatch(new RegExp(`^${ORG}/solicitacoes/${sol.id}/.+\\.jpg$`));
    const { data: arquivo } = await admin.storage.from("anexos").download(anexos![0].arquivo_path);
    expect(arquivo?.size).toBe(10);
  });

  it("foto que não é imagem é recusada ANTES — sem ciência e sem solicitação", async () => {
    const espelho = await documento(TIPOS.espelho, "F3.4 espelho foto ruim", { pessoaId: MARIA.pessoaId });
    const falsa = new Blob([new TextEncoder().encode("%PDF-1.4 não é foto")], { type: "image/jpeg" });
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(
      resposta(espelho, "divergencia", { justificativa: "Faltou a hora extra do dia 20.", foto: falsa }),
    );
    expect(r).toMatchObject({ ok: false });
    expect(await cienciasDe(espelho)).toEqual([]);
    expect(await solicitacoesDe(espelho)).toEqual([]);
  });
});

describe("quem responde", () => {
  it("documento de outra pessoa: recusado, nada gravado", async () => {
    const doJoao = await documento(TIPOS.comunicado, "F3.4 comunicado do João", { pessoaId: PESSOA_JOAO });
    // Contraponto: o documento existe e o RH o enxerga.
    const rh = await como(EMAILS.rhDp);
    expect((await rh.from("documentos").select("id").eq("id", doJoao)).data).toEqual([{ id: doJoao }]);

    const { registrarCiencia } = await modulosComo(MARIA.email);
    expect(await registrarCiencia(resposta(doJoao, "confirmacao"))).toEqual({
      ok: false,
      erro: "Documento não encontrado.",
    });
    expect(await cienciasDe(doJoao)).toEqual([]);
  });

  it("interno e contratante não dão ciência, nem pela função direto", async () => {
    const doc = await documento(TIPOS.comunicado, "F3.4 comunicado para terceiros", { pessoaId: MARIA.pessoaId });
    const { registrarCiencia } = await modulosComo(EMAILS.rhDp);
    expect(await registrarCiencia(resposta(doc, "confirmacao"))).toMatchObject({ ok: false });

    const fiscal = await como(EMAILS.fiscal);
    const { error } = await fiscal.rpc("registrar_ciencia", {
      p_documento: doc,
      p_tipo: "confirmacao",
      p_justificativa: "",
      p_ip: null,
      p_user_agent: "",
    });
    expect(error?.code).toBe("55000");
    expect(await cienciasDe(doc)).toEqual([]);
  });

  it("versão arquivada não recebe resposta nova", async () => {
    const velho = await documento(TIPOS.comunicado, "F3.4 comunicado arquivado", { pessoaId: MARIA.pessoaId }, "arquivado");
    const { registrarCiencia } = await modulosComo(MARIA.email);
    const r = await registrarCiencia(resposta(velho, "confirmacao"));
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/versão nova/) });
  });

  it("documento que não pede ciência (holerite) não recebe resposta", async () => {
    const holerite = await documento(TIPOS.holerite, "F3.4 holerite", { pessoaId: MARIA.pessoaId });
    const { registrarCiencia } = await modulosComo(MARIA.email);
    expect(await registrarCiencia(resposta(holerite, "confirmacao"))).toEqual({
      ok: false,
      erro: "Este documento não pede ciência.",
    });
  });
});
