import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { clienteDeFixture, como, CONTRATOS, exigir, PERSONAS, type Cliente } from "../../../tests/rls/apoio";

/**
 * O caminho da tela, pelas Server Actions de verdade: importar a planilha de
 * custo (arquivo .xlsx FICTÍCIO gerado aqui), abrir o mês, lançar, descartar,
 * conferir o que a IA deixou em dúvida e fechar. O client é o da persona
 * Financeiro (escopo no 042 pelo seed), então quem responde é a RLS. O
 * dublado é só o encanamento de requisição do Next.
 *
 * `service_role` só limpa, pelos ids que este arquivo criou, e apaga o
 * rastro em `auditoria` desses ids.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => estado.cliente }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.29" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

const ARQUIVO = "teste-actions-financeiro.xlsx";
const MES = "2031-02";

let admin: Cliente;
let financeiro: Cliente;
let contratos: Cliente;
const planilhas: string[] = [];

async function actionsComo(cliente: Cliente) {
  estado.cliente = cliente;
  vi.resetModules();
  return import("./actions");
}

/** Planilha fictícia no formato da licitação: resumo + uma aba por cargo. */
async function planilhaFicticia(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const cargo = wb.addWorksheet("Agente Fictício");
  const linhas: (string | number)[][] = [
    ["", "Regime de Tributação: (1)Real (2)Presumido", "", 2, "Lucro Presumido"],
    ["", "D", "N° de meses de execução contratual", "", 12],
    ["", "Tipo de Serviço", "Unidade de Medida"],
    ["", "Agente Fictício", "Posto", 1],
    ["", "A", "Salário Base - 220h", "", 2000],
    ["", "A", "Custos Indiretos", 0.1, 500],
    ["", "Total dos Tributos", "", 0.19, 1000],
    ["", "C", "Lucro", 0.1, 400],
    ["", "QUADRO RESUMO DO CUSTO FIXO POR EMPREGADO"],
    ["", "A", "Módulo 1 - Composição da Remuneração", "", 2000],
    ["", "B", "Módulo 2 - Benefícios Mensais e Diários", "", 600],
    ["", "C", "Módulo 3 - Insumos Diverso", "", 40],
    ["", "D", "Módulo 4 - Encargos Sociais e Trabalhistas", "", 1500],
    ["", "E", "Módulo 5 - Custos Indiretos, Tributos e Lucro", "", 1900],
    ["", "Valor Total FIXO por Empregado", "", 6040],
  ];
  for (const l of linhas) cargo.addRow(l);
  const resumo = wb.addWorksheet("Plan1");
  resumo.addRow(["", "Cargo", "Quantidade", "Valor Unitário", "Valor Total"]);
  resumo.addRow(["", "AGENTE FICTÍCIO", 3, 6040, 18120]);
  resumo.addRow(["", "Total Mês", "", "", 18120]);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer], ARQUIVO, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function limpar() {
  const sobras = exigir(await admin.from("planilhas_de_custo").select("id").eq("arquivo_nome", ARQUIVO), "sobras");
  const ids = [...new Set([...planilhas, ...sobras.map((p) => p.id)])];
  if (!ids.length) return;
  const comps = exigir(await admin.from("competencias").select("id").in("planilha_id", ids), "competências").map((c) => c.id);
  const lancs = comps.length
    ? exigir(await admin.from("lancamentos").select("id").in("competencia_id", comps), "lançamentos").map((l) => l.id)
    : [];
  await admin.from("auditoria").delete().in("entidade_id", [...ids, ...comps, ...lancs]);
  if (lancs.length) await admin.from("lancamentos").delete().in("id", lancs);
  if (comps.length) await admin.from("competencias").delete().in("id", comps);
  await admin.from("planilhas_de_custo").delete().in("id", ids);
}

beforeAll(async () => {
  admin = clienteDeFixture();
  await limpar();
  financeiro = await como(PERSONAS.financeiro.email);
  contratos = await como(PERSONAS.contratos.email);
}, 30_000);

afterAll(async () => {
  if (admin) await limpar();
});

