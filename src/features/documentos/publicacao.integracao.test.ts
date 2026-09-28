import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Publicação de documentos (F3.1), contra o banco de verdade.
 *
 * Critério de aceite da Fase 3 que mora aqui: **publicar um comunicado para
 * um grupo e ver uma pendência por pessoa**, e **retificação gera versão 2 e
 * nova pendência, com a versão 1 preservada**. E o que a 0015 garante no
 * banco — ciclo de vida, categoria e escopo na escrita, bucket fechado —,
 * provado com o client da persona, nunca com `service_role`.
 *
 * As Server Actions rodam de verdade; só o encanamento do Next é dublado
 * (client vindo de cookie, `headers()`, `revalidatePath`), como em
 * `acessos.integracao.test.ts`.
 *
 * Todo documento, arquivo e notificação criados aqui saem no afterAll. O seed
 * não tem documento.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

type Cliente = SupabaseClient<Database>;

const SENHA = "portal3e2026";
const EMAILS = {
  rhDp: "rh_dp@3e.com.br",
  contratos: "contratos@3e.com.br",
  suporte: "suporte_auditoria@3e.com.br",
  maria: "01000791998@func.3e.portal3e",
} as const;
const C042 = "d594b950-e556-5f78-ae9b-98f6b1d12b63";
const TIPOS = {
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2",
  holerite: "485e0b90-d471-5f86-ac73-b942a9d8759e",
} as const;
const PESSOA_JOAO = "8605334e-658a-5360-a78a-79e3ff3736e8";
const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const MARIA = {
  usuarioId: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2",
  pessoaId: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c",
};
const TIPO_ESPELHO = "941fb37f-659c-5222-9dfd-f2fc3b893e37";
const TIPO_ASO = "a5ea6ce3-223a-5b48-b69c-9be2c7bcc720";

/**
 * Ciência registrada pelo client da própria Maria — o caminho legítimo, pela
 * `ciencias_insert`. A tela da F3.4 ainda não existe; a policy, sim.
 */
async function mariaResponde(
  documentoId: string,
  tipo: "confirmacao" | "divergencia",
  justificativa: string | null = null,
) {
  const { data: doc } = await admin
    .from("documentos")
    .select("versao, arquivo_hash")
    .eq("id", documentoId)
    .single();
  const maria = await como(EMAILS.maria);
  const { data, error } = await maria
    .from("ciencias")
    .insert({
      org_id: ORG,
      documento_id: documentoId,
      documento_versao: doc!.versao,
      documento_hash: doc!.arquivo_hash,
      pessoa_id: MARIA.pessoaId,
      usuario_id: MARIA.usuarioId,
      tipo,
      justificativa,
    })
    .select("id")
    .single();
  if (error) throw new Error(`ciência da Maria: ${error.message}`);
  return data.id;
}

let admin: Cliente;
const clientes = new Map<string, Cliente>();
const criados = new Set<string>();

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

/** Um login por persona por arquivo (limite de sign-in do Auth). */
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

/** Actions ligadas à persona; `cache()` da sessão zerado a cada troca. */
async function actionsComo(email: string) {
  estado.cliente = await como(email);
  vi.resetModules();
  return import("./actions");
}

function pdf(texto: string): File {
  const conteudo = `%PDF-1.4\n% ${texto}\n%%EOF\n`;
  return new File([conteudo], "documento.pdf", { type: "application/pdf" });
}

function formulario(dados: unknown, arquivo: File = pdf(crypto.randomUUID())): FormData {
  const f = new FormData();
  f.append("dados", JSON.stringify(dados));
  f.append("arquivo", arquivo);
  return f;
}

