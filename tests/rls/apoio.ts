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
