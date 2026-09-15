import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  clienteDeFixture,
  como,
  CONTRATOS,
  criarDocumento,
  exigir,
  idsVisiveis,
  ORG,
  PERSONAS,
  PESSOA_JOAO,
  TIPOS,
  type Cliente,
} from "./apoio";

/**
 * RLS de `documentos` — docs/03, "Como testar a RLS".
 *
 * O coração da invariante 4: dado sensível bloqueado por padrão. Os casos
 * que mais importam aqui são regressões que já aconteceram de verdade:
 *
 * - **0008** — `documentos_escrita` em `for all` dava a quem tem
 *   `documentos:editar` leitura de `medico`, `bancario` e `folha` de
 *   qualquer pessoa. Contratos/Coordenação é a persona certa para provar que
 *   não dá mais: tem `documentos:editar` e só a categoria `jornada`.
 * - **0010** — rascunho tinha ficado invisível para todos, e criar rascunho
 *   falhava no `RETURNING`.
 *
 * Todo documento é de fixture e sai no afterAll. O seed não tem documento.
 * Não há tipo `bancario` no seed, então o fixture cria um só para este
 * arquivo.
 */

let admin: Cliente;
let tipoBancario: string;
const criados: string[] = [];

/** Documentos sensíveis de uma pessoa do 042, publicados e em rascunho. */
const sensiveis: Record<"medico" | "bancario" | "folha", { publicado: string; rascunho: string }> =
  {} as never;
let espelhoPublicado: string;
let espelhoRascunho: string;
let comunicadoDaMaria: string;
let comunicadoDoJoao: string;
let comunicadoRascunho: string;
let asoDoJoao: string;
let coletivo042: string;
let coletivo077: string;

async function doc(...args: Parameters<typeof criarDocumento>) {
  const id = await criarDocumento(...args);
  criados.push(id);
  return id;
}

beforeAll(async () => {
  admin = clienteDeFixture();

  // Sobra de execução anterior que morreu: o tipo é exclusivo deste arquivo.
  const chave = "teste_rls_bancario";
  const sobra = exigir(
    await admin.from("documento_tipos").select("id").eq("org_id", ORG).eq("chave", chave),
    "tipo bancário anterior",
  );
  for (const { id } of sobra) {
    await admin.from("documentos").delete().eq("tipo_id", id);
    await admin.from("documento_tipos").delete().eq("id", id);
  }
  tipoBancario = exigir(
    await admin
      .from("documento_tipos")
      .insert({ org_id: ORG, chave, nome: "Teste RLS bancário", categoria: "bancario" })
      .select("id")
      .single(),
    "tipo bancário",
  ).id;

  const tipoPor = { medico: TIPOS.aso, bancario: tipoBancario, folha: TIPOS.holerite };
  for (const categoria of ["medico", "bancario", "folha"] as const) {
    sensiveis[categoria] = {
      publicado: await doc(admin, {
        tipo_id: tipoPor[categoria],
        escopo: "individual",
        pessoa_id: PESSOA_JOAO,
        status: "publicado",
        titulo: `RLS ${categoria} publicado`,
      }),
      rascunho: await doc(admin, {
        tipo_id: tipoPor[categoria],
        escopo: "individual",
        pessoa_id: PESSOA_JOAO,
        status: "rascunho",
        titulo: `RLS ${categoria} rascunho`,
      }),
    };
  }
  asoDoJoao = sensiveis.medico.publicado;

  espelhoPublicado = await doc(admin, {
    tipo_id: TIPOS.espelho,
    escopo: "individual",
    pessoa_id: PESSOA_JOAO,
    status: "publicado",
    titulo: "RLS espelho publicado",
  });
  espelhoRascunho = await doc(admin, {
    tipo_id: TIPOS.espelho,
    escopo: "individual",
    pessoa_id: PESSOA_JOAO,
    status: "rascunho",
    titulo: "RLS espelho rascunho",
  });
  comunicadoDaMaria = await doc(admin, {
    tipo_id: TIPOS.comunicado,
    escopo: "individual",
    pessoa_id: PERSONAS.maria.pessoaId,
    status: "publicado",
    titulo: "RLS comunicado da Maria",
  });
  comunicadoDoJoao = await doc(admin, {
    tipo_id: TIPOS.comunicado,
    escopo: "individual",
    pessoa_id: PESSOA_JOAO,
    status: "publicado",
    titulo: "RLS comunicado do Joao",
  });

  // Categoria aberta (`geral`), para o único motivo de não ler ser o status.
  comunicadoRascunho = await doc(admin, {
    tipo_id: TIPOS.comunicado,
    escopo: "individual",
    pessoa_id: PESSOA_JOAO,
    status: "rascunho",
    titulo: "RLS comunicado rascunho",
  });

  coletivo042 = await doc(admin, {
    tipo_id: TIPOS.comunicado,
    escopo: "coletivo",
    status: "publicado",
    titulo: "RLS coletivo 042",
  });
  coletivo077 = await doc(admin, {
    tipo_id: TIPOS.comunicado,
    escopo: "coletivo",
    status: "publicado",
    titulo: "RLS coletivo 077",
  });
  exigir(
    await admin
      .from("documento_destinatarios")
      .insert([
        { documento_id: coletivo042, contrato_id: CONTRATOS.c042 },
        { documento_id: coletivo077, contrato_id: CONTRATOS.c077 },
      ])
      .select("id"),
    "destinatários",
  );
}, 60_000);

afterAll(async () => {
  if (!admin) return;
  if (criados.length > 0) await admin.from("documentos").delete().in("id", criados);
  if (tipoBancario) await admin.from("documento_tipos").delete().eq("id", tipoBancario);
});