function hojeMais(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

function exigirOk<T>(r: { ok: true; dados: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(`action falhou: ${r.erro}`);
  return r.dados;
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  // A 0014 e a 0015 precisam estar aplicadas: sem elas este arquivo testaria
  // o schema antigo e falharia por um motivo que não é o dele.
  const { error } = await admin.from("documento_tipos").select("prazo_ciencia_dias").limit(1);
  if (error) throw new Error(`migração 0014 ausente no alvo de teste: ${error.message}`);
}, 30_000);

afterAll(async () => {
  if (!admin || criados.size === 0) return;
  const ids = [...criados];
  const { data } = await admin.from("documentos").select("arquivo_path").in("id", ids);
  await admin.from("notificacoes").delete().in("referencia_id", ids);
  // Ciência é imutável para `authenticated`; `service_role` limpa o fixture.
  await admin.from("ciencias").delete().in("documento_id", ids);
  // Versão nova primeiro: `substitui_id` aponta para a anterior.
  await admin.from("documentos").delete().in("id", ids).not("substitui_id", "is", null);
  await admin.from("documentos").delete().in("id", ids);
  const caminhos = (data ?? []).map((d) => d.arquivo_path);
  if (caminhos.length) await admin.storage.from("documentos").remove(caminhos);
}, 30_000);

describe("publicar um comunicado coletivo", () => {
  let id: string;
  let esperadas: string[];

  beforeAll(async () => {
    // Quem o público "contrato 042" alcança, calculado à parte do código testado.
    const { data } = await admin
      .from("alocacoes")
      .select("pessoa_id")
      .eq("contrato_id", C042)
      .neq("status", "encerrada");
    esperadas = [...new Set((data ?? []).map((a) => a.pessoa_id))];
    expect(esperadas.length, "o seed precisa de gente alocada no 042").toBeGreaterThan(1);

    const { criarRascunho } = await actionsComo(EMAILS.rhDp);
    id = exigirOk(
      await criarRascunho(
        formulario({
          tipo_id: TIPOS.comunicado,
          titulo: "F3.1 comunicado do 042",
          escopo: "coletivo",
          publicos: [{ contrato_id: C042 }],
        }),
      ),
    ).id;
    criados.add(id);
  }, 30_000);

  it("o rascunho nasce com hash, caminho de docs/03 e o arquivo no bucket", async () => {
    const { data } = await admin
      .from("documentos")
      .select("status, versao, arquivo_path, arquivo_hash, org_id, publicado_em")
      .eq("id", id)
      .single();
    expect(data).toMatchObject({ status: "rascunho", versao: 1, publicado_em: null });
    expect(data!.arquivo_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data!.arquivo_path).toMatch(
      new RegExp(`^${data!.org_id}/\\d{4}/comunicado/${id}\\.pdf$`),
    );

    const { data: baixado, error } = await admin.storage
      .from("documentos")
      .download(data!.arquivo_path);
    expect(error).toBeNull();
    expect(await baixado!.text()).toMatch(/^%PDF-/);
  });

  it("rascunho não alcança ninguém: a funcionária não o vê", async () => {
    const maria = await como(EMAILS.maria);
    const { data } = await maria.from("documentos").select("id").eq("id", id);
    expect(data).toEqual([]);
  });

  it("publica com o prazo padrão e uma pendência por pessoa alcançada", async () => {
    const { publicarDocumento } = await actionsComo(EMAILS.rhDp);
    const r = exigirOk(await publicarDocumento({ documento_id: id, prazo_ciencia: "" }));
    expect(r.destinatarios).toBe(esperadas.length);

    const { data } = await admin
      .from("documentos")
      .select("status, prazo_ciencia, publicado_em, publicado_por")
      .eq("id", id)
      .single();
    expect(data).toMatchObject({ status: "publicado", prazo_ciencia: hojeMais(5) });
    expect(data!.publicado_em).not.toBeNull();
    // Carimbado pelo banco, com quem publicou de verdade.
    const rh = await como(EMAILS.rhDp);
    expect(data!.publicado_por).toBe((await rh.auth.getUser()).data.user!.id);

    // Pendência = publicado, alcança a pessoa e sem ciência. Visto pelo lado
    // do interno: o resumo conta todos os alcançados como pendentes.
    const { data: resumo } = await rh.rpc("resumo_do_documento", { p_documento: id });
    expect(resumo).toEqual([{ destinatarios: esperadas.length, confirmadas: 0, divergencias: 0 }]);
  });

  it("cada pessoa alcançada com usuário ativo recebe a notificação — e só elas", async () => {
    const { data: usuarios } = await admin
      .from("usuarios")
      .select("id")
      .in("pessoa_id", esperadas)
      .eq("status", "ativo");
    const { data: avisos } = await admin
      .from("notificacoes")
      .select("usuario_id, canal, assunto")
      .eq("referencia_id", id);

    expect((avisos ?? []).map((a) => a.usuario_id).sort()).toEqual(
      (usuarios ?? []).map((u) => u.id).sort(),
    );
    expect(avisos![0]).toMatchObject({ canal: "portal", assunto: "Novo documento: F3.1 comunicado do 042" });
  });

  it("a funcionária do 042 passa a ver o documento e o aviso, sem ciência dada", async () => {
    const maria = await como(EMAILS.maria);
    const { data: docs } = await maria.from("documentos").select("id").eq("id", id);
    expect(docs).toEqual([{ id }]);
    const { data: avisos } = await maria.from("notificacoes").select("id").eq("referencia_id", id);
    expect(avisos).toHaveLength(1);
    const { data: ciencias } = await maria.from("ciencias").select("id").eq("documento_id", id);
    expect(ciencias).toEqual([]);
  });

  it("a publicação fica na auditoria com o número de destinatários", async () => {
    const { data } = await admin
      .from("auditoria")
      .select("detalhes")
      .eq("acao", "publicar")
      .eq("entidade_id", id);
    expect(data).toHaveLength(1);
    expect(data![0].detalhes).toMatchObject({ destinatarios: esperadas.length, versao: 1 });
  });

  it("publicado não se altera nem se apaga — nem pelo client de quem publicou", async () => {
    const rh = await como(EMAILS.rhDp);

    const titulo = await rh.from("documentos").update({ titulo: "outro" }).eq("id", id).select("id");
    expect(titulo.error?.code).toBe("55000");

    const volta = await rh.from("documentos").update({ status: "rascunho" }).eq("id", id).select("id");
    expect(volta.error?.code).toBe("55000");

    const apaga = await rh.from("documentos").delete().eq("id", id).select("id");
    // A policy só alcança rascunho: 0 linhas, e a linha continua lá.
    expect(apaga.data ?? []).toEqual([]);
    const { data } = await admin.from("documentos").select("id").eq("id", id);
    expect(data).toHaveLength(1);
  });

  it("o público de um publicado não muda", async () => {
    const rh = await como(EMAILS.rhDp);
    const { error } = await rh
      .from("documento_destinatarios")
      .insert({ documento_id: id, contrato_id: C042, funcao: "Porteiro" });
    expect(error?.code).toBe("42501");
  });

  describe("retificação", () => {
    let v2: string;

    it("cria a versão 2 como rascunho; a versão 1 continua publicada", async () => {
      const { retificarDocumento } = await actionsComo(EMAILS.rhDp);
      v2 = exigirOk(
        await retificarDocumento(
          formulario({ documento_id: id, titulo: "F3.1 comunicado do 042 (corrigido)" }),
        ),
      ).id;
      criados.add(v2);

      const { data } = await admin
        .from("documentos")
        .select("id, versao, status, substitui_id, escopo")
        .in("id", [id, v2]);
      const porId = Object.fromEntries((data ?? []).map((d) => [d.id, d]));
      expect(porId[v2]).toMatchObject({ versao: 2, status: "rascunho", substitui_id: id, escopo: "coletivo" });
      expect(porId[id]).toMatchObject({ status: "publicado" });

      // Mesmo público, copiado do original.
      const { data: publicos } = await admin
        .from("documento_destinatarios")
        .select("contrato_id, unidade_id, funcao")
        .eq("documento_id", v2);
      expect(publicos).toEqual([{ contrato_id: C042, unidade_id: null, funcao: null }]);
    });

    it("uma segunda retificação da mesma versão é recusada", async () => {
      const { retificarDocumento } = await actionsComo(EMAILS.rhDp);
      const r = await retificarDocumento(formulario({ documento_id: id, titulo: "de novo" }));
      expect(r.ok).toBe(false);
    });

    it("publicar a versão 2 arquiva a 1 e gera pendência nova", async () => {
      const { publicarDocumento } = await actionsComo(EMAILS.rhDp);
      exigirOk(await publicarDocumento({ documento_id: v2, prazo_ciencia: hojeMais(10) }));

      const { data } = await admin.from("documentos").select("id, status, prazo_ciencia").in("id", [id, v2]);
      const porId = Object.fromEntries((data ?? []).map((d) => [d.id, d]));
      expect(porId[id].status).toBe("arquivado");
      expect(porId[v2]).toMatchObject({ status: "publicado", prazo_ciencia: hojeMais(10) });

      const { data: avisos } = await admin
        .from("notificacoes")
        .select("assunto")
        .eq("referencia_id", v2);
      expect(avisos!.length).toBeGreaterThan(0);
      expect(avisos![0].assunto).toMatch(/^Documento retificado: /);

      // A funcionária vê a versão 2, não a 1: ela não respondeu a v1, então
      // não há prova a preservar (contraponto do caso da 0016, mais abaixo).
      const maria = await como(EMAILS.maria);
      const { data: visiveis } = await maria.from("documentos").select("id").in("id", [id, v2]);
      expect(visiveis).toEqual([{ id: v2 }]);
    });

    it("arquivado não volta a publicado", async () => {
      const rh = await como(EMAILS.rhDp);
      const { error } = await rh.from("documentos").update({ status: "publicado" }).eq("id", id).select("id");
      expect(error?.code).toBe("55000");
    });
  });
});

describe("escrita respeita categoria e escopo (0015)", () => {
  it("Contratos/Coordenação (só jornada) não cria holerite — nem pela action, nem direto", async () => {
    const { criarRascunho } = await actionsComo(EMAILS.contratos);
    const r = await criarRascunho(
      formulario({
        tipo_id: TIPOS.holerite,
        titulo: "F3.1 holerite indevido",
        escopo: "individual",
        pessoa_id: PESSOA_JOAO,
      }),
    );
    expect(r.ok).toBe(false);

    // Insert sem RETURNING: antes da 0015 passava, só não era lido de volta.
    const contratos = await como(EMAILS.contratos);
    const { error } = await contratos.from("documentos").insert({
      org_id: "1fac8b3c-4860-5606-836b-ca4c8dd420d0",
      tipo_id: TIPOS.holerite,
      escopo: "individual",
      pessoa_id: PESSOA_JOAO,
      titulo: "F3.1 holerite direto",
      arquivo_path: "teste/nao-existe.pdf",
      arquivo_hash: "0".repeat(64),
    });
    expect(error?.code).toBe("42501");

    const { data } = await admin.from("documentos").select("id").like("titulo", "F3.1 holerite %");
    expect(data).toEqual([]);
  });

  it("contraponto: RH/DP (tem folha) cria o mesmo holerite, e descarta o rascunho", async () => {
    const { criarRascunho, descartarRascunho } = await actionsComo(EMAILS.rhDp);
    const { id } = exigirOk(
      await criarRascunho(
        formulario({
          tipo_id: TIPOS.holerite,
          titulo: "F3.1 holerite do RH",
          escopo: "individual",
          pessoa_id: PESSOA_JOAO,
        }),
      ),
    );
    criados.add(id);
    const { data: antes } = await admin.from("documentos").select("arquivo_path").eq("id", id).single();

    expect(await descartarRascunho({ documento_id: id })).toEqual({ ok: true });
    const { data: depois } = await admin.from("documentos").select("id").eq("id", id);
    expect(depois).toEqual([]);
    const { data: arquivo } = await admin.storage.from("documentos").download(antes!.arquivo_path);
    expect(arquivo).toBeNull();
  });

  it("ninguém insere documento já publicado — publicar é sempre transição", async () => {
    const rh = await como(EMAILS.rhDp);
    const { error } = await rh.from("documentos").insert({
      org_id: "1fac8b3c-4860-5606-836b-ca4c8dd420d0",
      tipo_id: TIPOS.comunicado,
      escopo: "individual",
      pessoa_id: PESSOA_JOAO,
      titulo: "F3.1 publicado direto",
      arquivo_path: "teste/nao-existe.pdf",
      arquivo_hash: "0".repeat(64),
      status: "publicado",
    });
    expect(error?.code).toBe("42501");
  });

  it("Suporte/Auditoria (só documentos:ver) não cria nem publica", async () => {
    const { criarRascunho, publicarDocumento } = await actionsComo(EMAILS.suporte);
    const r = await criarRascunho(
      formulario({
        tipo_id: TIPOS.comunicado,
        titulo: "F3.1 do suporte",
        escopo: "individual",
        pessoa_id: PESSOA_JOAO,
      }),
    );
    expect(r).toMatchObject({ ok: false });
    const p = await publicarDocumento({ documento_id: crypto.randomUUID(), prazo_ciencia: "" });
    expect(p).toMatchObject({ ok: false });
  });

  it("o bucket é fechado: nem quem pode ler o documento baixa direto do Storage", async () => {
    const { criarRascunho, publicarDocumento } = await actionsComo(EMAILS.rhDp);
    const { id } = exigirOk(
      await criarRascunho(
        formulario({
          tipo_id: TIPOS.comunicado,
          titulo: "F3.1 comunicado da Maria",
          escopo: "individual",
          pessoa_id: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c",
        }),
      ),
    );
    criados.add(id);
    exigirOk(await publicarDocumento({ documento_id: id, prazo_ciencia: "" }));

    const { data: doc } = await admin.from("documentos").select("arquivo_path").eq("id", id).single();
    const maria = await como(EMAILS.maria);
    // Contraponto: a RLS deixa a Maria ler a linha…
    const { data: linha } = await maria.from("documentos").select("id").eq("id", id);
    expect(linha).toEqual([{ id }]);
    // …e mesmo assim o arquivo só sai pela rota do servidor (F3.2).
    const { data: arquivo, error } = await maria.storage.from("documentos").download(doc!.arquivo_path);
    expect(arquivo).toBeNull();
    expect(error).not.toBeNull();
    const rh = await como(EMAILS.rhDp);
    const { data: assinada } = await rh.storage.from("documentos").createSignedUrl(doc!.arquivo_path, 60);
    expect(assinada).toBeNull();
  });
});

describe("titular lê o que já respondeu, mesmo arquivado (0016)", () => {
  let v1: string;
  let v2: string;
  let ciencia: string;
  let hashV1: string;

  beforeAll(async () => {
    const { criarRascunho, publicarDocumento } = await actionsComo(EMAILS.rhDp);
    v1 = exigirOk(
      await criarRascunho(
        formulario({
          tipo_id: TIPO_ESPELHO,
          titulo: "F3.1 espelho da Maria",
          escopo: "individual",
          pessoa_id: MARIA.pessoaId,
        }),
      ),
    ).id;
    criados.add(v1);
    exigirOk(await publicarDocumento({ documento_id: v1, prazo_ciencia: "" }));
    hashV1 = (await admin.from("documentos").select("arquivo_hash").eq("id", v1).single()).data!
      .arquivo_hash;
    ciencia = await mariaResponde(v1, "confirmacao");
  }, 30_000);

  it("a versão 2 em rascunho não aparece para a titular", async () => {
    const { retificarDocumento } = await actionsComo(EMAILS.rhDp);
    v2 = exigirOk(
      await retificarDocumento(formulario({ documento_id: v1, titulo: "F3.1 espelho da Maria (v2)" })),
    ).id;
    criados.add(v2);

    const maria = await como(EMAILS.maria);
    const { data } = await maria.from("documentos").select("id").in("id", [v1, v2]);
    expect(data).toEqual([{ id: v1 }]);
  });

  it("publicada a v2, a v1 arquivada continua legível para quem a confirmou", async () => {
    const { publicarDocumento } = await actionsComo(EMAILS.rhDp);
    exigirOk(await publicarDocumento({ documento_id: v2, prazo_ciencia: "" }));

    const { data: estado } = await admin.from("documentos").select("status").eq("id", v1).single();
    expect(estado!.status).toBe("arquivado");

    const maria = await como(EMAILS.maria);
    const { data } = await maria.from("documentos").select("id, status, versao").in("id", [v1, v2]);
    expect((data ?? []).sort((a, b) => a.versao - b.versao)).toEqual([
      { id: v1, status: "arquivado", versao: 1 },
      { id: v2, status: "publicado", versao: 2 },
    ]);
  });

  it("a ciência da v1 continua rastreável: versão, hash e o documento a que aponta", async () => {
    const maria = await como(EMAILS.maria);
    const { data } = await maria
      .from("ciencias")
      .select("id, tipo, documento_versao, documento_hash, protocolo, documentos(id, status)")
      .eq("id", ciencia)
      .single();
    expect(data).toMatchObject({
      tipo: "confirmacao",
      documento_versao: 1,
      documento_hash: hashV1,
      documentos: { id: v1, status: "arquivado" },
    });
    expect(data!.protocolo).toMatch(/^\d{4}-\d{6}$/);
  });

  it("a v2 exige ciência nova: a da v1 não vale para ela", async () => {
    const maria = await como(EMAILS.maria);
    const { data } = await maria.from("ciencias").select("id").eq("documento_id", v2);
    expect(data).toEqual([]);
  });

  it("terceiro sem `editar` continua sem ver arquivado — a regra nova é só do titular", async () => {
    const suporte = await como(EMAILS.suporte);
    const { data } = await suporte.from("documentos").select("id").eq("id", v1);
    expect(data).toEqual([]);
  });
});

describe("ciência respeita a categoria do documento (0016)", () => {
  let aso: string;
  let divergencia: string;

  beforeAll(async () => {
    // ASO não tem tela no MVP (docs/06): o documento vem do fixture, a
    // ciência vem do client da titular.
    const { data, error } = await admin
      .from("documentos")
      .insert({
        org_id: ORG,
        tipo_id: TIPO_ASO,
        escopo: "individual",
        pessoa_id: MARIA.pessoaId,
        titulo: "F3.1 ASO da Maria",
        arquivo_path: `teste-f31/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "a".repeat(64),
        status: "publicado",
        publicado_em: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`fixture ASO: ${error.message}`);
    aso = data.id;
    criados.add(aso);
    divergencia = await mariaResponde(
      aso,
      "divergencia",
      "O exame de audiometria listado não foi realizado por mim.",
    );
  }, 30_000);

  it("Suporte/Auditoria (documentos:ver, sem médico) não lê a justificativa: 0 linhas", async () => {
    const suporte = await como(EMAILS.suporte);
    const { data } = await suporte.from("ciencias").select("id, justificativa").eq("id", divergencia);
    expect(data).toEqual([]);
  });

  it("contraponto: RH/DP (tem médico) lê a mesma ciência", async () => {
    const rh = await como(EMAILS.rhDp);
    const { data } = await rh.from("ciencias").select("id").eq("id", divergencia);
    expect(data).toEqual([{ id: divergencia }]);
  });

  it("a titular lê a própria ciência, qualquer categoria", async () => {
    const maria = await como(EMAILS.maria);
    const { data } = await maria.from("ciencias").select("id, justificativa").eq("id", divergencia);
    expect(data).toHaveLength(1);
    expect(data![0].justificativa).toMatch(/audiometria/);
  });

  it("Contratos/Coordenação (documentos:ver, só jornada) também não lê", async () => {
    const contratos = await como(EMAILS.contratos);
    const { data } = await contratos.from("ciencias").select("id").eq("id", divergencia);
    expect(data).toEqual([]);
  });
});
