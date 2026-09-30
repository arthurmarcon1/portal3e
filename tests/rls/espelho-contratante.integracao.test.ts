import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clienteDeFixture, como, exigir, idsVisiveis, ORG, PERSONAS, PESSOA_JOAO, TIPOS, type Cliente } from "./apoio";

/**
 * Contratante vê o espelho que o funcionário confirmou (0027).
 *
 * Decisão do gestor (docs/06, 2026-09-30): exceção por documento, não
 * liberação da categoria `jornada`. Cada "não enxerga" tem contraponto — a
 * Maria (titular) ou o RH/DP (interno) lendo o mesmo espelho —, senão um 0
 * provaria só que a tabela está vazia.
 *
 * Ciência pelo caminho real (`registrar_ciencia`, 0018), com o `service_role`
 * do fixture. Todo documento, ciência e solicitação sai no afterAll; o seed
 * não tem documento.
 */

const PREFIXO = "RLS espelho contratante";
const JOAO_USUARIO = "d291f5ba-25c3-5319-84a5-fdb824f00b8c";
/** Contratante com escopo só na unidade da Maria (79baf8…), no 042. O João está em outra unidade. */
const GESTOR_UNIDADE = "gestor.unidade@hsaolucas.com.br";

let admin: Cliente;
const criados: string[] = [];

let semCiencia: string;
let confirmado: string;
let divergido: string;
let asoConfirmado: string;
let doJoaoConfirmado: string;

async function limpar(ids: string[]) {
  if (ids.length === 0) return;
  const sols = (await admin.from("solicitacoes").select("id").in("documento_id", ids)).data ?? [];
  const solIds = sols.map((s) => s.id);
  if (solIds.length) {
    await admin.from("notificacoes").delete().in("referencia_id", solIds);
    await admin.from("solicitacoes").delete().in("id", solIds);
  }
  await admin.from("notificacoes").delete().in("referencia_id", ids);
  await admin.from("ciencias").delete().in("documento_id", ids);
  // A retificação aponta para a v1 (substitui_id): apaga a v2 antes.
  await admin.from("documentos").delete().in("id", ids).not("substitui_id", "is", null);
  await admin.from("documentos").delete().in("id", ids);
}

