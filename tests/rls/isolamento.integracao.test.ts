import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clienteDeFixture,
  como,
  CONTRATOS,
  criarDocumento,
  exigir,
  ORG,
  PERFIL_FISCAL,
  PERSONAS,
  SENHA,
  TIPOS,
  type Cliente,
} from "./apoio";

/**
 * Isolamento — docs/03, "Como testar a RLS".
 *
 * Organização contra organização, contratante sem escopo, auditoria fora do
 * alcance do cliente, interno sem escopo vendo a organização, e ciência
 * imutável.
 *
 * O contratante sem escopo não existe no seed (todos os quatro têm escopo),
 * então o fixture cria um: usuário de Auth + `usuarios` + perfil de fiscal, e
 * nenhuma linha em `usuario_escopos`. Para "0 linhas em tudo" provar algo,
 * cada tabela verificada precisa TER linha — por isso o fixture também cria
 * documento, destinatário, ciência, solicitação e evento de auditoria.
 */

const EMAIL_SEM_ESCOPO = "contratante.sem.escopo@teste-rls.invalid";
const CNPJ_ORG_Y = "00000000000191";
const SLUG_ORG_Y = "teste-rls-org-y";

let admin: Cliente;

let usuarioSemEscopo: string | null = null;
let orgY: string | null = null;
let contratoY: string | null = null;
let contratanteY: string | null = null;
const documentos: string[] = [];
let ciencia: string | null = null;
let solicitacao: string | null = null;
let eventoAuditoria: number | null = null;

async function removerSobras() {
  // Sobras de uma execução que morreu. Tudo aqui é identificado por valor que
  // só este arquivo usa — nada do seed é tocado.
  const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of usuarios?.users ?? []) {
    if (u.email === EMAIL_SEM_ESCOPO) {
      await admin.from("usuarios").delete().eq("id", u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  const { data: orgs } = await admin.from("organizacoes").select("id").eq("slug", SLUG_ORG_Y);
  for (const o of orgs ?? []) {
    await admin.from("contratos").delete().eq("org_id", o.id);
    await admin.from("organizacoes").delete().eq("id", o.id);
  }
}

beforeAll(async () => {
  admin = clienteDeFixture();
  await removerSobras();

  const escopoRh = exigir(
    await admin.from("usuario_escopos").select("id").eq("usuario_id", PERSONAS.rhDp.id),
    "escopo do RH/DP",
  );
  if (escopoRh.length > 0) {
    throw new Error(
      "RH/DP tem escopo cadastrado, e no seed ele é escopo total. Outro teste deixou sujeira: " +
        "apague usuario_escopos do RH/DP e rode de novo.",
    );
  }

  // --- Organização Y, com um contrato próprio
  orgY = exigir(
    await admin
      .from("organizacoes")
      .insert({ nome: "Teste RLS Org Y", cnpj: CNPJ_ORG_Y, slug: SLUG_ORG_Y })
      .select("id")
      .single(),
    "org Y",
  ).id;
  contratanteY = exigir(
    await admin
      .from("contratantes")
      .insert({ org_id: orgY, nome: "Cliente da Org Y" })
      .select("id")
      .single(),
    "contratante Y",
  ).id;
  contratoY = exigir(
    await admin
      .from("contratos")
      .insert({ org_id: orgY, contratante_id: contratanteY, numero: "Y-001" })
      .select("id")
      .single(),
    "contrato Y",
  ).id;

  // --- Contratante sem escopo
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: EMAIL_SEM_ESCOPO,
    password: SENHA,
    email_confirm: true,
  });
  if (error || !criado.user) throw new Error(`fixture (auth sem escopo): ${error?.message}`);
  usuarioSemEscopo = criado.user.id;
  exigir(
    await admin
      .from("usuarios")
      .insert({
        id: usuarioSemEscopo,
        org_id: ORG,
        tipo: "contratante",
        nome: "Teste RLS contratante sem escopo",
        email_login: EMAIL_SEM_ESCOPO,
      })
      .select("id"),
    "usuário sem escopo",
  );
  exigir(
    await admin
      .from("usuario_perfis")
      .insert({ usuario_id: usuarioSemEscopo, perfil_id: PERFIL_FISCAL })
      .select("usuario_id"),
    "perfil do sem escopo",
  );

  // --- Dados para "0 linhas em tudo" não ser 0 por tabela vazia
  const coletivo = await criarDocumento(admin, {
    tipo_id: TIPOS.comunicado,
    escopo: "coletivo",
    status: "publicado",
    titulo: "RLS isolamento coletivo 042",
  });
  documentos.push(coletivo);
  exigir(
    await admin
      .from("documento_destinatarios")
      .insert({ documento_id: coletivo, contrato_id: CONTRATOS.c042 })
      .select("id"),
    "destinatário",
  );

  const daMaria = await criarDocumento(admin, {
    tipo_id: TIPOS.comunicado,
    escopo: "individual",
    pessoa_id: PERSONAS.maria.pessoaId,
    status: "publicado",
    titulo: "RLS isolamento comunicado da Maria",
  });
  documentos.push(daMaria);

  ciencia = exigir(
    await admin
      .from("ciencias")
      .insert({
        org_id: ORG,
        documento_id: daMaria,
        documento_versao: 1,
        documento_hash: "0".repeat(64),
        pessoa_id: PERSONAS.maria.pessoaId,
        usuario_id: PERSONAS.maria.id,
        tipo: "confirmacao",
      })
      .select("id")
      .single(),
    "ciência",
  ).id;

  solicitacao = exigir(
    await admin
      .from("solicitacoes")
      .insert({
        org_id: ORG,
        tipo: "suporte",
        titulo: "RLS isolamento solicitação",
        pessoa_id: PERSONAS.maria.pessoaId,
        contrato_id: CONTRATOS.c042,
        aberta_por: PERSONAS.maria.id,
      })
      .select("id")
      .single(),
    "solicitação",
  ).id;
  // Mudança de status: o trigger grava o evento em solicitacao_eventos.
  exigir(
    await admin
      .from("solicitacoes")
      .update({ status: "em_analise" })
      .eq("id", solicitacao)
      .select("id"),
    "status da solicitação",
  );

  eventoAuditoria = exigir(
    await admin
      .from("auditoria")
      .insert({ org_id: ORG, acao: "teste_rls", entidade: "teste_rls_isolamento" })
      .select("id")
      .single(),
    "auditoria",
  ).id;
}, 60_000);

