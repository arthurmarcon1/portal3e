import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clienteDeFixture,
  como,
  CONTRATOS,
  exigir,
  ORG,
  PERSONAS,
  type Cliente,
} from "./apoio";

/**
 * RLS de `pessoas` — docs/03, "Como testar a RLS".
 *
 * Cobre: funcionário lê só a si; fiscal lê só o contrato dele; RH sem escopo
 * lê a organização; interno COM escopo lê só o escopo mesmo tendo
 * `pessoas:editar` (a regressão do `for all`, 0008); pessoa sem alocação
 * visível a quem tem `pessoas:editar` e invisível ao contratante (0007/0009).
 *
 * Os conjuntos esperados são calculados pelo fixture a partir de `alocacoes`,
 * não digitados — exceto o 14, que é o número que o Arthur pediu para fixar:
 * se o seed mudar, este teste deve gritar.
 */

/** Fora da faixa de CPF do seed (01000791998–01023757044). */
const CPF_SEM_ALOCACAO = "09000000238";

let admin: Cliente;
let pessoaSemAlocacao: string;
let pessoasDo042: string[];
let pessoasDaOrg: string[];
/** Quem tem ao menos uma alocação na org — o resto entra por outra regra. */
let alocadas: Set<string>;

beforeAll(async () => {
  admin = clienteDeFixture();

  const colisao = exigir(
    await admin.from("pessoas").select("id").eq("cpf", CPF_SEM_ALOCACAO),
    "colisão de CPF",
  );
  if (colisao.length > 0) {
    throw new Error(
      `O CPF de teste ${CPF_SEM_ALOCACAO} já existe em pessoas. Se é sobra de uma execução ` +
        "que morreu, apague essa pessoa à mão; se é outra coisa, escolha outro CPF fora da faixa do seed.",
    );
  }

  const alocadas042 = exigir(
    await admin.from("alocacoes").select("pessoa_id").eq("contrato_id", CONTRATOS.c042),
    "alocações do 042",
  );
  pessoasDo042 = [...new Set(alocadas042.map((a) => a.pessoa_id))].sort();

  alocadas = new Set(
    exigir(await admin.from("alocacoes").select("pessoa_id").eq("org_id", ORG), "alocações").map(
      (a) => a.pessoa_id,
    ),
  );

  pessoasDaOrg = exigir(await admin.from("pessoas").select("id").eq("org_id", ORG), "pessoas da org")
    .map((p) => p.id)
    .sort();

  // O escopo do teste: RH/DP preso ao contrato 042. Devolvido no afterAll.
  const escopoAnterior = exigir(
    await admin.from("usuario_escopos").select("id").eq("usuario_id", PERSONAS.rhDp.id),
    "escopo do RH/DP",
  );
  if (escopoAnterior.length > 0) {
    throw new Error(
      "RH/DP já tem escopo cadastrado — no seed ele é escopo total. Outro teste deixou " +
        "sujeira; este não vai sobrescrever. Apague usuario_escopos do RH/DP e rode de novo.",
    );
  }
  exigir(
    await admin
      .from("usuario_escopos")
      .insert({ usuario_id: PERSONAS.rhDp.id, contrato_id: CONTRATOS.c042 })
      .select("id"),
    "escopo 042 do RH/DP",
  );

  pessoaSemAlocacao = exigir(
    await admin
      .from("pessoas")
      .insert({ org_id: ORG, nome: "Teste RLS Sem Alocacao", cpf: CPF_SEM_ALOCACAO })
      .select("id")
      .single(),
    "pessoa sem alocação",
  ).id;
}, 30_000);

afterAll(async () => {
  if (!admin) return;
  await admin.from("usuario_escopos").delete().eq("usuario_id", PERSONAS.rhDp.id);
  if (pessoaSemAlocacao) await admin.from("pessoas").delete().eq("id", pessoaSemAlocacao);
});

async function idsDePessoas(cliente: Cliente): Promise<string[]> {
  const { data, error } = await cliente.from("pessoas").select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => p.id).sort();
}

describe("funcionário", () => {
  it("consulta pessoas e recebe 1 linha: ele mesmo", async () => {
    const maria = await como(PERSONAS.maria.email);
    expect(await idsDePessoas(maria)).toEqual([PERSONAS.maria.pessoaId]);
  });
});

describe("fiscal do contrato 042 (contratante)", () => {
  it("lista só as pessoas alocadas no 042", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsDePessoas(fiscal)).toEqual(pessoasDo042);
  });

  it("não vê pessoa sem alocação", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    const { data } = await fiscal.from("pessoas").select("id").eq("id", pessoaSemAlocacao);
    expect(data).toHaveLength(0);
  });
});

describe("interno sem escopo", () => {
  it("Admin geral vê a organização inteira, inclusive quem não tem alocação", async () => {
    const adminGeral = await como(PERSONAS.adminGeral.email);
    expect(await idsDePessoas(adminGeral)).toEqual(
      [...pessoasDaOrg, pessoaSemAlocacao].sort(),
    );
  });
});

describe("interno com escopo no 042 (RH/DP, que tem pessoas:editar)", () => {
  it("vê as 14 pessoas do 042, e não as 30 da organização", async () => {
    const rh = await como(PERSONAS.rhDp.email);
    const visiveis = await idsDePessoas(rh);

    // Sanidade do fixture: o 042 do seed tem 14 pessoas.
    expect(pessoasDo042).toHaveLength(14);

    // O que está alocado e ele vê é exatamente o 042. Pessoa sem alocação
    // entra por outra regra (caso abaixo) — a do fixture e qualquer outra que
    // exista no projeto dev —, então é descontada aqui.
    const alocadasVisiveis = visiveis.filter((id) => alocadas.has(id));
    expect(alocadasVisiveis).toEqual(pessoasDo042);
    expect(alocadasVisiveis).toHaveLength(14);
    expect(visiveis).not.toHaveLength(pessoasDaOrg.length);
  });

  it("vê a pessoa sem nenhuma alocação: 1 linha", async () => {
    const rh = await como(PERSONAS.rhDp.email);
    const { data } = await rh.from("pessoas").select("id").eq("id", pessoaSemAlocacao);
    expect(data).toHaveLength(1);
  });

  it("não vê quem está alocado só fora do escopo", async () => {
    const soNo077 = exigir(
      await admin.from("alocacoes").select("pessoa_id").eq("contrato_id", CONTRATOS.c077),
      "alocações do 077",
    ).map((a) => a.pessoa_id);

    const rh = await como(PERSONAS.rhDp.email);
    const { data } = await rh.from("pessoas").select("id").in("id", soNo077);
    expect(data).toHaveLength(0);
  });
});
