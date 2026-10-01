import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Mensagem } from "@/lib/email";
import type { Database } from "@/lib/supabase/types";

import { enviarPendentes, gerarAvisosDePrazo } from "./envio";

/**
 * Notificações (F4.3) contra o banco de verdade.
 *
 * O que se prova: o banco cria os avisos certos (publicado com prazo,
 * lembrete no 3º dia, vencido, respondida, concluída), sem duplicar; a fila
 * não envia nada com a flag desligada nem fora da janela; com um transporte
 * de teste no lugar do Resend, cada e-mail sai para o endereço certo, só com
 * o primeiro nome e o link, e a linha vira `enviada`; o que passou de 48 h na
 * fila vira `descartada` e não sai (0028).
 *
 * **O que não é exercitado aqui: o Resend de verdade.** RESEND_API_KEY está
 * vazia neste projeto, e o transporte de teste substitui só a chamada ao
 * provedor — o resto do caminho é o de produção.
 *
 * Estado de persona volta ao lugar: o `email_pessoal` da Maria (vazio no
 * seed) é preenchido só durante o arquivo e devolvido a `null` no afterAll.
 */

type Cliente = SupabaseClient<Database>;

const SENHA = "portal3e2026";
const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const MARIA = { usuarioId: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2", pessoaId: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c" };
const JOAO = { usuarioId: "d291f5ba-25c3-5319-84a5-fdb824f00b8c", pessoaId: "8605334e-658a-5360-a78a-79e3ff3736e8" };
const RH = { email: "rh_dp@3e.com.br", id: "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3" };
const TIPOS = {
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2",
  holerite: "485e0b90-d471-5f86-ac73-b942a9d8759e",
} as const;
const EMAIL_TESTE = "maria.teste-f43@exemplo.invalid";
/** 12h de Brasília: dentro da janela de envio. */
const MEIO_DIA = new Date("2026-09-29T15:00:00Z");

let admin: Cliente;
const documentos: string[] = [];
const solicitacoes: string[] = [];

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

function dia(deslocamento: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + deslocamento)).toISOString().slice(0, 10);
}

/** Documento já publicado há `diasAtras` dias (fixture: o trigger de publicação não roda). */
async function publicadoHa(diasAtras: number, prazo: string, pessoaId = MARIA.pessoaId): Promise<string> {
  const { data, error } = await admin
    .from("documentos")
    .insert({
      org_id: ORG,
      tipo_id: TIPOS.comunicado,
      escopo: "individual",
      pessoa_id: pessoaId,
      titulo: "F4.3 comunicado",
      arquivo_path: `teste-f43/${crypto.randomUUID()}.pdf`,
      arquivo_hash: "b".repeat(64),
      status: "publicado",
      publicado_em: new Date(Date.now() - diasAtras * 86_400_000).toISOString(),
      prazo_ciencia: prazo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`fixture: ${error.message}`);
  documentos.push(data.id);
  return data.id;
}

async function avisos(referenciaId: string, canal: "email" | "portal" = "email") {
  const { data } = await admin
    .from("notificacoes")
    .select("usuario_id, motivo, status, erro, tentativas")
    .eq("referencia_id", referenciaId)
    .eq("canal", canal)
    .order("criado_em");
  return data ?? [];
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });
  const { error } = await admin.from("notificacoes").select("motivo").limit(1);
  if (error) throw new Error(`migração 0022 ausente no alvo de teste: ${error.message}`);
  const { data } = await admin.from("pessoas").select("email_pessoal").eq("id", MARIA.pessoaId).single();
  if (data?.email_pessoal) throw new Error("a Maria já tem email_pessoal no seed; este teste supõe vazio.");
  await admin.from("pessoas").update({ email_pessoal: EMAIL_TESTE }).eq("id", MARIA.pessoaId);
}, 30_000);

afterAll(async () => {
  if (!admin) return;
  await admin.from("pessoas").update({ email_pessoal: null }).eq("id", MARIA.pessoaId);
  const refs = [...documentos, ...solicitacoes];
  if (refs.length) await admin.from("notificacoes").delete().in("referencia_id", refs);
  if (solicitacoes.length) await admin.from("solicitacoes").delete().in("id", solicitacoes);
  if (documentos.length) {
    await admin.from("ciencias").delete().in("documento_id", documentos);
    await admin.from("documentos").delete().in("id", documentos);
  }
}, 30_000);

