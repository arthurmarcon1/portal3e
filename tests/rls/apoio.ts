import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Apoio dos testes de RLS (F2.3).
 *
 * Duas portas, e a diferença entre elas é o teste inteiro:
 *
 * - `clienteDeFixture()` usa `service_role`. Serve para PREPARAR e LIMPAR —
 *   criar documento, dar escopo, apagar no fim. Nunca aparece dentro de um
 *   `it` para ler o resultado que está sendo verificado.
 * - `como(persona)` devolve um client anônimo autenticado como a persona. É o
 *   único jeito de a resposta vir da RLS: com `service_role`, a policy nem
 *   chega a ser avaliada e o teste provaria nada.
 *
 * Um login por persona por arquivo: o Auth limita sign-in a 30 por 5 minutos
 * por IP, e a suíte inteira divide esse limite.
 */

export type Cliente = SupabaseClient<Database>;

export const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
export const SENHA = "portal3e2026";

/** Personas do seed (supabase/seed.sql). Senha única: `SENHA`. */
export const PERSONAS = {
  adminGeral: { email: "admin_geral@3e.com.br", id: "460759de-e5a3-5bf7-92ad-41ca4ac4f9a6" },
  /** pessoas:V C E R · documentos:V C E R · categorias medico, folha, pessoal, jornada. */
  rhDp: { email: "rh_dp@3e.com.br", id: "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3" },
  /** documentos:V C E R · só a categoria jornada. */
  contratos: { email: "contratos@3e.com.br", id: "9e5217c3-52f4-5b8c-bb99-3f3a0342f7e9" },
  /** documentos:V, sem editar. administracao:V. */
  suporte: { email: "suporte_auditoria@3e.com.br", id: "e32f544e-472f-58d5-8c6f-40c0272bc44c" },
  /** Contratante, escopo no contrato 042. */
  fiscal: { email: "fiscal@hsaolucas.com.br", id: "4a2ade92-25e1-58f2-afda-9198dd3da8df" },
  /** Funcionária alocada no 042. */
  maria: {
    email: "01000791998@func.3e.portal3e",
    id: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2",
    pessoaId: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c",
  },
} as const;

/** Funcionário B: tem usuário, mas nenhum caso aqui entra como ele. */
export const PESSOA_JOAO = "8605334e-658a-5360-a78a-79e3ff3736e8";

export const PERFIL_FISCAL = "cb994b78-0287-5a88-b97d-bd99968e1a04";

export const CONTRATOS = {
  c042: "d594b950-e556-5f78-ae9b-98f6b1d12b63",
  c043: "3d8b84f9-d552-59f1-897f-80a440afd718",
  c077: "e716f5c1-3603-596b-a331-1d307ccf82f3",
} as const;

export const TIPOS = {
  espelho: "941fb37f-659c-5222-9dfd-f2fc3b893e37", // jornada
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2", // geral
  aso: "a5ea6ce3-223a-5b48-b69c-9be2c7bcc720", // medico
  holerite: "485e0b90-d471-5f86-ac73-b942a9d8759e", // folha
} as const;

function ambiente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    // Falha alto: teste de RLS que não roda é pior que teste ausente.
    throw new Error(
      "Credenciais do Supabase ausentes. Os testes de RLS precisam do banco de verdade: " +
        "rode `npm test` (ele escolhe o alvo) — ver a seção Testes do CLAUDE.md.",
    );
  }
  return { url, anon, service };
}

/** `service_role`. SÓ para preparar e limpar fixture. */
export function clienteDeFixture(): Cliente {
  const { url, service } = ambiente();
  return createClient<Database>(url, service, { auth: { persistSession: false } });
}

const sessoes = new Map<string, Cliente>();

/** Client anônimo autenticado — a resposta que ele recebe é a da RLS. */
export async function como(email: string, senha = SENHA): Promise<Cliente> {
  const existente = sessoes.get(email);
  if (existente) return existente;

  const { url, anon } = ambiente();
  const cliente = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { error } = await cliente.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`não foi possível autenticar ${email}: ${error.message}`);

  sessoes.set(email, cliente);
  return cliente;
}

/** Falha o fixture com a mensagem do banco, em vez de seguir com `undefined`. */
export function exigir<T>(
  // A resposta do supabase-js é união de sucesso e erro; `NonNullable` tira o
  // `null` do ramo de erro, que o `throw` abaixo já descartou.
  resultado: { data: T; error: { message: string } | null },
  contexto: string,
): NonNullable<T> {
  if (resultado.error) throw new Error(`fixture (${contexto}): ${resultado.error.message}`);
  if (resultado.data === null || resultado.data === undefined) {
    throw new Error(`fixture (${contexto}): sem dados`);
  }
  return resultado.data;
}

/** Uma linha de `usuario_escopos`: contrato, unidade, ou os dois. */
export type LinhaDeEscopo = { contrato_id?: string | null; unidade_id?: string | null };

/**
 * Troca o escopo de um usuário pelo que o teste precisa e devolve a função que
 * desfaz a troca. Lista vazia é "sem escopo" — alcance total, para interno.
 *
 * Teste só apaga o que ele próprio criou. Este é o único jeito de um teste
 * mexer no escopo de quem já existe:
 *
 * - o escopo original é lido **antes** de qualquer escrita, inteiro (com o
 *   `id`), e é devolvido por `upsert` — a mesma linha, não uma parecida;
 * - o que o teste insere é apagado **pelo id**, nunca por `usuario_id`;
 * - se a troca falhar no meio, ela se desfaz antes de propagar o erro — a
 *   preparação que falha não deixa o usuário sem o escopo dele;
 * - chamar a devolução duas vezes é inofensivo.
 *
 * Trocas encaixadas no mesmo usuário se desfazem na ordem inversa.
 */
