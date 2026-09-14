import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/types";

/**
 * Pessoa sem alocação × escopo (migração 0007).
 *
 * A regra: pessoa sem NENHUMA alocação é visível para quem tem
 * `pessoas:editar`, independentemente de escopo — não pertence a contrato
 * nenhum, então não há o que segregar. Assim que ganha alocação, vale o
 * escopo normal.
 *
 * Nenhum interno do seed tem escopo cadastrado (todos são `escopo_total`),
 * então o cenário não existe de graça: o fixture **dá** um escopo ao RH/DP
 * para o teste e devolve o estado no fim. É o que faz este teste provar algo
 * — com escopo total, qualquer política passaria.
 *
 * `service_role` aparece só no fixture. Os casos consultam como a persona,
 * pelo client anônimo, porque quem precisa responder é a RLS.
 */

const SENHA = "portal3e2026";
const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";

/** RH/DP: tem `pessoas:editar` na matriz de docs/02. */
const RH_DP = "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3";
/** Contrato 042 — o escopo que o RH/DP recebe durante o teste. */
const CONTRATO_042 = "d594b950-e556-5f78-ae9b-98f6b1d12b63";
/** Contrato 077 (Bom Preço): fora do escopo, para provar que ele ainda corta. */
const CONTRATO_077 = "e716f5c1-3603-596b-a331-1d307ccf82f3";

/** Fora da faixa de CPF do seed. Ver importacao.integracao.test.ts. */
const CPF_SEM_ALOCACAO = "01027717713";

let admin: SupabaseClient<Database>;
let pessoaSemAlocacao: string;

async function como(email: string): Promise<SupabaseClient<Database>> {
  const cliente = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw new Error(`não foi possível autenticar ${email}: ${error.message}`);
  return cliente;
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes. " +
        "Este teste precisa do banco: veja o alvo em CLAUDE.md.",
    );
  }
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  const { data: colisao } = await admin
    .from("pessoas")
    .select("cpf")
    .eq("cpf", CPF_SEM_ALOCACAO);
  if (colisao && colisao.length > 0) {
    throw new Error(
      `CPF de teste ${CPF_SEM_ALOCACAO} já existe. Escolha outro fora da faixa do seed.`,
    );
  }

  // Pessoa recém-cadastrada, ainda sem posto — o caso da decisão.
  const { data: pessoa, error } = await admin
    .from("pessoas")
    .insert({ org_id: ORG, nome: "Recem Cadastrada Sem Posto", cpf: CPF_SEM_ALOCACAO })
    .select("id")
    .single();
  if (error) throw new Error(`fixture: ${error.message}`);
  pessoaSemAlocacao = pessoa.id;

  // Tira o RH/DP do escopo total, prendendo-o ao contrato 042.
  const { error: erroEscopo } = await admin
    .from("usuario_escopos")
    .insert({ usuario_id: RH_DP, contrato_id: CONTRATO_042 });
  if (erroEscopo) throw new Error(`fixture (escopo): ${erroEscopo.message}`);
});

afterAll(async () => {
  if (!admin) return;
  // O seed precisa voltar exatamente ao que era: o RH/DP é escopo total.
  await admin.from("usuario_escopos").delete().eq("usuario_id", RH_DP);
  if (pessoaSemAlocacao) await admin.from("pessoas").delete().eq("id", pessoaSemAlocacao);
});

describe("interno com escopo", () => {
  it("enxerga a pessoa que ainda não tem alocação", async () => {
    const rh = await como("rh_dp@3e.com.br");

    const { data } = await rh.from("pessoas").select("id, nome").eq("id", pessoaSemAlocacao);

    expect(data).toHaveLength(1);
    expect(data?.[0].nome).toBe("Recem Cadastrada Sem Posto");
  });

  it("continua sem enxergar quem está alocado fora do escopo dele", async () => {
    const rh = await como("rh_dp@3e.com.br");

    // Alguém alocado só no contrato 077, que não está no escopo do RH/DP.
    const { data: deFora } = await admin
      .from("alocacoes")
      .select("pessoa_id")
      .eq("contrato_id", CONTRATO_077)
      .limit(1)
      .single();

    const { data } = await rh.from("pessoas").select("id").eq("id", deFora!.pessoa_id);

    // É esta linha que prova que a 0007 não virou "vale tudo": se a checagem
    // de "sem alocação" passasse pela RLS de `alocacoes`, esta pessoa
    // apareceria, porque o RH/DP não vê a alocação dela.
    expect(data).toHaveLength(0);
  });

  it("enxerga quem está alocado dentro do escopo dele", async () => {
    const rh = await como("rh_dp@3e.com.br");

    const { data: deDentro } = await admin
      .from("alocacoes")
      .select("pessoa_id")
      .eq("contrato_id", CONTRATO_042)
      .limit(1)
      .single();

    const { data } = await rh.from("pessoas").select("id").eq("id", deDentro!.pessoa_id);
    expect(data).toHaveLength(1);
  });

  it("deixa de enxergar a pessoa assim que ela ganha alocação fora do escopo", async () => {
    const { data: unidade } = await admin
      .from("contrato_unidades")
      .select("unidade_id")
      .eq("contrato_id", CONTRATO_077)
      .limit(1)
      .single();

    const { error } = await admin.from("alocacoes").insert({
      org_id: ORG,
      pessoa_id: pessoaSemAlocacao,
      contrato_id: CONTRATO_077,
      unidade_id: unidade!.unidade_id,
      funcao: "Auxiliar de teste",
      data_inicio: "2026-09-01",
    });
    expect(error).toBeNull();

    const rh = await como("rh_dp@3e.com.br");
    const { data } = await rh.from("pessoas").select("id").eq("id", pessoaSemAlocacao);

    // A janela é só até a primeira alocação: depois, escopo normal.
    expect(data).toHaveLength(0);

    await admin.from("alocacoes").delete().eq("pessoa_id", pessoaSemAlocacao);
  });
});

describe("contratante", () => {
  it("não enxerga pessoa sem alocação, porque não tem pessoas:editar", async () => {
    const fiscal = await como("fiscal@hsaolucas.com.br");

    const { data } = await fiscal.from("pessoas").select("id").eq("id", pessoaSemAlocacao);

    expect(data).toHaveLength(0);
  });
});