describe("o banco cria os avisos", () => {
  it("publicação com prazo: portal e e-mail; sem prazo (holerite): só portal", async () => {
    const comPrazo = crypto.randomUUID();
    const semPrazo = crypto.randomUUID();
    for (const [id, tipo] of [[comPrazo, TIPOS.comunicado], [semPrazo, TIPOS.holerite]] as const) {
      const { error } = await admin.from("documentos").insert({
        id,
        org_id: ORG,
        tipo_id: tipo,
        escopo: "individual",
        pessoa_id: MARIA.pessoaId,
        titulo: "F4.3 publicação",
        arquivo_path: `teste-f43/${id}.pdf`,
        arquivo_hash: "c".repeat(64),
        status: "rascunho",
      });
      if (error) throw new Error(error.message);
      documentos.push(id);
      await admin
        .from("documentos")
        .update({ status: "publicado", publicado_em: new Date().toISOString(), prazo_ciencia: tipo === TIPOS.comunicado ? dia(5) : null })
        .eq("id", id);
    }
    expect(await avisos(comPrazo)).toEqual([
      { usuario_id: MARIA.usuarioId, motivo: "publicado", status: "pendente", erro: null, tentativas: 0 },
    ]);
    expect(await avisos(comPrazo, "portal")).toHaveLength(1);
    expect(await avisos(semPrazo)).toEqual([]);
    expect(await avisos(semPrazo, "portal")).toHaveLength(1);
  });

  it("lembrete no 3º dia e vencido depois do prazo — uma vez só, e nunca para quem já respondeu", async () => {
    const lembrete = await publicadoHa(3, dia(2));
    const vencido = await publicadoHa(6, dia(-1));
    const cedo = await publicadoHa(1, dia(4));
    const respondido = await publicadoHa(4, dia(1));
    await admin.from("ciencias").insert({
      org_id: ORG,
      documento_id: respondido,
      documento_versao: 1,
      documento_hash: "b".repeat(64),
      pessoa_id: MARIA.pessoaId,
      usuario_id: MARIA.usuarioId,
      tipo: "confirmacao",
    });

    await gerarAvisosDePrazo();
    await gerarAvisosDePrazo(); // idempotente

    expect((await avisos(lembrete)).map((a) => a.motivo)).toEqual(["lembrete"]);
    expect((await avisos(lembrete, "portal")).map((a) => a.motivo)).toEqual(["lembrete"]);
    expect((await avisos(vencido)).map((a) => a.motivo)).toEqual(["vencido"]);
    expect(await avisos(cedo)).toEqual([]);
    expect(await avisos(respondido)).toEqual([]);
  });

  it("solicitação: resposta da equipe e conclusão avisam o solicitante; o que ele mesmo faz, não", async () => {
    const { data: sol } = await admin
      .from("solicitacoes")
      .insert({ org_id: ORG, tipo: "suporte", titulo: "F4.3", descricao: "teste", pessoa_id: MARIA.pessoaId, aberta_por: MARIA.usuarioId })
      .select("id")
      .single();
    solicitacoes.push(sol!.id);

    const { url, anon } = ambiente();
    const rh = createClient<Database>(url, anon, { auth: { persistSession: false } });
    await rh.auth.signInWithPassword({ email: RH.email, password: SENHA });

    // Comentário visível + pedido ao solicitante no mesmo gesto: UM e-mail (freio de 5 min).
    await rh.from("solicitacao_eventos").insert({ solicitacao_id: sol!.id, usuario_id: RH.id, tipo: "comentario", conteudo: "Qual o período?", interno: false });
    await rh.from("solicitacoes").update({ status: "em_analise" }).eq("id", sol!.id);
    await rh.from("solicitacoes").update({ status: "pendente_solicitante" }).eq("id", sol!.id);
    // Nota interna não avisa ninguém.
    await rh.from("solicitacao_eventos").insert({ solicitacao_id: sol!.id, usuario_id: RH.id, tipo: "comentario", conteudo: "nota", interno: true });

    const maria = createClient<Database>(url, anon, { auth: { persistSession: false } });
    await maria.auth.signInWithPassword({ email: "01000791998@func.3e.portal3e", password: SENHA });
    await maria.rpc("responder_solicitacao", { p_solicitacao: sol!.id, p_texto: "De 10 a 20 de novembro." });

    await rh.from("solicitacoes").update({ status: "concluida" }).eq("id", sol!.id);

    const doc = await avisos(sol!.id);
    expect(doc.map((a) => [a.usuario_id, a.motivo])).toEqual([
      [MARIA.usuarioId, "respondida"],
      [MARIA.usuarioId, "concluida"],
    ]);
  });
});