async function espelho(
  titulo: string,
  pessoaId: string,
  extra: { tipo_id?: string; substitui_id?: string; versao?: number } = {},
) {
  const { id } = exigir(
    await admin
      .from("documentos")
      .insert({
        org_id: ORG,
        tipo_id: extra.tipo_id ?? TIPOS.espelho,
        escopo: "individual",
        pessoa_id: pessoaId,
        status: "publicado",
        titulo: `${PREFIXO} ${titulo}`,
        competencia: "2026-08-01",
        substitui_id: extra.substitui_id ?? null,
        versao: extra.versao ?? 1,
        arquivo_path: `teste-rls/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "0".repeat(64),
        publicado_em: new Date().toISOString(),
      })
      .select("id")
      .single(),
    `documento ${titulo}`,
  );
  criados.push(id);
  return id;
}

async function responder(usuario: string, documento: string, tipo: "confirmacao" | "divergencia") {
  exigir(
    await admin.rpc("registrar_ciencia", {
      p_usuario: usuario,
      p_documento: documento,
      p_tipo: tipo,
      p_justificativa: tipo === "divergencia" ? "Faltou o plantão do dia 12, que eu trabalhei." : "",
      p_ip: "127.0.0.1",
      p_user_agent: "teste-rls",
    }),
    `ciência ${tipo}`,
  );
}

beforeAll(async () => {
  admin = clienteDeFixture();

  // Sobra de execução anterior que morreu no meio.
  const sobra = exigir(
    await admin.from("documentos").select("id").eq("org_id", ORG).like("titulo", `${PREFIXO}%`),
    "sobras",
  );
  await limpar(sobra.map((d) => d.id));

  const maria = PERSONAS.maria.pessoaId;
  semCiencia = await espelho("sem ciência", maria);
  confirmado = await espelho("confirmado", maria);
  divergido = await espelho("divergido", maria);
  asoConfirmado = await espelho("ASO confirmado", maria, { tipo_id: TIPOS.aso });
  doJoaoConfirmado = await espelho("do João, confirmado", PESSOA_JOAO);

  await responder(PERSONAS.maria.id, confirmado, "confirmacao");
  await responder(PERSONAS.maria.id, divergido, "divergencia");
  await responder(PERSONAS.maria.id, asoConfirmado, "confirmacao");
  await responder(JOAO_USUARIO, doJoaoConfirmado, "confirmacao");
}, 60_000);

afterAll(async () => {
  if (!admin) return;
  await limpar(criados);
}, 30_000);

describe("fiscal do 042 e o espelho da Maria", () => {
  it("espelho sem ciência: invisível", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsVisiveis(fiscal, "documentos", [semCiencia])).toEqual([]);
  });

  it("espelho com ciência confirmada: visível", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsVisiveis(fiscal, "documentos", [confirmado])).toEqual([confirmado]);
  });

  it("espelho com divergência: invisível", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsVisiveis(fiscal, "documentos", [divergido])).toEqual([]);
  });

  it("contraponto: a Maria vê o próprio espelho nos três casos", async () => {
    const maria = await como(PERSONAS.maria.email);
    expect(await idsVisiveis(maria, "documentos", [semCiencia, confirmado, divergido])).toEqual(
      [semCiencia, confirmado, divergido].sort(),
    );
  });

  it("contraponto: o RH/DP (interno, com `jornada`) vê os três", async () => {
    const rh = await como(PERSONAS.rhDp.email);
    expect(await idsVisiveis(rh, "documentos", [semCiencia, confirmado, divergido])).toEqual(
      [semCiencia, confirmado, divergido].sort(),
    );
  });

  it("a ciência continua ilegível: nem a confirmação nem a justificativa da divergência chegam a ele", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    const rh = await como(PERSONAS.rhDp.email);
    const alvo = [confirmado, divergido];
    expect((await fiscal.from("ciencias").select("id").in("documento_id", alvo)).data).toEqual([]);
    expect((await rh.from("ciencias").select("id").in("documento_id", alvo)).data).toHaveLength(2);
  });

  it("confirmação só libera espelho: ASO confirmado segue bloqueado (medico)", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    const rh = await como(PERSONAS.rhDp.email);
    expect(await idsVisiveis(fiscal, "documentos", [asoConfirmado])).toEqual([]);
    expect(await idsVisiveis(rh, "documentos", [asoConfirmado])).toEqual([asoConfirmado]);
  });
});

describe("escopo: gestor da unidade da Maria", () => {
  it("vê o espelho confirmado da Maria e não o do João, confirmado, de outra unidade", async () => {
    const gestor = await como(GESTOR_UNIDADE);
    expect(await idsVisiveis(gestor, "documentos", [confirmado, doJoaoConfirmado])).toEqual([confirmado]);
  });

  it("contraponto: o fiscal, com escopo no contrato inteiro, vê o do João", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsVisiveis(fiscal, "documentos", [doJoaoConfirmado])).toEqual([doJoaoConfirmado]);
  });
});

describe("retificação de espelho divergido", () => {
  let v1: string;
  let v2: string;

  beforeAll(async () => {
    const maria = PERSONAS.maria.pessoaId;
    v1 = await espelho("retificado v1", maria);
    await responder(PERSONAS.maria.id, v1, "divergencia");
    // Mesmo desenho da publicação real: a v2 aponta para a v1, e a v1 arquiva.
    v2 = await espelho("retificado v2", maria, { substitui_id: v1, versao: 2 });
    exigir(await admin.from("documentos").update({ status: "arquivado" }).eq("id", v1).select("id"), "arquivar v1");
  }, 30_000);

  it("a retificação ainda sem resposta é invisível ao fiscal, como a v1 divergida", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    const maria = await como(PERSONAS.maria.email);
    expect(await idsVisiveis(fiscal, "documentos", [v1, v2])).toEqual([]);
    expect(await idsVisiveis(maria, "documentos", [v1, v2])).toEqual([v1, v2].sort());
  });

  describe("depois que a Maria confirma a v2", () => {
    beforeAll(async () => {
      await responder(PERSONAS.maria.id, v2, "confirmacao");
    });

    it("o fiscal vê a v2, e nunca a v1 divergida", async () => {
      const fiscal = await como(PERSONAS.fiscal.email);
      expect(await idsVisiveis(fiscal, "documentos", [v1, v2])).toEqual([v2]);
    });

    it("a Maria segue vendo as duas", async () => {
      const maria = await como(PERSONAS.maria.email);
      expect(await idsVisiveis(maria, "documentos", [v1, v2])).toEqual([v1, v2].sort());
    });
  });
});
