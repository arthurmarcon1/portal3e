import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Relatórios (F5.3), pela rota de exportação real e contra o banco:
 *
 * - pendências batem com uma contagem feita À PARTE no banco (critério de
 *   aceite da Fase 5), calculada aqui sem usar a função do relatório;
 * - escopo de quem exporta: RH preso ao 042 não vê a pessoa do 077 — que o
 *   Admin geral vê, no mesmo relatório;
 * - toda exportação que sai tem a sua linha em `auditoria`; a recusada, não;
 * - acessos e downloads: Suporte (administracao:ver, sem exportar) não baixa;
 *   RH nem lê; contratante não entra em relatório nenhum.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.53", "user-agent": "teste-f53" }),
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
  adminGeral: "admin_geral@3e.com.br",
  rhDp: "rh_dp@3e.com.br",
  suporte: "suporte_auditoria@3e.com.br",
  fiscal: "fiscal@hsaolucas.com.br",
} as const;
const RH = "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3";
const C042 = "d594b950-e556-5f78-ae9b-98f6b1d12b63";
const C077 = "e716f5c1-3603-596b-a331-1d307ccf82f3";
const LOJA_CENTRO = "a6565dbb-e74b-5a93-9c62-4134b6f76473";
const COMUNICADO = "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2";

function cpfValido(base: string): string {
  const dv = (s: string) => {
    const soma = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return String(r === 10 ? 0 : r);
  };
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
}
const CPF_Z = cpfValido("095300001");
const NOME_Z = "Teste F53 Zuleica";
const IP_FIXTURE = "198.51.100.53";

