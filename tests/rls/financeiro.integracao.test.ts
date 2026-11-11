import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clienteDeFixture, como, CONTRATOS, exigir, PERSONAS, type Cliente } from "./apoio";

/**
 * Financeiro do contrato (0029): quem lê, quem lança, e o que o banco segura
 * sozinho.
 *
 * Tudo como persona — é a RLS que responde. O fixture nasce pela própria
 * persona Financeiro, pela RPC que a tela usa (`gravar_planilha_de_custo`),
 * no contrato 042, que está no escopo dela no seed. `service_role` só limpa,
 * pelos ids que o arquivo criou.
 *
 * Todo "não enxerga" tem contraponto: o Admin geral lê o mesmo registro, e o
 * Fiscal (contratante) enxerga o contrato 042 em si — o que some para ele é só
 * o financeiro.
 */

const MARCA = "teste-rls-financeiro.xlsx";
const QUADRO_INTERNO = "676f9478-b525-55d6-8f06-f04ff5ceb496";
const MES = "2031-01-01"; // longe de qualquer competência real do dev

let admin: Cliente;
let financeiro: Cliente;
let contratos: Cliente;
let rh: Cliente;
let fiscal: Cliente;
let adminGeral: Cliente;

const criados = { planilhas: [] as string[], competencias: [] as string[], lancamentos: [] as string[] };
let planilhaId: string;
let postoId: string;
let competenciaId: string;

async function limpar() {
  // Sobra de execução que falhou: só o que tem a marca deste arquivo.
  const sobras = exigir(await admin.from("planilhas_de_custo").select("id").eq("arquivo_nome", MARCA), "sobras");
  const planilhas = [...new Set([...criados.planilhas, ...sobras.map((p) => p.id)])];
  if (!planilhas.length) return;
  const comps = exigir(await admin.from("competencias").select("id").in("planilha_id", planilhas), "competências");
  const ids = comps.map((c) => c.id);
  if (ids.length) {
    const lancs = exigir(await admin.from("lancamentos").select("id").in("competencia_id", ids), "lançamentos");
    if (lancs.length) {
      await admin.from("lancamento_anexos").delete().in("lancamento_id", lancs.map((l) => l.id));
      await admin.from("lancamentos").delete().in("id", lancs.map((l) => l.id));
    }
    await admin.from("competencias").delete().in("id", ids);
  }
  await admin.from("planilhas_de_custo").delete().in("id", planilhas); // postos em cascata
}

beforeAll(async () => {
  admin = clienteDeFixture();
  await limpar();

  [financeiro, contratos, rh, fiscal, adminGeral] = await Promise.all([
    como(PERSONAS.financeiro.email),
    como(PERSONAS.contratos.email),
    como(PERSONAS.rhDp.email),
    como(PERSONAS.fiscal.email),
    como(PERSONAS.adminGeral.email),
  ]);

  const gravada = exigir(
    await financeiro.rpc("gravar_planilha_de_custo", {
      p_contrato: CONTRATOS.c042,
      p_vigente_desde: MES,
      p_meses: 12,
      p_regime: "Lucro Presumido",
      p_arquivo: MARCA,
      p_observacao: "fixture",
      p_postos: [
        { cargo: "Cargo fictício A", quantidade: 2, valor_unitario: 5000, remuneracao: 2000, encargos: 1500, tributos: 900, lucro: 400 },
        { cargo: "Cargo fictício B", quantidade: 1, valor_unitario: 8000.5 },
      ],
    }),
    "gravar planilha como Financeiro",
  );
  planilhaId = gravada[0].planilha_id;
  criados.planilhas.push(planilhaId);

  const postos = exigir(await financeiro.from("planilha_postos").select("id, cargo").eq("planilha_id", planilhaId).order("ordem"), "postos");
  postoId = postos[0].id;

  const comp = exigir(
    await financeiro
      .from("competencias")
      .insert({ org_id: "1fac8b3c-4860-5606-836b-ca4c8dd420d0", contrato_id: CONTRATOS.c042, planilha_id: planilhaId, mes: MES })
      .select("id")
      .single(),
    "abrir competência como Financeiro",
  );
  competenciaId = comp.id;
  criados.competencias.push(competenciaId);
});

afterAll(async () => {
  if (admin) await limpar();
});

const lancamento = (extra: Record<string, unknown> = {}) => ({
  org_id: "1fac8b3c-4860-5606-836b-ca4c8dd420d0",
  contrato_id: CONTRATOS.c042,
  competencia_id: competenciaId,
  natureza: "despesa" as const,
  categoria: "viagem",
  descricao: "Viagem fictícia",
  valor: 180,
  criado_por: PERSONAS.financeiro.id,
  ...extra,
});

describe("financeiro do contrato — gravação da planilha", () => {
  it("grava cabeçalho e postos juntos, com o valor mensal calculado no banco", async () => {
    const planilha = exigir(
      await financeiro.from("planilhas_de_custo").select("valor_mensal, versao, importada_por").eq("id", planilhaId).single(),
      "planilha",
    );
    expect(Number(planilha.valor_mensal)).toBe(2 * 5000 + 8000.5);
    expect(planilha.importada_por).toBe(PERSONAS.financeiro.id);
    expect(planilha.versao).toBeGreaterThanOrEqual(1);
  });

  it("recusa gravar em contrato fora do escopo (quadro interno)", async () => {
    const r = await financeiro.rpc("gravar_planilha_de_custo", {
      p_contrato: QUADRO_INTERNO,
      p_vigente_desde: MES,
      p_meses: 1,
      p_regime: "x",
      p_arquivo: MARCA,
      p_observacao: "fora do escopo",
      p_postos: [{ cargo: "X", quantidade: 1, valor_unitario: 1 }],
    });
    expect(r.error?.code).toBe("42501");
  });
});