afterAll(async () => {
  if (!admin) return;
  if (eventoAuditoria !== null) await admin.from("auditoria").delete().eq("id", eventoAuditoria);
  if (solicitacao) await admin.from("solicitacoes").delete().eq("id", solicitacao);
  // Ciência bloqueia o delete do documento (FK restrict). Só o fixture apaga
  // ciência — nenhum usuário do Portal consegue.
  if (ciencia) await admin.from("ciencias").delete().eq("id", ciencia);
  if (documentos.length > 0) await admin.from("documentos").delete().in("id", documentos);
  if (contratoY) await admin.from("contratos").delete().eq("id", contratoY);
  if (orgY) await admin.from("organizacoes").delete().eq("id", orgY);
  if (usuarioSemEscopo) {
    await admin.from("usuarios").delete().eq("id", usuarioSemEscopo);
    await admin.auth.admin.deleteUser(usuarioSemEscopo);
  }
});

describe("organização contra organização", () => {
  it("Admin geral da org X consulta contratos e não recebe nenhum da org Y", async () => {
    const adminGeral = await como(PERSONAS.adminGeral.email);

    const { data: todos } = await adminGeral.from("contratos").select("id, org_id");
    expect(todos!.length).toBeGreaterThan(0);
    expect(todos!.filter((c) => c.org_id !== ORG)).toEqual([]);

    const { data: porId } = await adminGeral.from("contratos").select("id").eq("id", contratoY!);
    expect(porId).toEqual([]);

    const { data: contratante } = await adminGeral
      .from("contratantes")
      .select("id")
      .eq("id", contratanteY!);
    expect(contratante).toEqual([]);
  });
});

