import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Administração de acesso (F2.1), contra o banco de verdade.
 *
 * O que se prova aqui é o critério de aceite da Fase 2: **mudança de permissão
 * visível na auditoria com antes e depois**. Isso não dá para verificar num
 * dublê — envolve a policy de `perfil_permissoes`, o insert em `auditoria`
 * feito com `service_role` e o estado real das duas tabelas.
 *
 * O que é dublado é só o encanamento que não existe fora de uma requisição do
 * Next: o client vindo de cookie, os `headers()` e o `revalidatePath`.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

const SENHA = "portal3e2026";
/** Perfil SST do seed: poucas permissões, e nenhum outro teste depende dele. */
const PERFIL_SST = "840c335b-3dc4-59a9-8db6-29617ed44acb";

let admin: SupabaseClient<Database>;
let permissoesOriginais: { modulo: string; acao: string }[] = [];
const usuariosCriados: string[] = [];

function novoCliente(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes. Este teste precisa do banco: " +
        "veja a seção Testes do CLAUDE.md.",
    );
  }
  return createClient<Database>(url, anon, { auth: { persistSession: false } });
}

/** Liga as actions à persona pedida, com os módulos zerados. */
async function actionsComo(email: string) {
  const cliente = novoCliente();
  const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw new Error(`não foi possível autenticar ${email}: ${error.message}`);

  estado.cliente = cliente;
  // `getUsuario`/`permissoesDoUsuario` são memoizados com `cache()`: sem
  // resetar, a segunda persona leria a sessão da primeira.
  vi.resetModules();
  return import("./actions");
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("credenciais de teste ausentes.");
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  const { data } = await admin
    .from("perfil_permissoes")
    .select("modulo, acao")
    .eq("perfil_id", PERFIL_SST);
  permissoesOriginais = data ?? [];
}, 30_000);

