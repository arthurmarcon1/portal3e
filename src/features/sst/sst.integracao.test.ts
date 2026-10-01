import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { apagarAuditoriaDoArquivo, devolverEscopos, marcarAuditoria, trocarEscopo } from "../../../tests/rls/apoio";

/**
 * SST (F5.2), contra o banco de verdade:
 *
 * - ASO e treinamento publicados pelo MESMO fluxo de documentos, com a
 *   validade exigida pelo banco (0024) — e o mesmo prazo de ciência;
 * - painel de conformidade recortado pela RLS: quem não tem a categoria
 *   `medico` não vê linha de ASO; contraponto: o SST vê a mesma;
 * - alerta a 30 dias: só a quem tem `sst:editar` E enxerga o documento
 *   (categoria e escopo, calculados por destinatário); renovado, vencido ou
 *   longe não alerta; rodar duas vezes não duplica.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.52", "user-agent": "teste-f52" }),
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
  sst: "sst@3e.com.br",
  suporte: "suporte_auditoria@3e.com.br",
  contratos: "contratos@3e.com.br",
} as const;
const USUARIOS = {
  sst: "ea23d309-2920-594f-bfd3-27cc72a97b00",
  adminGeral: "460759de-e5a3-5bf7-92ad-41ca4ac4f9a6",
  rhDp: "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3",
  suporte: "e32f544e-472f-58d5-8c6f-40c0272bc44c",
} as const;
const C042 = "d594b950-e556-5f78-ae9b-98f6b1d12b63";
const C077 = "e716f5c1-3603-596b-a331-1d307ccf82f3";
const UNIDADE_CENTRAL = "79baf83d-a8c3-5a89-90bf-6ae7d29a2302";
const LOJA_CENTRO = "a6565dbb-e74b-5a93-9c62-4134b6f76473";
const TIPOS = {
  aso: "a5ea6ce3-223a-5b48-b69c-9be2c7bcc720",
  treinamento: "7107ffe8-b40f-5318-9c08-9f024cd3acff",
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2",
} as const;

function cpfValido(base: string): string {
  const dv = (s: string) => {
    const soma = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return String(r === 10 ? 0 : r);
  };
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
}

/** Fora da faixa do seed (01000791998–01023757044). */
const CPFS = { x: cpfValido("095200001"), y: cpfValido("095200002") };

