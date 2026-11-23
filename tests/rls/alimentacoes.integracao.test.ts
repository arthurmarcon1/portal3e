import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clienteDeFixture, como, exigir, PERSONAS, type Cliente } from "./apoio";

/**
 * 3e Conecta (0029): alimentações, rubricas e lançamentos.
 *
 * Na prova de conceito só o Admin geral tem `alimentacoes` (docs/02). O que
 * este arquivo prova, persona a persona e sempre com contraponto:
 *
 * - interno sem o módulo (RH/DP), contratante e funcionário não leem nada —
 *   e o Admin geral lê o MESMO registro, então o "0 linhas" vale;
 * - quem não tem `alimentacoes:editar` não confere;
 * - conferir decide e lança na mesma transação, uma vez só;
 * - decidida não muda mais;
 * - lançamento não nasce de alimentação pendente, nem por insert direto.
 *
 * `service_role` só no fixture: cria duas alimentações no contrato provisório
 * de Santo Ângelo (seed) e apaga pelo id o que criou, mesmo se o teste falhar.
 * Não sobe arquivo: a RLS é da linha, e o bucket não tem policy para ninguém.
 */

const SANTO_ANGELO = "f308779d-7b6d-471a-90d3-c5e8ff5ec51d";
const ESTANCIA_AURORA = "6a6179a4-eebb-4b28-b637-af0964dca4ad";
const UNIDADE_042 = "79baf83d-a8c3-5a89-90bf-6ae7d29a2302"; // de outro contrato
const COMBUSTIVEL = "7de25b52-578c-4a62-b98d-8069136cfc1d";
const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";

let fixture: Cliente;
let admin: Cliente;
let rh: Cliente;
let fiscal: Cliente;
let maria: Cliente;

const criadas: string[] = [];
let aConferir: string;
let aDeixarPendente: string;

async function novaAlimentacao(): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await fixture.from("alimentacoes").insert({
    id,
    org_id: ORG,
    contrato_id: SANTO_ANGELO,
    tipo: "audio",
    arquivo_path: `teste-rls/${id}.ogg`,
    arquivo_mime: "audio/ogg",
    arquivo_bytes: 1234,
    arquivo_hash: "0".repeat(64),
    enviada_por: PERSONAS.adminGeral.id,
    transcricao: "abasteci a caminhonete da Estância Aurora, R$ 320 de gasolina em novembro",
    transcricao_origem: "manual",
  });
  if (error) throw new Error(`fixture: ${error.message}`);
  criadas.push(id);
  return id;
}

beforeAll(async () => {
  fixture = clienteDeFixture();
  // O seed tem de trazer o que o teste usa — falha alto se não trouxer.
  const contrato = exigir(await fixture.from("contratos").select("id").eq("id", SANTO_ANGELO), "contrato do seed");
  if (contrato.length !== 1) throw new Error("fixture: o seed não trouxe o contrato provisório de Santo Ângelo");
  aConferir = await novaAlimentacao();
  aDeixarPendente = await novaAlimentacao();

  [admin, rh, fiscal, maria] = await Promise.all([
    como(PERSONAS.adminGeral.email),
    como(PERSONAS.rhDp.email),
    como(PERSONAS.fiscal.email),
    como(PERSONAS.maria.email),
  ]);
});

afterAll(async () => {
  if (!fixture || criadas.length === 0) return;
  await fixture.from("lancamentos").delete().in("alimentacao_id", criadas);
  await fixture.from("alimentacoes").delete().in("id", criadas);
});

async function idsVisiveis(cliente: Cliente, tabela: "alimentacoes" | "rubricas"): Promise<string[]> {
  const consulta =
    tabela === "alimentacoes"
      ? cliente.from("alimentacoes").select("id").in("id", criadas)
      : cliente.from("rubricas").select("id").eq("id", COMBUSTIVEL);
  const { data, error } = await consulta;
  expect(error).toBeNull();
  return (data ?? []).map((l) => l.id);
}

describe("leitura", () => {
  it("Admin geral lê as alimentações e a rubrica — o contraponto dos casos abaixo", async () => {
    expect((await idsVisiveis(admin, "alimentacoes")).sort()).toEqual([...criadas].sort());
    expect(await idsVisiveis(admin, "rubricas")).toEqual([COMBUSTIVEL]);
  });

  it.each([
    ["RH/DP (interno sem o módulo)", () => rh],
    ["fiscal (contratante)", () => fiscal],
    ["Maria (funcionária)", () => maria],
  ])("%s não lê alimentação nem rubrica", async (_, quem) => {
    expect(await idsVisiveis(quem(), "alimentacoes")).toEqual([]);
    expect(await idsVisiveis(quem(), "rubricas")).toEqual([]);
  });
});