afterAll(async () => {
  if (!admin) return;

  // O seed é fixture da suíte inteira: o perfil volta exatamente como estava.
  await admin.from("perfil_permissoes").delete().eq("perfil_id", PERFIL_SST);
  if (permissoesOriginais.length > 0) {
    await admin
      .from("perfil_permissoes")
      .insert(permissoesOriginais.map((p) => ({ ...p, perfil_id: PERFIL_SST })));
  }

  for (const id of usuariosCriados) {
    await admin.from("usuarios").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe("matriz de permissões do perfil", () => {
  it("grava a mudança e registra antes e depois na auditoria", async () => {
    const { alterarPermissoesDoPerfil } = await actionsComo("admin_geral@3e.com.br");

    const antes = permissoesOriginais.map((p) => `${p.modulo}:${p.acao}`).sort();

    // Uma concessão e uma revogação na mesma gravação. A concessão é escolhida
    // entre as que o perfil NÃO tem — fixar uma à mão dá duplicata silenciosa
    // no dia em que o seed passar a incluí-la.
    const revogada = antes[0];
    const concedida = ["administracao:excluir", "jornada:excluir", "comunicacao:excluir"].find(
      (p) => !antes.includes(p),
    )!;
    const depois = [...antes.filter((p) => p !== revogada), concedida].sort();

    const resultado = await alterarPermissoesDoPerfil({
      perfil_id: PERFIL_SST,
      permissoes: depois,
    });
    expect(resultado.ok).toBe(true);

    const { data: agora } = await admin
      .from("perfil_permissoes")
      .select("modulo, acao")
      .eq("perfil_id", PERFIL_SST);
    expect((agora ?? []).map((p) => `${p.modulo}:${p.acao}`).sort()).toEqual(depois);

    const { data: trilha } = await admin
      .from("auditoria")
      .select("acao, entidade, entidade_id, detalhes, ip")
      .eq("entidade_id", PERFIL_SST)
      .eq("acao", "mudar_permissoes_perfil")
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();

    expect(trilha?.entidade).toBe("perfis");
    const detalhes = trilha?.detalhes as {
      antes: string[];
      depois: string[];
      concedidas: string[];
      revogadas: string[];
    };
    expect(detalhes.antes).toEqual(antes);
    expect(detalhes.depois).toEqual(depois);
    expect(detalhes.concedidas).toEqual([concedida]);
    expect(detalhes.revogadas).toEqual([revogada]);
    // O IP entra pelo helper de auditoria, a partir do cabeçalho da requisição.
    expect(trilha?.ip).toBe("203.0.113.7");
  });

  it("não grava evento quando nada mudou", async () => {
    const { alterarPermissoesDoPerfil } = await actionsComo("admin_geral@3e.com.br");

    const { count: antes } = await admin
      .from("auditoria")
      .select("id", { count: "exact", head: true })
      .eq("entidade_id", PERFIL_SST);

    const { data: atuais } = await admin
      .from("perfil_permissoes")
      .select("modulo, acao")
      .eq("perfil_id", PERFIL_SST);

    const resultado = await alterarPermissoesDoPerfil({
      perfil_id: PERFIL_SST,
      permissoes: (atuais ?? []).map((p) => `${p.modulo}:${p.acao}`),
    });
    expect(resultado.ok).toBe(true);

    const { count: depois } = await admin
      .from("auditoria")
      .select("id", { count: "exact", head: true })
      .eq("entidade_id", PERFIL_SST);

    // Trilha só registra o que aconteceu. Gravar "mudou de X para X" a cada
    // clique em Salvar tornaria a auditoria inútil justamente quando ela
    // precisa ser lida.
    expect(depois).toBe(antes);
  });

  it("recusa quem tem administracao:ver mas não editar", async () => {
    // Suporte/Auditoria: enxerga a tela inteira e não muda nada (docs/02).
    const { alterarPermissoesDoPerfil } = await actionsComo(
      "suporte_auditoria@3e.com.br",
    );

    const resultado = await alterarPermissoesDoPerfil({
      perfil_id: PERFIL_SST,
      permissoes: [],
    });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toContain("permissão");

    const { count } = await admin
      .from("perfil_permissoes")
      .select("perfil_id", { count: "exact", head: true })
      .eq("perfil_id", PERFIL_SST);
    expect(count).toBeGreaterThan(0);
  });
});

describe("criação de usuário", () => {
  it("cria o funcionário com e-mail sintético e senha provisória, e audita", async () => {
    const { criarUsuario } = await actionsComo("admin_geral@3e.com.br");

    // Uma pessoa do seed que ainda não tem usuário.
    const { data: comUsuario } = await admin.from("usuarios").select("pessoa_id");
    const jaTem = new Set((comUsuario ?? []).flatMap((u) => (u.pessoa_id ? [u.pessoa_id] : [])));
    const { data: pessoas } = await admin.from("pessoas").select("id, nome, cpf").order("nome");
    const alvo = (pessoas ?? []).find((p) => !jaTem.has(p.id));
    expect(alvo).toBeDefined();

    const resultado = await criarUsuario({ tipo: "funcionario", pessoa_id: alvo!.id });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.dados.emailLogin).toBe(`${alvo!.cpf}@func.3e.portal3e`);
    expect(resultado.dados.senhaProvisoria).toHaveLength(10);

    const { data: criado } = await admin
      .from("usuarios")
      .select("id, tipo, pessoa_id, precisa_trocar_senha")
      .eq("email_login", resultado.dados.emailLogin)
      .single();

    usuariosCriados.push(criado!.id);
    expect(criado?.tipo).toBe("funcionario");
    expect(criado?.pessoa_id).toBe(alvo!.id);
    // Senha provisória só vale até o primeiro acesso (docs/03).
    expect(criado?.precisa_trocar_senha).toBe(true);

    const { data: trilha } = await admin
      .from("auditoria")
      .select("acao, detalhes")
      .eq("entidade_id", criado!.id)
      .eq("acao", "criar_usuario")
      .single();

    expect(trilha).not.toBeNull();
    // Credencial não entra na trilha: `auditoria` é lida pelo perfil de suporte.
    expect(JSON.stringify(trilha?.detalhes)).not.toContain(resultado.dados.senhaProvisoria);
  });

  it("consegue entrar com a senha provisória gerada", async () => {
    const { criarUsuario } = await actionsComo("admin_geral@3e.com.br");

    const { data: comUsuario } = await admin.from("usuarios").select("pessoa_id");
    const jaTem = new Set((comUsuario ?? []).flatMap((u) => (u.pessoa_id ? [u.pessoa_id] : [])));
    const { data: pessoas } = await admin.from("pessoas").select("id, cpf").order("cpf");
    const alvo = (pessoas ?? []).find((p) => !jaTem.has(p.id));

    const resultado = await criarUsuario({ tipo: "funcionario", pessoa_id: alvo!.id });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const { data: criado } = await admin
      .from("usuarios")
      .select("id")
      .eq("email_login", resultado.dados.emailLogin)
      .single();
    usuariosCriados.push(criado!.id);

    // O teste que importa: a senha mostrada na tela realmente entra.
    const cliente = novoCliente();
    const { error } = await cliente.auth.signInWithPassword({
      email: resultado.dados.emailLogin,
      password: resultado.dados.senhaProvisoria,
    });
    expect(error).toBeNull();
  });

  it("recusa criação por quem não tem administracao:criar", async () => {
    const { criarUsuario } = await actionsComo("rh_dp@3e.com.br");

    const resultado = await criarUsuario({
      tipo: "interno",
      nome: "Não Deve Existir",
      email: "nao.deve.existir@3e.com.br",
      telefone: "",
      perfis: [PERFIL_SST],
      escopo: { contratos: [], unidades: [] },
    });

    expect(resultado.ok).toBe(false);

    const { data } = await admin
      .from("usuarios")
      .select("id")
      .eq("email_login", "nao.deve.existir@3e.com.br");
    expect(data).toHaveLength(0);
  });
});