describe("interno sem escopo (RH/DP)", () => {
  it("vê todos os contratos da própria organização", async () => {
    const esperados = exigir(
      await admin.from("contratos").select("id").eq("org_id", ORG),
      "contratos da org",
    )
      .map((c) => c.id)
      .sort();

    const rh = await como(PERSONAS.rhDp.email);
    const { data } = await rh.from("contratos").select("id");
    expect((data ?? []).map((c) => c.id).sort()).toEqual(esperados);
  });
});

describe("auditoria", () => {
  it("fiscal tenta ler auditoria: 0 linhas", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    const { data, error } = await fiscal.from("auditoria").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("Admin geral lê o mesmo evento — o 0 acima não é tabela vazia", async () => {
    const adminGeral = await como(PERSONAS.adminGeral.email);
    const { data } = await adminGeral.from("auditoria").select("id").eq("id", eventoAuditoria!);
    expect(data).toHaveLength(1);
  });

  it("nem o Admin geral altera ou apaga evento: erro de permissão", async () => {
    const adminGeral = await como(PERSONAS.adminGeral.email);

    const alterar = await adminGeral
      .from("auditoria")
      .update({ acao: "reescrita" })
      .eq("id", eventoAuditoria!);
    expect(alterar.error?.code).toBe("42501");

    const apagar = await adminGeral.from("auditoria").delete().eq("id", eventoAuditoria!);
    expect(apagar.error?.code).toBe("42501");

    const { data } = await admin.from("auditoria").select("acao").eq("id", eventoAuditoria!);
    expect(data).toEqual([{ acao: "teste_rls" }]);
  });
});

describe("ciência é imutável (invariante 7)", () => {
  it("o titular lê a própria ciência", async () => {
    const maria = await como(PERSONAS.maria.email);
    const { data } = await maria.from("ciencias").select("id").eq("id", ciencia!);
    expect(data).toHaveLength(1);
  });

  it("funcionário tenta update em ciencias e recebe erro de permissão", async () => {
    const maria = await como(PERSONAS.maria.email);

    const { data, error } = await maria
      .from("ciencias")
      .update({ tipo: "divergencia", justificativa: "tentando reescrever a ciência" })
      .eq("id", ciencia!)
      .select("id");

    // 42501 = insufficient_privilege. "0 linhas afetadas, sem erro" NÃO basta:
    // quem chama não distingue "não pode" de "não encontrou".
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();

    const intacta = exigir(
      await admin.from("ciencias").select("tipo, justificativa").eq("id", ciencia!).single(),
      "ciência depois do update",
    );
    expect(intacta).toEqual({ tipo: "confirmacao", justificativa: null });
  });

  it("funcionário tenta apagar a ciência e recebe erro de permissão", async () => {
    const maria = await como(PERSONAS.maria.email);

    const { error } = await maria.from("ciencias").delete().eq("id", ciencia!);
    expect(error?.code).toBe("42501");

    const { data } = await admin.from("ciencias").select("id").eq("id", ciencia!);
    expect(data).toHaveLength(1);
  });
});

describe("contratante sem escopo cadastrado", () => {
  const TABELAS = [
    "contratantes",
    "contratos",
    "unidades",
    "contrato_unidades",
    "pessoas",
    "alocacoes",
    "documentos",
    "documento_destinatarios",
    "ciencias",
    "solicitacoes",
    "solicitacao_eventos",
    "auditoria",
  ] as const;

  for (const tabela of TABELAS) {
    it(`0 linhas em ${tabela}`, async () => {
      // Sanidade: a tabela tem linha na organização, senão o 0 não prova nada.
      const { count } = await admin.from(tabela).select("*", { count: "exact", head: true });
      expect(count, `fixture: ${tabela} está vazia`).toBeGreaterThan(0);

      const semEscopo = await como(EMAIL_SEM_ESCOPO);
      const { data, error } = await semEscopo.from(tabela).select("*").limit(5);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  }

  it("em usuarios, só a própria linha", async () => {
    const semEscopo = await como(EMAIL_SEM_ESCOPO);
    const { data } = await semEscopo.from("usuarios").select("id");
    expect(data).toEqual([{ id: usuarioSemEscopo }]);
  });
});