describe("escrita sem o módulo", () => {
  it("RH/DP não cria alimentação", async () => {
    const id = crypto.randomUUID();
    const { error } = await rh.from("alimentacoes").insert({
      id,
      org_id: ORG,
      contrato_id: SANTO_ANGELO,
      tipo: "audio",
      arquivo_path: `teste-rls/${id}.ogg`,
      arquivo_mime: "audio/ogg",
      arquivo_bytes: 1,
      arquivo_hash: "0".repeat(64),
      enviada_por: PERSONAS.rhDp.id,
    });
    if (!error) criadas.push(id); // para a limpeza, se a RLS falhar
    expect(error).not.toBeNull();
  });

  it("RH/DP não confere — e a alimentação continua pendente", async () => {
    const { error } = await rh.rpc("conferir_alimentacao", {
      p_alimentacao: aDeixarPendente,
      p_rubrica: COMBUSTIVEL,
      p_unidade: null,
      p_descricao: "tentativa sem permissão",
      p_valor: 10,
      p_competencia: "2026-11-01",
    });
    expect(error).not.toBeNull();
    const [linha] = exigir(
      await fixture.from("alimentacoes").select("status").eq("id", aDeixarPendente),
      "alimentação de fixture",
    );
    expect(linha.status).toBe("pendente");
  });
});

describe("conferência pelo Admin geral", () => {
  it("cliente de outro contrato é recusado", async () => {
    const { error } = await admin.rpc("conferir_alimentacao", {
      p_alimentacao: aConferir,
      p_rubrica: COMBUSTIVEL,
      p_unidade: UNIDADE_042,
      p_descricao: "Gasolina da caminhonete",
      p_valor: 320,
      p_competencia: "2026-11-01",
    });
    expect(error?.code).toBe("22023");
  });

  it("decide e lança na mesma transação, com quem conferiu e o mês no dia 1", async () => {
    const { data: lancamentoId, error } = await admin.rpc("conferir_alimentacao", {
      p_alimentacao: aConferir,
      p_rubrica: COMBUSTIVEL,
      p_unidade: ESTANCIA_AURORA,
      p_descricao: "Gasolina da caminhonete",
      p_valor: 320,
      p_competencia: "2026-11-15",
    });
    expect(error).toBeNull();

    const [alimentacao] = exigir(
      await admin.from("alimentacoes").select("status, decidida_por, decidida_em").eq("id", aConferir),
      "alimentação conferida",
    );
    expect(alimentacao).toMatchObject({ status: "conferida", decidida_por: PERSONAS.adminGeral.id });
    expect(alimentacao.decidida_em).not.toBeNull();

    const [lancamento] = exigir(
      await admin.from("lancamentos").select("id, valor, competencia, unidade_id, criado_por").eq("alimentacao_id", aConferir),
      "lançamento",
    );
    expect(lancamento).toMatchObject({
      id: lancamentoId,
      competencia: "2026-11-01",
      unidade_id: ESTANCIA_AURORA,
      criado_por: PERSONAS.adminGeral.id,
    });
    expect(Number(lancamento.valor)).toBe(320);
  });

  it("RH/DP não lê o lançamento que o Admin geral lê", async () => {
    const { data } = await rh.from("lancamentos").select("id").eq("alimentacao_id", aConferir);
    expect(data).toEqual([]);
  });

  it("conferir de novo não cria segundo lançamento", async () => {
    const { error } = await admin.rpc("conferir_alimentacao", {
      p_alimentacao: aConferir,
      p_rubrica: COMBUSTIVEL,
      p_unidade: null,
      p_descricao: "de novo",
      p_valor: 1,
      p_competencia: "2026-11-01",
    });
    expect(error?.code).toBe("P0002");
    const linhas = exigir(
      await fixture.from("lancamentos").select("id").eq("alimentacao_id", aConferir),
      "lançamentos da alimentação",
    );
    expect(linhas).toHaveLength(1);
  });

  it("decidida não muda mais", async () => {
    const { data } = await admin
      .from("alimentacoes")
      .update({ transcricao: "trocada depois de conferida" })
      .eq("id", aConferir)
      .select("id");
    expect(data ?? []).toEqual([]);
    const [linha] = exigir(
      await fixture.from("alimentacoes").select("transcricao").eq("id", aConferir),
      "alimentação conferida",
    );
    expect(linha.transcricao).not.toBe("trocada depois de conferida");
  });

  it("lançamento não nasce de alimentação pendente, nem por insert direto", async () => {
    const { error } = await admin.from("lancamentos").insert({
      org_id: ORG,
      contrato_id: SANTO_ANGELO,
      alimentacao_id: aDeixarPendente,
      rubrica_id: COMBUSTIVEL,
      descricao: "atalho",
      valor: 1,
      competencia: "2026-11-01",
      criado_por: PERSONAS.adminGeral.id,
    });
    expect(error).not.toBeNull();
  });

  it("recusar exige motivo e grava quem recusou", async () => {
    const semMotivo = await admin
      .from("alimentacoes")
      .update({ status: "recusada", motivo_recusa: " " })
      .eq("id", aDeixarPendente)
      .select("id");
    expect(semMotivo.error).not.toBeNull();

    const { error } = await admin
      .from("alimentacoes")
      .update({ status: "recusada", motivo_recusa: "Áudio de teste, sem valor." })
      .eq("id", aDeixarPendente);
    expect(error).toBeNull();
    const [linha] = exigir(
      await fixture.from("alimentacoes").select("status, decidida_por").eq("id", aDeixarPendente),
      "alimentação recusada",
    );
    expect(linha).toEqual({ status: "recusada", decidida_por: PERSONAS.adminGeral.id });
  });
});