describe("a fila de e-mail", () => {
  it("com a flag desligada, nada sai e tudo continua pendente", async () => {
    const antes = process.env.NOTIFICACOES_EMAIL;
    delete process.env.NOTIFICACOES_EMAIL;
    try {
      const r = await enviarPendentes({ agora: MEIO_DIA });
      expect(r).toMatchObject({ enviadas: 0, motivoRetencao: "flag_desligada" });
      expect(r.retidas).toBeGreaterThan(0);
    } finally {
      if (antes !== undefined) process.env.NOTIFICACOES_EMAIL = antes;
    }
  });

  it("fora da janela (3h de Brasília), nada sai mesmo com o envio ligado", async () => {
    const enviados: Mensagem[] = [];
    const r = await enviarPendentes({ agora: new Date("2026-09-29T06:00:00Z"), transporte: async (m) => void enviados.push(m) });
    expect(r.motivoRetencao).toBe("fora_da_janela");
    expect(enviados).toEqual([]);
  });

  it("com o envio ligado: sai para o e-mail pessoal da funcionária, só com o primeiro nome e o link, e vira enviada", async () => {
    const enviados: Mensagem[] = [];
    const r = await enviarPendentes({ agora: MEIO_DIA, transporte: async (m) => void enviados.push(m) });
    expect(r.enviadas).toBeGreaterThan(0);

    const daMaria = enviados.filter((m) => m.para === EMAIL_TESTE);
    expect(daMaria.length).toBeGreaterThanOrEqual(4);
    for (const m of daMaria) {
      expect(m.texto).toMatch(/^Olá, Maria\./);
      expect(m.texto + m.html + m.assunto).not.toMatch(/Aparecida|Ferreira|01000791998|F4\.3/);
      expect(m.html).toContain("Abrir no Portal");
    }
    expect(daMaria.some((m) => /\/documentos\/[0-9a-f-]{36}/.test(m.texto))).toBe(true);
    expect(daMaria.some((m) => /\/pedidos\/[0-9a-f-]{36}/.test(m.texto))).toBe(true);

    const [publicado] = await avisos(documentos[0]);
    expect(publicado.status).toBe("enviada");
  });

  // Depois do envio ligado: a fila só tem o aviso novo do João.
  it("falha do provedor: tenta de novo, e desiste na 3ª", async () => {
    const doc = await publicadoHa(3, dia(2), JOAO.pessoaId);
    await admin.from("pessoas").update({ email_pessoal: "joao.teste-f43@exemplo.invalid" }).eq("id", JOAO.pessoaId);
    try {
      await gerarAvisosDePrazo();
      const falha = async () => {
        throw new Error("provedor fora do ar");
      };
      for (let i = 1; i <= 3; i++) await enviarPendentes({ agora: MEIO_DIA, transporte: falha });
      const [aviso] = await avisos(doc);
      expect(aviso).toMatchObject({ status: "erro", tentativas: 3, erro: "provedor fora do ar" });
    } finally {
      await admin.from("pessoas").update({ email_pessoal: null }).eq("id", JOAO.pessoaId);
    }
  });

  it("sem e-mail cadastrado: a linha vira erro com o motivo, e o aviso do Portal continua", async () => {
    const doc = await publicadoHa(3, dia(2), JOAO.pessoaId);
    await gerarAvisosDePrazo();
    await enviarPendentes({ agora: MEIO_DIA, transporte: async () => {} });
    expect(await avisos(doc)).toEqual([
      expect.objectContaining({ status: "erro", erro: "sem e-mail cadastrado — o aviso fica só no Portal" }),
    ]);
    expect(await avisos(doc, "portal")).toHaveLength(1);
  });

  it("mais de 48 h na fila: descartado, nunca enviado — e só quando o envio aconteceria", async () => {
    // Linhas com `criado_em` no passado, relativo ao relógio do teste (MEIO_DIA).
    const fila = async (horasAtras: number) => {
      const doc = await publicadoHa(5, dia(2));
      const { error } = await admin.from("notificacoes").insert({
        org_id: ORG,
        usuario_id: MARIA.usuarioId,
        canal: "email",
        assunto: "F4.3 idade",
        referencia_tipo: "documentos",
        referencia_id: doc,
        motivo: "publicado",
        criado_em: new Date(MEIO_DIA.getTime() - horasAtras * 3_600_000).toISOString(),
      });
      if (error) throw new Error(`fixture: ${error.message}`);
      return doc;
    };
    const velha = await fila(49);
    const recente = await fila(47);

    const antes = process.env.NOTIFICACOES_EMAIL;
    delete process.env.NOTIFICACOES_EMAIL;
    try {
      await enviarPendentes({ agora: MEIO_DIA });
      expect(await avisos(velha)).toEqual([expect.objectContaining({ status: "pendente" })]);
    } finally {
      if (antes !== undefined) process.env.NOTIFICACOES_EMAIL = antes;
    }

    const enviados: Mensagem[] = [];
    const r = await enviarPendentes({ agora: MEIO_DIA, transporte: async (m) => void enviados.push(m) });

    expect(r.descartadas).toBeGreaterThanOrEqual(1);
    expect(await avisos(velha)).toEqual([expect.objectContaining({ status: "descartada", tentativas: 0 })]);
    expect(await avisos(recente)).toEqual([expect.objectContaining({ status: "enviada" })]);
    expect(enviados.some((m) => m.texto.includes(velha))).toBe(false);
    expect(enviados.some((m) => m.texto.includes(recente))).toBe(true);
  });
});

describe("o job", () => {
  it("sem o segredo do cron: 401", async () => {
    const antes = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "segredo-de-teste-f43";
    try {
      const { GET } = await import("@/app/api/jobs/notificacoes/route");
      expect((await GET(new Request("http://x/api/jobs/notificacoes"))).status).toBe(401);
      expect(
        (await GET(new Request("http://x/api/jobs/notificacoes", { headers: { authorization: "Bearer errado" } }))).status,
      ).toBe(401);
      const ok = await GET(
        new Request("http://x/api/jobs/notificacoes", { headers: { authorization: "Bearer segredo-de-teste-f43" } }),
      );
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ avisos: expect.any(Object), envio: expect.any(Object) });
    } finally {
      if (antes === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = antes;
    }
  });
});
