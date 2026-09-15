import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  clienteDeFixture,
  como,
  CONTRATOS,
  exigir,
  PERSONAS,
  type Cliente,
} from "./apoio";

/**
 * Interno com escopo cadastra estrutura comercial (perda (a) da 0008, 0013).
 *
 * O caso real: a F2.1 atribui escopo pela tela. Contratos/Coordenação com
 * escopo no 042 e `contratos:editar` precisa conseguir criar contratante,
 * unidade e contrato — e ler de volta o que criou, que é onde o
 * `INSERT ... RETURNING` falhava com 42501. Sem enxergar, por isso, pessoa
 * fora do escopo.
 *
 * Passa pelas **Server Actions de verdade** (`features/contratos/actions.ts`),
 * não por insert cru: o defeito aparecia na tela, e a action de contrato ainda
 * lê e apaga `contrato_unidades`, que um insert isolado não exercita. O que é
 * dublado é só o encanamento de requisição do Next — o client vem da persona
 * autenticada, então quem responde é a RLS.
 *
 * `service_role` só no fixture: dar e tirar escopo, limpar o que as actions
 * criaram e o rastro delas em `auditoria`.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.11" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

const PREFIXO = "Teste RLS Estrutura";
const NOME_CONTRATANTE = `${PREFIXO} Contratante`;
const NOME_UNIDADE = `${PREFIXO} Unidade`;
const NUMERO_CONTRATO = "TESTE-RLS-EST-1";

let admin: Cliente;
let contratos: Cliente;
let rh: Cliente;

let contratanteId: string;
let unidadeId: string;
let contratoId: string;

/** As actions ligadas à persona, com a memoização de sessão zerada. */
async function actionsComo(cliente: Cliente) {
  estado.cliente = cliente;
  vi.resetModules();
  return import("@/features/contratos/actions");
}

async function limpar() {
  const criados = [
    ...exigir(await admin.from("contratos").select("id").eq("numero", NUMERO_CONTRATO), "sobra contrato"),
    ...exigir(await admin.from("unidades").select("id").like("nome", `${PREFIXO}%`), "sobra unidade"),
    ...exigir(await admin.from("contratantes").select("id").like("nome", `${PREFIXO}%`), "sobra contratante"),
  ].map((l) => l.id);

  if (criados.length > 0) await admin.from("auditoria").delete().in("entidade_id", criados);
  await admin.from("contratos").delete().eq("numero", NUMERO_CONTRATO); // vínculos saem em cascata
  await admin.from("unidades").delete().like("nome", `${PREFIXO}%`);
  await admin.from("contratantes").delete().like("nome", `${PREFIXO}%`);
}

beforeAll(async () => {
  admin = clienteDeFixture();
  await limpar();

  for (const persona of [PERSONAS.contratos, PERSONAS.rhDp]) {
    const existente = exigir(
      await admin.from("usuario_escopos").select("id").eq("usuario_id", persona.id),
      `escopo de ${persona.email}`,
    );
    if (existente.length > 0) {
      throw new Error(
        `${persona.email} já tem escopo cadastrado — no seed é escopo total. Outro teste ` +
          "deixou sujeira; este não vai sobrescrever. Apague o escopo e rode de novo.",
      );
    }
  }

  // Os dois presos ao 042: Contratos (tem contratos:editar) e RH/DP (só ver).
  exigir(
    await admin
      .from("usuario_escopos")
      .insert([
        { usuario_id: PERSONAS.contratos.id, contrato_id: CONTRATOS.c042 },
        { usuario_id: PERSONAS.rhDp.id, contrato_id: CONTRATOS.c042 },
      ])
      .select("id"),
    "escopos 042",
  );

  contratos = await como(PERSONAS.contratos.email);
  rh = await como(PERSONAS.rhDp.email);
}, 30_000);

afterAll(async () => {
  if (!admin) return;
  await admin
    .from("usuario_escopos")
    .delete()
    .in("usuario_id", [PERSONAS.contratos.id, PERSONAS.rhDp.id]);
  await limpar();
});