function hoje(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function maisDias(n: number): string {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let admin: Cliente;
/** Maior id de `auditoria` antes do arquivo; `null` até o beforeAll marcar. */
let marcaAuditoria: number | null = null;
const IP_DO_ARQUIVO = "203.0.113.52";
const clientes = new Map<string, Cliente>();
const pessoas: { x?: string; y?: string } = {};
const documentos: string[] = [];
/** Trocas de escopo do SST, desfeitas na ordem inversa no afterAll. */
const devolucoes: (() => Promise<void>)[] = [];

/** ASO de X a vencer em 10 dias (042), publicado pela action no 1º teste. */
let asoX: string;
/** Treinamento de Y a vencer em 20 dias (077). */
let treinamentoY: string;
/** Controles que NÃO alertam. */
let asoRenovadoVelho: string;
let treinamentoVencido: string;
let treinamentoLonge: string;

function ambiente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error("Credenciais do Supabase ausentes. Este teste precisa do banco: rode `npm test`.");
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

function exigir<T>(r: { data: T; error: { message: string } | null }, contexto: string): NonNullable<T> {
  if (r.error) throw new Error(`fixture (${contexto}): ${r.error.message}`);
  if (r.data === null || r.data === undefined) throw new Error(`fixture (${contexto}): sem dados`);
  return r.data;
}

async function documento(campos: {
  tipo_id: string;
  pessoa_id?: string;
  escopo?: "individual" | "coletivo";
  titulo: string;
  status: "rascunho" | "publicado";
  valido_ate?: string;
}): Promise<string> {
  const id = exigir(
    await admin
      .from("documentos")
      .insert({
        org_id: ORG,
        escopo: "individual",
        arquivo_path: `teste-f52/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "0".repeat(64),
        publicado_em: campos.status === "publicado" ? new Date().toISOString() : null,
        ...campos,
      })
      .select("id")
      .single(),
    campos.titulo,
  ).id;
  documentos.push(id);
  return id;
}

async function modulosComo(email: string) {
  estado.cliente = await como(email);
  vi.resetModules();
  return { actions: await import("@/features/documentos/actions"), sst: await import("./queries") };
}

async function alertas(documento: string): Promise<string[]> {
  const { data } = await admin
    .from("notificacoes")
    .select("usuario_id")
    .eq("referencia_id", documento)
    .eq("motivo", "validade")
    .eq("canal", "email");
  return (data ?? []).map((n) => n.usuario_id).sort();
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });
  marcaAuditoria = await marcarAuditoria(admin);

  const { error: semMigracao } = await admin.from("documentos").select("valido_ate").limit(1);
  if (semMigracao) throw new Error(`migração 0024 ausente no alvo de teste: ${semMigracao.message}`);

  const colisao = exigir(await admin.from("pessoas").select("cpf").in("cpf", Object.values(CPFS)), "colisão");
  if (colisao.length > 0) throw new Error("CPF de teste já existe em pessoas — sobra de execução anterior. Apague à mão.");
  // O SST roda com o escopo que tiver — no seed, o do piloto (042, 043, 077 e o
  // quadro interno), que cobre X (042) e Y (077). O caso de alerta troca e devolve.

  pessoas.x = exigir(await admin.from("pessoas").insert({ org_id: ORG, nome: "Teste F52 Xavier", cpf: CPFS.x }).select("id").single(), "X").id;
  pessoas.y = exigir(await admin.from("pessoas").insert({ org_id: ORG, nome: "Teste F52 Yara", cpf: CPFS.y }).select("id").single(), "Y").id;
  exigir(
    await admin
      .from("alocacoes")
      .insert([
        { org_id: ORG, pessoa_id: pessoas.x, contrato_id: C042, unidade_id: UNIDADE_CENTRAL, funcao: "Vigia F52", data_inicio: "2026-01-05" },
        { org_id: ORG, pessoa_id: pessoas.y, contrato_id: C077, unidade_id: LOJA_CENTRO, funcao: "Repositora F52", data_inicio: "2026-01-05" },
      ])
      .select("id"),
    "alocações",
  );

  asoX = await documento({ tipo_id: TIPOS.aso, pessoa_id: pessoas.x, titulo: "ASO periódico F52", status: "rascunho" });
  treinamentoY = await documento({
    tipo_id: TIPOS.treinamento,
    pessoa_id: pessoas.y,
    titulo: "NR-35 Trabalho em altura F52",
    status: "publicado",
    valido_ate: maisDias(20),
  });
  // ASO antigo de Y, a vencer em 5 dias — mas já renovado por outro que vale um ano.
  asoRenovadoVelho = await documento({
    tipo_id: TIPOS.aso,
    pessoa_id: pessoas.y,
    titulo: "ASO admissional F52",
    status: "publicado",
    valido_ate: maisDias(5),
  });
  await documento({ tipo_id: TIPOS.aso, pessoa_id: pessoas.y, titulo: "ASO periódico F52", status: "publicado", valido_ate: maisDias(365) });
  treinamentoVencido = await documento({
    tipo_id: TIPOS.treinamento,
    pessoa_id: pessoas.y,
    titulo: "NR-10 F52",
    status: "publicado",
    valido_ate: maisDias(-3),
  });
  treinamentoLonge = await documento({
    tipo_id: TIPOS.treinamento,
    pessoa_id: pessoas.y,
    titulo: "NR-33 F52",
    status: "publicado",
    valido_ate: maisDias(45),
  });
}, 60_000);

afterAll(async () => {
  if (!admin) return;
  await apagarAuditoriaDoArquivo(admin, marcaAuditoria, IP_DO_ARQUIVO);
  try {
    if (documentos.length > 0) {
      await admin.from("notificacoes").delete().in("referencia_id", documentos);
      await admin.from("ciencias").delete().in("documento_id", documentos);
      await admin.from("documentos").delete().in("id", documentos);
    }
    const ids = Object.values(pessoas).filter(Boolean) as string[];
    if (ids.length > 0) {
      await admin.from("alocacoes").delete().in("pessoa_id", ids);
      await admin.from("pessoas").delete().in("id", ids);
    }
  } finally {
    await devolverEscopos(devolucoes);
  }
});

describe("publicação de ASO pelo fluxo de documentos", () => {
  it("sem 'válido até', o banco recusa com mensagem de tela", async () => {
    const { actions } = await modulosComo(EMAILS.sst);
    const r = await actions.publicarDocumento({ documento_id: asoX, prazo_ciencia: "", valido_ate: "" });
    expect(r).toEqual({ ok: false, erro: "Informe até quando o documento vale antes de publicar." });
  });

  it("com a validade, publica — com o prazo de ciência padrão, e a auditoria leva a validade", async () => {
    const { actions } = await modulosComo(EMAILS.sst);
    const r = await actions.publicarDocumento({ documento_id: asoX, prazo_ciencia: "", valido_ate: maisDias(10) });
    expect(r).toMatchObject({ ok: true });
    const { data } = await admin.from("documentos").select("status, valido_ate, prazo_ciencia").eq("id", asoX).single();
    expect(data).toEqual({ status: "publicado", valido_ate: maisDias(10), prazo_ciencia: maisDias(5) });
    const { data: log } = await admin
      .from("auditoria")
      .select("detalhes")
      .eq("entidade_id", asoX)
      .eq("acao", "publicar")
      .single();
    expect(log?.detalhes).toMatchObject({ valido_ate: maisDias(10) });
  });

  it("tipo que não vence ignora a data enviada", async () => {
    const comunicado = await documento({ tipo_id: TIPOS.comunicado, pessoa_id: pessoas.x, titulo: "Comunicado F52", status: "rascunho" });
    const { actions } = await modulosComo(EMAILS.sst);
    expect(await actions.publicarDocumento({ documento_id: comunicado, prazo_ciencia: "", valido_ate: maisDias(9) })).toMatchObject({ ok: true });
    const { data } = await admin.from("documentos").select("valido_ate").eq("id", comunicado).single();
    expect(data?.valido_ate).toBeNull();
  });
});

describe("painel de conformidade", () => {
  it("SST vê o ASO a vencer e o treinamento, cada um na unidade da pessoa", async () => {
    const { sst } = await modulosComo(EMAILS.sst);
    const linhas = await sst.painelDeConformidade();
    const aso = linhas.find((l) => l.documento_id === asoX);
    expect(aso).toMatchObject({ situacao: "a_vencer", dias: 10, pessoa_nome: "Teste F52 Xavier" });
    expect(aso!.lotacoes.map((l) => l.unidade_id)).toEqual([UNIDADE_CENTRAL]);
    expect(linhas.find((l) => l.documento_id === treinamentoVencido)).toMatchObject({ situacao: "vencido" });
    // ASO velho de Y foi renovado: não é linha; o vigente, em dia, é.
    expect(linhas.some((l) => l.documento_id === asoRenovadoVelho)).toBe(false);
  });

  it("Suporte (sst:ver, sem a categoria médico) não vê ASO nenhum — mas vê o treinamento", async () => {
    const { sst } = await modulosComo(EMAILS.suporte);
    const linhas = await sst.painelDeConformidade();
    expect(linhas.some((l) => l.tipo_nome === "ASO")).toBe(false);
    expect(linhas.some((l) => l.documento_id === treinamentoY)).toBe(true);
  });

  it("Contratos (sst:ver, categoria só jornada) idem", async () => {
    const { sst } = await modulosComo(EMAILS.contratos);
    const linhas = await sst.painelDeConformidade();
    expect(linhas.some((l) => l.documento_id === asoX)).toBe(false);
    expect(linhas.some((l) => l.documento_id === treinamentoVencido)).toBe(true);
  });
});

describe("alerta a 30 dias", () => {
  it("SST com escopo só no 077: recebe o treinamento de Y, não o ASO de X (042); Admin geral recebe os dois", async () => {
    devolucoes.push(await trocarEscopo(admin, USUARIOS.sst, [{ contrato_id: C077 }]));

    // Contraponto do cálculo por destinatário: é o mesmo que a RLS mostra a ele.
    const sst = await como(EMAILS.sst);
    const visiveis = (await sst.from("documentos").select("id").in("id", [asoX, treinamentoY])).data!.map((d) => d.id);
    expect(visiveis).toEqual([treinamentoY]);

    exigir(await admin.rpc("gerar_avisos_de_validade"), "job");
    expect(await alertas(treinamentoY)).toContain(USUARIOS.sst);
    expect(await alertas(asoX)).not.toContain(USUARIOS.sst);
    expect(await alertas(asoX)).toContain(USUARIOS.adminGeral);
    expect(await alertas(treinamentoY)).toContain(USUARIOS.adminGeral);
  });

  it("só sst:editar: RH/DP (sst:ver, com a categoria médico) e Suporte não recebem", async () => {
    for (const doc of [asoX, treinamentoY]) {
      expect(await alertas(doc)).not.toContain(USUARIOS.rhDp);
      expect(await alertas(doc)).not.toContain(USUARIOS.suporte);
    }
  });

  it("renovado, já vencido e longe (45 dias) não alertam — o de 20 dias, sim", async () => {
    expect(await alertas(asoRenovadoVelho)).toEqual([]);
    expect(await alertas(treinamentoVencido)).toEqual([]);
    expect(await alertas(treinamentoLonge)).toEqual([]);
    expect((await alertas(treinamentoY)).length).toBeGreaterThan(0);
  });

  it("de volta ao escopo original (que inclui o 042), o SST passa a receber o ASO de X — e o que já recebeu não repete", async () => {
    await devolverEscopos(devolucoes);
    const antes = await alertas(treinamentoY);

    exigir(await admin.rpc("gerar_avisos_de_validade"), "job de novo");
    expect(await alertas(asoX)).toContain(USUARIOS.sst);
    expect(await alertas(treinamentoY)).toEqual(antes);
  });

  it("o aviso no Portal e o e-mail vão juntos, e o e-mail só leva ao painel", async () => {
    const { data } = await admin
      .from("notificacoes")
      .select("canal, assunto, status")
      .eq("referencia_id", asoX)
      .eq("usuario_id", USUARIOS.sst)
      .eq("motivo", "validade")
      .order("canal");
    expect(data).toEqual([
      { canal: "email", assunto: "Documento de SST vence em até 30 dias", status: "pendente" },
      { canal: "portal", assunto: "Documento de SST vence em até 30 dias", status: "pendente" },
    ]);
  });
});
