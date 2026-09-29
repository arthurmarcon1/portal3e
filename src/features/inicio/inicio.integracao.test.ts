import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CONTRATOS, PERSONAS, TIPOS, clienteDeFixture, como, exigir, type Cliente } from "../../../tests/rls/apoio";

/**
 * Início da equipe interna, contra o banco:
 *
 * - cada contador bate com o que a tela de destino mostra **já filtrada** —
 *   "ciências vencidas" é o total do relatório com `situacao=vencidas`, e
 *   assim por diante. Contador que diz 3 e abre uma tela com 5 é pior que
 *   contador nenhum;
 * - "vencidas" só conta o que passou do prazo: o comunicado no prazo entra
 *   nas pendentes e fica fora das vencidas (contraponto);
 * - a barra do coletivo usa o mesmo número da tela do documento
 *   (`resumo_do_documento`);
 * - a página abre para perfis diferentes sem lançar.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.61", "user-agent": "teste-inicio" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const TITULO_VENCIDO = "Teste início — comunicado vencido";
const TITULO_NO_PRAZO = "Teste início — comunicado no prazo";

function hoje(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function maisDias(n: number): string {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

let admin: Cliente;
const documentos: string[] = [];
let vencido: string;

async function persona(p: keyof typeof PERSONAS) {
  estado.cliente = await como(PERSONAS[p].email);
  vi.resetModules();
}

async function coletivo(titulo: string, prazo: string): Promise<string> {
  const id = exigir(
    await admin
      .from("documentos")
      .insert({
        org_id: ORG,
        tipo_id: TIPOS.comunicado,
        escopo: "coletivo",
        status: "publicado",
        titulo,
        arquivo_path: `teste-inicio/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "0".repeat(64),
        publicado_em: new Date().toISOString(),
        prazo_ciencia: prazo,
      })
      .select("id")
      .single(),
    titulo,
  ).id;
  documentos.push(id);
  exigir(
    await admin.from("documento_destinatarios").insert({ documento_id: id, contrato_id: CONTRATOS.c042 }).select("id"),
    `público de ${titulo}`,
  );
  return id;
}

beforeAll(async () => {
  admin = clienteDeFixture();
  const sobra = exigir(
    await admin.from("documentos").select("id").in("titulo", [TITULO_VENCIDO, TITULO_NO_PRAZO]),
    "sobra",
  );
  if (sobra.length > 0) throw new Error("Documento de teste do início já existe — sobra de execução anterior. Apague à mão.");

  vencido = await coletivo(TITULO_VENCIDO, maisDias(-3));
  await coletivo(TITULO_NO_PRAZO, maisDias(10));
}, 60_000);

afterAll(async () => {
  if (!admin || documentos.length === 0) return;
  await admin.from("notificacoes").delete().in("referencia_id", documentos);
  await admin.from("documento_destinatarios").delete().in("documento_id", documentos);
  await admin.from("documentos").delete().in("id", documentos);
});

describe("ciência: o contador é o total do relatório que ele abre", () => {
  it("pendentes = relatório sem filtro; vencidas = relatório com situacao=vencidas", async () => {
    await persona("adminGeral");
    const { filaDeCiencia } = await import("./queries");
    const { gerarRelatorio } = await import("@/features/relatorios/queries");

    const fila = await filaDeCiencia(hoje());
    const todas = await gerarRelatorio("pendencias", { tipo: "situacao", situacao: "todas" });
    const vencidas = await gerarRelatorio("pendencias", { tipo: "situacao", situacao: "vencidas" });

    expect(fila.pendentes).toBe(todas.total.valor);
    expect(fila.vencidas).toBe(vencidas.total.valor);
    expect(fila.vencidas).toBeGreaterThan(0);

    // Contraponto: o no prazo está nas pendentes e fora das vencidas.
    const titulos = (r: typeof todas) => new Set(r.detalhe.linhas.map((l) => l[4]));
    expect(titulos(todas)).toContain(TITULO_NO_PRAZO);
    expect(titulos(vencidas)).toContain(TITULO_VENCIDO);
    expect(titulos(vencidas)).not.toContain(TITULO_NO_PRAZO);
  });

  it("a barra do coletivo usa o número da tela do documento", async () => {
    await persona("adminGeral");
    const { campanhasDeCiencia } = await import("./queries");
    const campanhas = await campanhasDeCiencia(200);
    const c = campanhas.find((x) => x.documento_id === vencido);
    expect(c).toBeDefined();

    const { data } = await (await como(PERSONAS.adminGeral.email)).rpc("resumo_do_documento", { p_documento: vencido });
    expect(c!.total).toBe(data![0].destinatarios);
    expect(c!.total).toBeGreaterThan(0);
    expect(c!.respondidos).toBe(0);
    // Prazo vencido é o mais urgente: vem antes do no prazo.
    const ordem = campanhas.map((x) => x.titulo);
    if (ordem.includes(TITULO_NO_PRAZO)) {
      expect(ordem.indexOf(TITULO_VENCIDO)).toBeLessThan(ordem.indexOf(TITULO_NO_PRAZO));
    }
  });
});

describe("solicitações: o contador é o que a caixa mostra no mesmo filtro", () => {
  it("com você, sem responsável e vencidas batem com a regra da caixa", async () => {
    await persona("adminGeral");
    const { filaDeSolicitacoes } = await import("./queries");
    const { listarSolicitacoes } = await import("@/features/solicitacoes/queries");
    const { encerrada, vencida } = await import("@/features/solicitacoes/fluxo");

    const fila = await filaDeSolicitacoes(PERSONAS.adminGeral.id, hoje());
    const todas = await listarSolicitacoes();
    expect(fila).toEqual({
      comVoce: todas.filter((s) => s.responsavel_id === PERSONAS.adminGeral.id && !encerrada(s.status)).length,
      semResponsavel: todas.filter((s) => !s.responsavel_id && !encerrada(s.status)).length,
      vencidas: todas.filter((s) => vencida(s.prazo, s.status, hoje())).length,
    });
  });
});

describe("documentos e espelhos", () => {
  it("rascunhos = o que a lista mostra em situacao=rascunho", async () => {
    await persona("adminGeral");
    const { contarRascunhos } = await import("./queries");
    const { listarDocumentos } = await import("@/features/documentos/queries");
    expect(await contarRascunhos()).toBe((await listarDocumentos()).filter((d) => d.status === "rascunho").length);
  });

  it("último fechamento = a competência mais recente de espelho publicado", async () => {
    await persona("adminGeral");
    const { ultimoFechamento } = await import("./queries");
    const { data } = await admin
      .from("documentos")
      .select("competencia")
      .eq("tipo_id", TIPOS.espelho)
      .eq("status", "publicado")
      .not("competencia", "is", null)
      .order("competencia", { ascending: false })
      .limit(1);
    expect(await ultimoFechamento()).toBe(data?.[0]?.competencia ?? null);
  });
});

describe("a página", () => {
  it.each(["adminGeral", "suporte", "contratos"] as const)("abre para %s sem lançar", async (p) => {
    await persona(p);
    const pagina = (await import("@/app/(admin)/admin/page")).default;
    await expect(pagina({})).resolves.toBeTruthy();
  });
});