describe("interno com escopo no 042 e contratos:editar (Contratos/Coordenação)", () => {
  it("cria contratante pela action e lê de volta", async () => {
    const { criarContratante } = await actionsComo(contratos);

    const r = await criarContratante({ nome: NOME_CONTRATANTE, cnpj: "" });
    expect(r).toEqual({ ok: true });

    const { data } = await contratos.from("contratantes").select("id").eq("nome", NOME_CONTRATANTE);
    expect(data).toHaveLength(1);
    contratanteId = data![0].id;
  });

  it("cria unidade no contratante novo e lê de volta", async () => {
    const { criarUnidade } = await actionsComo(contratos);

    const r = await criarUnidade({ contratante_id: contratanteId, nome: NOME_UNIDADE });
    expect(r).toEqual({ ok: true });

    const { data } = await contratos.from("unidades").select("id").eq("nome", NOME_UNIDADE);
    expect(data).toHaveLength(1);
    unidadeId = data![0].id;
  });

  it("cria contrato com a unidade vinculada e lê de volta, vínculo incluído", async () => {
    const { criarContrato } = await actionsComo(contratos);

    const r = await criarContrato({
      contratante_id: contratanteId,
      numero: NUMERO_CONTRATO,
      unidades: [unidadeId],
    });
    expect(r).toEqual({ ok: true });

    const { data } = await contratos.from("contratos").select("id").eq("numero", NUMERO_CONTRATO);
    expect(data).toHaveLength(1);
    contratoId = data![0].id;

    const { data: vinculos } = await contratos
      .from("contrato_unidades")
      .select("unidade_id")
      .eq("contrato_id", contratoId);
    expect(vinculos).toEqual([{ unidade_id: unidadeId }]);
  });

  it("edita o contrato novo e desfaz o vínculo — DELETE também precisa enxergar a linha", async () => {
    const { editarContrato } = await actionsComo(contratos);

    const r = await editarContrato({
      id: contratoId,
      contratante_id: contratanteId,
      numero: NUMERO_CONTRATO,
      descricao: "editado com escopo",
      unidades: [],
    });
    expect(r).toEqual({ ok: true });

    const { data } = await contratos
      .from("contratos")
      .select("descricao, contrato_unidades(unidade_id)")
      .eq("id", contratoId)
      .single();
    expect(data).toEqual({ descricao: "editado com escopo", contrato_unidades: [] });
  });

  it("lê a estrutura comercial fora do escopo (contrato 077)", async () => {
    const { data } = await contratos.from("contratos").select("id").eq("id", CONTRATOS.c077);
    expect(data).toHaveLength(1);
  });

  it("continua sem ver pessoa fora do escopo", async () => {
    const soNo077 = exigir(
      await admin.from("alocacoes").select("pessoa_id").eq("contrato_id", CONTRATOS.c077),
      "pessoas do 077",
    ).map((a) => a.pessoa_id);
    const do042 = exigir(
      await admin.from("alocacoes").select("pessoa_id").eq("contrato_id", CONTRATOS.c042),
      "pessoas do 042",
    ).map((a) => a.pessoa_id);

    const { data: fora } = await contratos.from("pessoas").select("id").in("id", soNo077);
    expect(fora).toEqual([]);

    // Contraponto: o 0 acima não é "não vê pessoa nenhuma".
    const { data: dentro } = await contratos.from("pessoas").select("id").in("id", do042);
    expect(dentro).toHaveLength(new Set(do042).size);
  });
});

describe("interno com escopo no 042 SEM contratos:editar (RH/DP)", () => {
  it("segue vendo só os contratos do escopo — a 0013 não abriu leitura para quem só vê", async () => {
    const { data } = await rh.from("contratos").select("id");
    expect((data ?? []).map((c) => c.id)).toEqual([CONTRATOS.c042]);
  });

  it("não cria contratante: não tem contratos:criar", async () => {
    const { criarContratante } = await actionsComo(rh);
    const r = await criarContratante({ nome: `${PREFIXO} do RH`, cnpj: "" });
    expect(r.ok).toBe(false);
  });
});