describe("funcionário", () => {
  it("lê o próprio documento", async () => {
    const maria = await como(PERSONAS.maria.email);
    expect(await idsVisiveis(maria, "documentos", [comunicadoDaMaria])).toHaveLength(1);
  });

  it("busca documento do funcionário B pelo id e recebe 0 linhas", async () => {
    const maria = await como(PERSONAS.maria.email);
    // Categoria `geral`, de propósito: o que barra é a titularidade, não a
    // sensibilidade.
    expect(await idsVisiveis(maria, "documentos", [comunicadoDoJoao])).toEqual([]);
  });

  it("lê coletivo direcionado ao contrato dele: 1 linha", async () => {
    const maria = await como(PERSONAS.maria.email);
    expect(await idsVisiveis(maria, "documentos", [coletivo042])).toEqual([coletivo042]);
  });

  it("não lê coletivo direcionado a outro contrato", async () => {
    const maria = await como(PERSONAS.maria.email);
    expect(await idsVisiveis(maria, "documentos", [coletivo077])).toEqual([]);
  });
});

describe("fiscal do 042 (contratante)", () => {
  it("tenta ler documento categoria medico de pessoa do escopo dele: 0 linhas", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsVisiveis(fiscal, "documentos", [asoDoJoao])).toEqual([]);
  });

  it("lê documento geral da mesma pessoa — o 0 acima é a categoria, não o escopo", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsVisiveis(fiscal, "documentos", [comunicadoDoJoao])).toEqual([
      comunicadoDoJoao,
    ]);
  });

  it("não lê nenhuma categoria bloqueada ao contratante, publicada ou não", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    const todos = Object.values(sensiveis).flatMap((d) => [d.publicado, d.rascunho]);
    expect(await idsVisiveis(fiscal, "documentos", todos)).toEqual([]);
  });

  it("lê o coletivo do contrato dele", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    expect(await idsVisiveis(fiscal, "documentos", [coletivo042])).toEqual([coletivo042]);
  });

  it("não lê coletivo dirigido a contrato de outro cliente", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    // docs/02: contratante é "sempre limitado ao(s) contrato(s) e unidade(s)
    // do escopo do usuário". O 077 é da Rede Bom Preço.
    expect(await idsVisiveis(fiscal, "documentos", [coletivo077])).toEqual([]);
  });

  it("não lê o público-alvo de coletivo de outro cliente", async () => {
    const fiscal = await como(PERSONAS.fiscal.email);
    const { data } = await fiscal
      .from("documento_destinatarios")
      .select("id")
      .eq("documento_id", coletivo077);
    expect(data).toEqual([]);
  });
});

describe("interno com documentos:editar e sem a categoria (Contratos/Coordenação) — regressão da 0008", () => {
  for (const categoria of ["medico", "bancario", "folha"] as const) {
    it(`não lê ${categoria} de terceiro, publicado nem rascunho`, async () => {
      const contratos = await como(PERSONAS.contratos.email);
      const { publicado, rascunho } = sensiveis[categoria];
      expect(await idsVisiveis(contratos, "documentos", [publicado, rascunho])).toEqual([]);
    });
  }

  it("lê a categoria que tem (jornada), publicada e em rascunho — o 0 acima não é tabela vazia", async () => {
    const contratos = await como(PERSONAS.contratos.email);
    expect(
      await idsVisiveis(contratos, "documentos", [espelhoPublicado, espelhoRascunho]),
    ).toEqual([espelhoPublicado, espelhoRascunho].sort());
  });

  it("Admin geral, que tem as categorias, lê os seis — o fixture é legível", async () => {
    const adminGeral = await como(PERSONAS.adminGeral.email);
    const todos = Object.values(sensiveis).flatMap((d) => [d.publicado, d.rascunho]);
    expect(await idsVisiveis(adminGeral, "documentos", todos)).toEqual([...todos].sort());
  });
});

describe("rascunho", () => {
  let criadoPorContratos: string | null = null;

  afterAll(async () => {
    if (criadoPorContratos) await admin.from("documentos").delete().eq("id", criadoPorContratos);
  });

  it("quem tem documentos:editar cria e lê de volta o que criou: 1 linha", async () => {
    const contratos = await como(PERSONAS.contratos.email);

    // Pelo client da persona, com RETURNING: é exatamente o caminho que
    // falhava com 42501 antes da 0010.
    const { data, error } = await contratos
      .from("documentos")
      .insert({
        org_id: ORG,
        tipo_id: TIPOS.comunicado,
        escopo: "individual",
        pessoa_id: PESSOA_JOAO,
        titulo: "RLS rascunho criado pela persona",
        arquivo_path: `teste-rls/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "0".repeat(64),
      })
      .select("id, status")
      .single();

    expect(error).toBeNull();
    expect(data?.status).toBe("rascunho");
    criadoPorContratos = data!.id;

    expect(await idsVisiveis(contratos, "documentos", [criadoPorContratos])).toHaveLength(1);
  });

  it("quem tem só documentos:ver (Suporte/Auditoria) não lê rascunho: 0 linhas", async () => {
    const suporte = await como(PERSONAS.suporte.email);
    // Categoria `geral` nos dois: o que barra é o status, não a sensibilidade.
    const alvo = [comunicadoRascunho, ...(criadoPorContratos ? [criadoPorContratos] : [])];
    expect(await idsVisiveis(suporte, "documentos", alvo)).toEqual([]);
  });

  it("Suporte/Auditoria lê o mesmo documento quando publicado — o 0 acima é o status", async () => {
    const suporte = await como(PERSONAS.suporte.email);
    expect(await idsVisiveis(suporte, "documentos", [comunicadoDoJoao])).toEqual([
      comunicadoDoJoao,
    ]);
  });
});