describe("financeiro do contrato — quem lê", () => {
  it("Admin geral, Financeiro e Contratos leem a planilha e os postos", async () => {
    for (const cliente of [adminGeral, financeiro, contratos]) {
      const postos = exigir(await cliente.from("planilha_postos").select("id").eq("planilha_id", planilhaId), "postos");
      expect(postos).toHaveLength(2);
    }
  });

  it("RH/DP não lê nada do financeiro, e o Admin geral lê o mesmo registro (contraponto)", async () => {
    const r = exigir(await rh.from("planilhas_de_custo").select("id").eq("id", planilhaId), "rh");
    expect(r).toHaveLength(0);
    const c = exigir(await rh.from("competencias").select("id").eq("id", competenciaId), "rh competências");
    expect(c).toHaveLength(0);
  });

  it("contratante não lê o financeiro do próprio contrato, mas enxerga o contrato (contraponto)", async () => {
    const r = exigir(await fiscal.from("planilha_postos").select("id").eq("planilha_id", planilhaId), "fiscal");
    expect(r).toHaveLength(0);
    const c = exigir(await fiscal.from("competencias").select("id").eq("id", competenciaId), "fiscal competências");
    expect(c).toHaveLength(0);
    const contrato = exigir(await fiscal.from("contratos").select("id").eq("id", CONTRATOS.c042), "fiscal contrato");
    expect(contrato).toHaveLength(1);
  });
});

describe("financeiro do contrato — quem lança e o que o banco segura", () => {
  it("Financeiro lança; Contratos (só ver) não", async () => {
    const ok = exigir(await financeiro.from("lancamentos").insert(lancamento({ posto_id: postoId })).select("id").single(), "lançar");
    criados.lancamentos.push(ok.id);

    const recusado = await contratos.from("lancamentos").insert(lancamento({ criado_por: PERSONAS.contratos.id }));
    expect(recusado.error?.code).toBe("42501");

    const lido = exigir(await contratos.from("lancamentos").select("id").eq("id", ok.id), "contratos lê");
    expect(lido).toHaveLength(1);
  });

  it("ninguém lança em nome de outro usuário", async () => {
    const r = await financeiro.from("lancamentos").insert(lancamento({ criado_por: PERSONAS.adminGeral.id }));
    expect(r.error?.code).toBe("42501");
  });

  it("categoria de outra natureza é recusada", async () => {
    const r = await financeiro.from("lancamentos").insert(lancamento({ natureza: "receita", categoria: "viagem" }));
    expect(r.error?.code).toBe("23514");
  });

  it("não fecha o mês com lançamento em conferência; descartar exige motivo e não volta", async () => {
    const pendente = exigir(
      await financeiro
        .from("lancamentos")
        .insert(lancamento({ status: "em_conferencia", origem: "whatsapp", categoria: "alimentacao" }))
        .select("id")
        .single(),
      "pendente",
    );
    criados.lancamentos.push(pendente.id);

    const fechar = await financeiro
      .from("competencias")
      .update({ status: "fechada", fechada_em: new Date().toISOString(), fechada_por: PERSONAS.financeiro.id })
      .eq("id", competenciaId);
    expect(fechar.error?.message).toMatch(/em conferência/);

    const semMotivo = await financeiro.from("lancamentos").update({ status: "descartado" }).eq("id", pendente.id);
    expect(semMotivo.error?.code).toBe("23514");

    const descarte = await financeiro
      .from("lancamentos")
      .update({ status: "descartado", motivo_descarte: "teste" })
      .eq("id", pendente.id);
    expect(descarte.error).toBeNull();

    const volta = await financeiro.from("lancamentos").update({ status: "confirmado" }).eq("id", pendente.id);
    expect(volta.error?.message).toMatch(/não volta a valer/);
  });

  it("mês fechado recusa lançamento novo; reaberto aceita", async () => {
    const fechar = await financeiro
      .from("competencias")
      .update({ status: "fechada", fechada_em: new Date().toISOString(), fechada_por: PERSONAS.financeiro.id })
      .eq("id", competenciaId);
    expect(fechar.error).toBeNull();

    const recusado = await financeiro.from("lancamentos").insert(lancamento());
    expect(recusado.error?.message).toMatch(/competência está fechada/);

    const reabrir = await financeiro
      .from("competencias")
      .update({ status: "aberta", fechada_em: null, fechada_por: null })
      .eq("id", competenciaId);
    expect(reabrir.error).toBeNull();
  });

  it("ninguém apaga lançamento: não há policy de DELETE", async () => {
    const id = criados.lancamentos[0];
    const r = await adminGeral.from("lancamentos").delete().eq("id", id).select("id");
    expect(r.data ?? []).toHaveLength(0);
    const ainda = exigir(await admin.from("lancamentos").select("id").eq("id", id), "ainda existe");
    expect(ainda).toHaveLength(1);
  });
});