function hoje(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function maisDias(n: number): string {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let admin: Cliente;
const clientes = new Map<string, Cliente>();
let pessoaZ: string | undefined;
const documentos: string[] = [];
let escopoDoRh = false;
const inicio = new Date().toISOString();

function ambiente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error("Credenciais do Supabase ausentes. Este teste precisa do banco: rode `npm test`.");
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

async function persona(email: keyof typeof EMAILS) {
  estado.cliente = await como(EMAILS[email]);
  vi.resetModules();
}

async function exportar(email: keyof typeof EMAILS, chave: string, query: string) {
  await persona(email);
  const { GET } = await import("@/app/api/relatorios/[chave]/route");
  return GET(new Request(`http://portal.teste/api/relatorios/${chave}?${query}`), { params: Promise.resolve({ chave }) });
}

async function relatorio(email: keyof typeof EMAILS, chave: "pendencias" | "quadro" | "acessos", recorte: object) {
  await persona(email);
  const { gerarRelatorio } = await import("./queries");
  return gerarRelatorio(chave, recorte as never);
}

async function exportacoesDe(usuarioEmail: string) {
  const { data: u } = await admin.from("usuarios").select("id").eq("email_login", usuarioEmail).single();
  const { data } = await admin
    .from("auditoria")
    .select("detalhes")
    .eq("usuario_id", u!.id)
    .eq("acao", "exportar")
    .eq("entidade", "relatorios")
    .gte("criado_em", inicio)
    .order("criado_em");
  return (data ?? []).map((d) => d.detalhes as Record<string, unknown>);
}

async function publicar(campos: { escopo: "individual" | "coletivo"; pessoa_id?: string; titulo: string }): Promise<string> {
  const id = exigir(
    await admin
      .from("documentos")
      .insert({
        org_id: ORG,
        tipo_id: COMUNICADO,
        status: "publicado",
        arquivo_path: `teste-f53/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "0".repeat(64),
        publicado_em: new Date().toISOString(),
        prazo_ciencia: maisDias(5),
        ...campos,
      })
      .select("id")
      .single(),
    campos.titulo,
  ).id;
  documentos.push(id);
  return id;
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  // Pela persona: a parte DEFINER é só de `authenticated`, nem service_role a chama.
  const { error: semMigracao } = await (await como(EMAILS.adminGeral)).rpc("relatorio_pendencias_de_ciencia");
  if (semMigracao) throw new Error(`migração 0025 ausente no alvo de teste: ${semMigracao.message}`);
  if (exigir(await admin.from("pessoas").select("id").eq("cpf", CPF_Z), "colisão").length > 0) {
    throw new Error("CPF de teste já existe em pessoas — sobra de execução anterior. Apague à mão.");
  }
  if (exigir(await admin.from("usuario_escopos").select("id").eq("usuario_id", RH), "escopo RH").length > 0) {
    throw new Error("RH/DP já tem escopo — sujeira de outro teste. Este não sobrescreve.");
  }

  pessoaZ = exigir(await admin.from("pessoas").insert({ org_id: ORG, nome: NOME_Z, cpf: CPF_Z }).select("id").single(), "Z").id;
  exigir(
    await admin
      .from("alocacoes")
      .insert({ org_id: ORG, pessoa_id: pessoaZ, contrato_id: C077, unidade_id: LOJA_CENTRO, funcao: "Caixa F53", data_inicio: maisDias(-5) })
      .select("id"),
    "alocação de Z",
  );
  await publicar({ escopo: "individual", pessoa_id: pessoaZ, titulo: "F53 comunicado da Zuleica" });
  const coletivo = await publicar({ escopo: "coletivo", titulo: "F53 comunicado do 042" });
  exigir(await admin.from("documento_destinatarios").insert({ documento_id: coletivo, contrato_id: C042 }).select("id"), "público");

  // A suíte entra direto pelo Auth, sem a tela de login: a trilha pode não ter
  // acesso nenhum no período. Estes dois, marcados pelo IP, saem no afterAll.
  exigir(
    await admin
      .from("auditoria")
      .insert([
        { org_id: ORG, usuario_id: RH, acao: "login", entidade: "sessao", ip: IP_FIXTURE },
        { org_id: ORG, usuario_id: RH, acao: "download", entidade: "documentos", entidade_id: coletivo, ip: IP_FIXTURE },
      ])
      .select("id"),
    "acessos",
  );
}, 60_000);

afterAll(async () => {
  if (!admin) return;
  if (escopoDoRh) await admin.from("usuario_escopos").delete().eq("usuario_id", RH);
  await admin.from("auditoria").delete().eq("ip", IP_FIXTURE);
  if (documentos.length > 0) {
    await admin.from("notificacoes").delete().in("referencia_id", documentos);
    await admin.from("documentos").delete().in("id", documentos);
  }
  if (pessoaZ) {
    await admin.from("alocacoes").delete().eq("pessoa_id", pessoaZ);
    await admin.from("pessoas").delete().eq("id", pessoaZ);
  }
});

/**
 * Pendências contadas à parte, direto das tabelas, com `service_role`: sem a
 * função do relatório nem `app.pessoas_alcancadas`. O Admin geral tem escopo
 * total e todas as categorias, então o relatório dele tem de dar o mesmo.
 */
async function pendenciasContadasNoBanco(): Promise<Set<string>> {
  const docs = exigir(
    await admin
      .from("documentos")
      .select("id, escopo, pessoa_id, documento_tipos!inner(exige_ciencia)")
      .eq("org_id", ORG)
      .eq("status", "publicado")
      .eq("documento_tipos.exige_ciencia", true),
    "documentos",
  );
  const destinatarios = exigir(await admin.from("documento_destinatarios").select("documento_id, contrato_id, unidade_id, funcao"), "públicos");
  const alocacoes = exigir(
    await admin.from("alocacoes").select("pessoa_id, contrato_id, unidade_id, funcao").eq("org_id", ORG).neq("status", "encerrada"),
    "alocações",
  );
  const respondidos = new Set(
    exigir(await admin.from("ciencias").select("documento_id, pessoa_id").eq("org_id", ORG), "ciências").map(
      (c) => `${c.documento_id}:${c.pessoa_id}`,
    ),
  );

  const pares = new Set<string>();
  for (const d of docs) {
    const alcancados = new Set<string>();
    if (d.escopo === "individual" && d.pessoa_id) alcancados.add(d.pessoa_id);
    for (const p of destinatarios.filter((x) => x.documento_id === d.id)) {
      for (const a of alocacoes) {
        if ((p.contrato_id === null || p.contrato_id === a.contrato_id) &&
            (p.unidade_id === null || p.unidade_id === a.unidade_id) &&
            (p.funcao === null || p.funcao === a.funcao)) {
          alcancados.add(a.pessoa_id);
        }
      }
    }
    for (const pessoa of alcancados) if (!respondidos.has(`${d.id}:${pessoa}`)) pares.add(`${d.id}:${pessoa}`);
  }
  return pares;
}

describe("pendências batem com o banco", () => {
  it("o total do Admin geral é o número de pares documento×pessoa sem resposta, contado à parte", async () => {
    const esperado = await pendenciasContadasNoBanco();
    const r = await relatorio("adminGeral", "pendencias", { tipo: "nenhum" });
    expect(esperado.size).toBeGreaterThan(0);
    expect(r.total.valor).toBe(esperado.size);

    const { data } = await (await como(EMAILS.adminGeral)).rpc("relatorio_pendencias_de_ciencia");
    expect(new Set(data!.map((l) => `${l.documento_id}:${l.pessoa_id}`))).toEqual(esperado);
  });

  it("o CSV exportado traz uma linha por pendência e lotação, e a exportação fica na auditoria com esse número", async () => {
    const resposta = await exportar("adminGeral", "pendencias", "formato=csv");
    expect(resposta.status).toBe(200);
    const csv = await resposta.text();
    const linhas = csv.trim().split("\r\n").length - 1;
    const log = (await exportacoesDe(EMAILS.adminGeral)).at(-1);
    expect(log).toMatchObject({ relatorio: "pendencias", formato: "csv", linhas });
    expect(csv).toContain(NOME_Z);
  });
});

describe("escopo de quem exporta", () => {
  it("RH preso ao 042 não vê a pendência nem a entrada da pessoa do 077; o Admin geral vê as duas", async () => {
    exigir(await admin.from("usuario_escopos").insert({ usuario_id: RH, contrato_id: C042 }).select("id"), "escopo 042");
    escopoDoRh = true;
    try {
      const periodo = { tipo: "periodo", de: maisDias(-10), ate: hoje() };
      const [pendRh, quadroRh, pendAdmin, quadroAdmin] = [
        await relatorio("rhDp", "pendencias", { tipo: "nenhum" }),
        await relatorio("rhDp", "quadro", periodo),
        await relatorio("adminGeral", "pendencias", { tipo: "nenhum" }),
        await relatorio("adminGeral", "quadro", periodo),
      ];
      const tem = (r: { detalhe: { linhas: unknown[][] } }) => r.detalhe.linhas.some((l) => l.includes(NOME_Z));
      expect(tem(pendRh)).toBe(false);
      expect(tem(quadroRh)).toBe(false);
      expect(pendRh.detalhe.linhas.length).toBeGreaterThan(0); // o 042 está lá
      expect(tem(pendAdmin)).toBe(true);
      expect(quadroAdmin.detalhe.linhas.find((l) => l.includes(NOME_Z))).toContain("entrada");

      // E o arquivo exportado pelo RH é o mesmo recorte.
      const csv = await (await exportar("rhDp", "quadro", `formato=csv&de=${maisDias(-10)}&ate=${hoje()}`)).text();
      expect(csv).not.toContain(NOME_Z);
      expect(csv).not.toContain("077");
    } finally {
      await admin.from("usuario_escopos").delete().eq("usuario_id", RH);
      escopoDoRh = false;
    }
  });
});

describe("toda exportação é auditada", () => {
  it("PDF sai como PDF e deixa a linha dele; recorte inválido não sai e não deixa linha", async () => {
    const antes = (await exportacoesDe(EMAILS.rhDp)).length;
    const pdf = await exportar("rhDp", "solicitacoes", `formato=pdf&de=${maisDias(-30)}&ate=${hoje()}`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");

    const invalido = await exportar("rhDp", "solicitacoes", "formato=pdf&de=2026-09-10&ate=2026-09-01");
    expect(invalido.status).toBe(400);

    const depois = await exportacoesDe(EMAILS.rhDp);
    expect(depois.length).toBe(antes + 1);
    expect(depois.at(-1)).toMatchObject({ relatorio: "solicitacoes", formato: "pdf" });
  });
});

describe("acessos e downloads: só administracao", () => {
  it("Suporte lê a trilha (administracao:ver) mas não exporta: 403, sem linha de exportação", async () => {
    const r = await relatorio("suporte", "acessos", { tipo: "periodo", de: maisDias(-7), ate: hoje() });
    expect(r.total.valor).toBeGreaterThan(0);

    const resposta = await exportar("suporte", "acessos", "formato=csv");
    expect(resposta.status).toBe(403);
    expect(await resposta.text()).toContain("administracao:exportar");
    expect(await exportacoesDe(EMAILS.suporte)).toEqual([]);
  });

  it("RH (sem administracao) nem exporta nem lê: 403 na rota, e 0 eventos mesmo chamando a consulta direto", async () => {
    expect((await exportar("rhDp", "acessos", "formato=csv")).status).toBe(403);
    const r = await relatorio("rhDp", "acessos", { tipo: "periodo", de: maisDias(-7), ate: hoje() });
    expect(r.total.valor).toBe(0);
  });

  it("Admin geral exporta, e a exportação fica registrada", async () => {
    const resposta = await exportar("adminGeral", "acessos", "formato=csv");
    expect(resposta.status).toBe(200);
    const csv = await resposta.text();
    expect(csv).toContain(IP_FIXTURE);
    expect(csv).toContain("entrada");
    expect(csv).toContain("download");
    expect((await exportacoesDe(EMAILS.adminGeral)).at(-1)).toMatchObject({ relatorio: "acessos", formato: "csv" });
  });
});

describe("contratante", () => {
  it("fiscal não exporta relatório interno: 403, sem linha", async () => {
    const resposta = await exportar("fiscal", "quadro", "formato=csv");
    expect(resposta.status).toBe(403);
    expect(await exportacoesDe(EMAILS.fiscal)).toEqual([]);
  });
});