describe("financeiro pelas Server Actions", () => {
  let competenciaId: string;

  it("lê a planilha na prévia sem gravar nada", async () => {
    const { previsualizarPlanilha } = await actionsComo(financeiro);
    const f = new FormData();
    f.set("arquivo", await planilhaFicticia());
    const r = await previsualizarPlanilha(f);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.valor_mensal).toBe(18120);
    expect(r.dados.postos[0].composicao.encargos).toBe(1500);
    expect(r.dados.avisos).toEqual([]);

    const gravadas = exigir(await admin.from("planilhas_de_custo").select("id").eq("arquivo_nome", ARQUIVO), "nada gravado");
    expect(gravadas).toHaveLength(0);
  });

  it("recusa .xls antigo dizendo como converter", async () => {
    const { previsualizarPlanilha } = await actionsComo(financeiro);
    const f = new FormData();
    f.set("arquivo", new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])], "antiga.xls"));
    const r = await previsualizarPlanilha(f);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/Salvar como/) });
  });

  it("Contratos (só ver) não importa", async () => {
    const { importarPlanilha } = await actionsComo(contratos);
    const f = new FormData();
    f.set("arquivo", await planilhaFicticia());
    f.set("contrato_id", CONTRATOS.c043);
    f.set("vigente_desde", MES);
    const r = await importarPlanilha(f);
    expect(r.ok).toBe(false);
  });

  it("importa como versão do contrato e registra na auditoria", async () => {
    const { importarPlanilha } = await actionsComo(financeiro);
    const f = new FormData();
    f.set("arquivo", await planilhaFicticia());
    f.set("contrato_id", CONTRATOS.c043);
    f.set("vigente_desde", MES);
    f.set("observacao", "fixture");
    const r = await importarPlanilha(f);
    expect(r.ok).toBe(true);

    const [p] = exigir(
      await financeiro.from("planilhas_de_custo").select("id, valor_mensal, vigente_desde, meses_execucao").eq("arquivo_nome", ARQUIVO),
      "planilha gravada",
    );
    planilhas.push(p.id);
    expect(Number(p.valor_mensal)).toBe(18120);
    expect(p.vigente_desde).toBe(`${MES}-01`);
    expect(p.meses_execucao).toBe(12);

    const log = exigir(await admin.from("auditoria").select("acao, usuario_id").eq("entidade_id", p.id), "auditoria");
    expect(log).toEqual([{ acao: "importar", usuario_id: PERSONAS.financeiro.id }]);
  });

  it("não abre mês anterior à planilha; abre o mês em que ela vale", async () => {
    const { abrirCompetencia } = await actionsComo(financeiro);
    const antes = await abrirCompetencia({ contrato_id: CONTRATOS.c043, mes: "2031-01" });
    expect(antes).toEqual({ ok: false, erro: expect.stringMatching(/Não há planilha de custo valendo em janeiro de 2031/) });

    const r = await abrirCompetencia({ contrato_id: CONTRATOS.c043, mes: MES });
    expect(r).toEqual({ ok: true, dados: { mes: `${MES}-01` } });

    const [c] = exigir(
      await financeiro.from("competencias").select("id").eq("contrato_id", CONTRATOS.c043).eq("mes", `${MES}-01`),
      "competência",
    );
    competenciaId = c.id;

    const repetida = await abrirCompetencia({ contrato_id: CONTRATOS.c043, mes: MES });
    expect(repetida).toEqual({ ok: false, erro: "Esta competência já está aberta para o contrato." });
  });

  it("lança pela tela, aceitando valor à brasileira, e descarta com motivo", async () => {
    const { criarLancamento, descartarLancamento } = await actionsComo(financeiro);
    const f = new FormData();
    f.set("competencia_id", competenciaId);
    f.set("categoria", "viagem");
    f.set("descricao", "Viagem fictícia de supervisão");
    f.set("valor", "1.234,56");
    f.set("data_documento", `${MES}-10`);
    f.set("posto_id", "nenhum");
    expect(await criarLancamento(f)).toEqual({ ok: true });

    const [l] = exigir(
      await financeiro.from("lancamentos").select("id, valor, natureza, origem, status, criado_por").eq("competencia_id", competenciaId),
      "lançamento",
    );
    expect(l).toMatchObject({ valor: 1234.56, natureza: "despesa", origem: "plataforma", status: "confirmado", criado_por: PERSONAS.financeiro.id });

    expect(await descartarLancamento({ lancamento_id: l.id, motivo: "" })).toEqual({ ok: false, erro: expect.stringMatching(/motivo/) });
    expect(await descartarLancamento({ lancamento_id: l.id, motivo: "duplicado" })).toEqual({ ok: true });
  });

  it("confere o que a IA deixou em dúvida e só então fecha o mês", async () => {
    // O que o webhook do WhatsApp vai gravar: origem whatsapp, em conferência.
    const pendente = exigir(
      await financeiro
        .from("lancamentos")
        .insert({
          org_id: "1fac8b3c-4860-5606-836b-ca4c8dd420d0",
          contrato_id: CONTRATOS.c043,
          competencia_id: competenciaId,
          natureza: "despesa",
          categoria: "outros",
          descricao: "Almoço",
          valor: 95,
          origem: "whatsapp",
          status: "em_conferencia",
          sugestao: { duvidas: ["Qual é o tipo deste gasto?"], transcricao: "gastei 95 no almoço" },
          criado_por: PERSONAS.financeiro.id,
        })
        .select("id")
        .single(),
      "pendente",
    );

    const { mudarStatusCompetencia, conferirLancamento } = await actionsComo(financeiro);
    const cedo = await mudarStatusCompetencia({ competencia_id: competenciaId, status: "fechada" });
    expect(cedo).toEqual({ ok: false, erro: expect.stringMatching(/em conferência/) });

    expect(
      await conferirLancamento({ lancamento_id: pendente.id, categoria: "alimentacao", descricao: "Almoço da equipe", valor: "95,00" }),
    ).toEqual({ ok: true });
    const [conferido] = exigir(
      await financeiro.from("lancamentos").select("categoria, status, conferido_por").eq("id", pendente.id),
      "conferido",
    );
    expect(conferido).toEqual({ categoria: "alimentacao", status: "confirmado", conferido_por: PERSONAS.financeiro.id });

    expect(await mudarStatusCompetencia({ competencia_id: competenciaId, status: "fechada" })).toEqual({ ok: true });

    const { criarLancamento } = await actionsComo(financeiro);
    const f = new FormData();
    f.set("competencia_id", competenciaId);
    f.set("categoria", "faturamento");
    f.set("descricao", "Nota fictícia");
    f.set("valor", "18120");
    expect(await criarLancamento(f)).toEqual({ ok: false, erro: expect.stringMatching(/competência está fechada/) });
  });

  it("o painel lê o mês: previsto da planilha, realizado só do confirmado", async () => {
    estado.cliente = financeiro;
    vi.resetModules();
    const { detalheDoContrato, listarContratosDoFinanceiro } = await import("./queries");

    const d = await detalheDoContrato(CONTRATOS.c043, `${MES}-01`);
    expect(d?.competencia).toMatchObject({ status: "fechada", planilha_versao: expect.any(Number) });
    expect(d?.postos.map((p) => [p.cargo, p.quantidade, p.valor_unitario])).toEqual([["AGENTE FICTÍCIO", 3, 6040]]);
    const linha = (g: string) => d?.painel?.linhas.find((l) => l.grupo === g);
    expect(linha("receita")?.previsto).toBe(18120);
    expect(linha("pessoal")?.previsto).toBe(3 * (2000 + 600 + 1500));
    // Viagem descartada não conta; almoço conferido conta.
    expect(linha("operacao")?.realizado).toBe(95);
    expect(d?.lancamentos).toHaveLength(2);

    const lista = await listarContratosDoFinanceiro();
    const c043 = lista.find((c) => c.id === CONTRATOS.c043);
    expect(c043?.planilha?.valor_mensal).toBe(18120);

    // Contraponto do escopo: o Financeiro não enxerga o quadro interno.
    expect(lista.some((c) => c.numero === "3e — Quadro interno")).toBe(false);
  });
});