export async function trocarEscopo(
  admin: Cliente,
  usuarioId: string,
  novo: LinhaDeEscopo[],
): Promise<() => Promise<void>> {
  const originais = exigir(
    await admin
      .from("usuario_escopos")
      .select("id, usuario_id, contrato_id, unidade_id, criado_em")
      .eq("usuario_id", usuarioId),
    `escopo original de ${usuarioId}`,
  );
  const criados: string[] = [];
  let devolvido = false;

  async function devolver() {
    if (devolvido) return;
    if (criados.length > 0) {
      const { error } = await admin.from("usuario_escopos").delete().in("id", criados);
      if (error) throw new Error(`devolver escopo de ${usuarioId} (apagar o do teste): ${error.message}`);
    }
    if (originais.length > 0) {
      const { error } = await admin.from("usuario_escopos").upsert(originais);
      if (error) throw new Error(`devolver escopo de ${usuarioId} (repor o original): ${error.message}`);
    }
    devolvido = true;
  }

  try {
    if (originais.length > 0) {
      const { error } = await admin
        .from("usuario_escopos")
        .delete()
        .in("id", originais.map((o) => o.id));
      if (error) throw new Error(`trocar escopo de ${usuarioId}: ${error.message}`);
    }
    if (novo.length > 0) {
      const linhas = exigir(
        await admin
          .from("usuario_escopos")
          .insert(novo.map((n) => ({ usuario_id: usuarioId, contrato_id: n.contrato_id ?? null, unidade_id: n.unidade_id ?? null })))
          .select("id"),
        `escopo de teste de ${usuarioId}`,
      );
      criados.push(...linhas.map((l) => l.id));
    }
  } catch (erro) {
    await devolver();
    throw erro;
  }
  return devolver;
}

/**
 * Desfaz as trocas de escopo na ordem inversa e esvazia a lista. Tenta todas
 * antes de falhar: uma devolução que dá erro não pode deixar as outras de fora.
 */
export async function devolverEscopos(devolucoes: (() => Promise<void>)[]) {
  const erros: unknown[] = [];
  while (devolucoes.length > 0) {
    try {
      await devolucoes.pop()!();
    } catch (erro) {
      erros.push(erro);
    }
  }
  if (erros.length > 0) throw new AggregateError(erros, "falha ao devolver escopo — confira usuario_escopos à mão");
}

/**
 * Rastro que as Server Actions deixam em `auditoria` durante um arquivo de
 * teste. Marca o maior id **antes** do arquivo; no fim, apaga só o que veio
 * depois **e** tem o IP dublado do arquivo (`x-forwarded-for` do mock de
 * `next/headers`, sempre da faixa de documentação 203.0.113.0/24 — nenhum
 * usuário real tem esse IP). Os arquivos de integração rodam em série, então a
 * janela é deste arquivo. Sem marca (o beforeAll morreu antes), não apaga nada.
 */
export async function marcarAuditoria(admin: Cliente): Promise<number> {
  const { data, error } = await admin.from("auditoria").select("id").order("id", { ascending: false }).limit(1);
  if (error) throw new Error(`fixture (marca da auditoria): ${error.message}`);
  return data[0]?.id ?? 0;
}

export async function apagarAuditoriaDoArquivo(admin: Cliente, marca: number | null, ip: string) {
  if (marca === null) return;
  if (!ip.startsWith("203.0.113.")) throw new Error(`IP ${ip} não é de teste: a limpeza só apaga IP dublado`);
  const { error } = await admin.from("auditoria").delete().gt("id", marca).eq("ip", ip);
  if (error) throw new Error(`limpar auditoria do arquivo: ${error.message}`);
}

export type NovoDocumento = {
  tipo_id: string;
  escopo: "individual" | "coletivo";
  pessoa_id?: string | null;
  status: "rascunho" | "publicado";
  titulo: string;
};

/** Documento de fixture. O arquivo não existe: a RLS não olha o Storage. */
export async function criarDocumento(admin: Cliente, doc: NovoDocumento): Promise<string> {
  const { id } = exigir(
    await admin
      .from("documentos")
      .insert({
        org_id: ORG,
        tipo_id: doc.tipo_id,
        escopo: doc.escopo,
        pessoa_id: doc.pessoa_id ?? null,
        status: doc.status,
        titulo: doc.titulo,
        arquivo_path: `teste-rls/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "0".repeat(64),
        publicado_em: doc.status === "publicado" ? new Date().toISOString() : null,
      })
      .select("id")
      .single(),
    `documento ${doc.titulo}`,
  );
  return id;
}

/** Ids que a persona enxerga dentre os pedidos. */
export async function idsVisiveis(
  cliente: Cliente,
  tabela: "documentos" | "pessoas",
  ids: string[],
): Promise<string[]> {
  const { data, error } = await cliente.from(tabela).select("id").in("id", ids);
  if (error) throw new Error(`consulta em ${tabela}: ${error.message}`);
  return (data ?? []).map((l) => l.id).sort();
}
