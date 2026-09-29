import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { CAMPOS_DO_QUADRO } from "./quadro";

/**
 * Área do contratante (F5.1) — requisito de SEGURANÇA, não de UI.
 *
 * docs/02 bloqueia para todo contratante: CPF completo (só os 3 últimos),
 * data de nascimento, endereço, telefone pessoal, e-mail pessoal, dados
 * bancários, salário; pessoa sem alocação ativa no escopo; auditoria.
 *
 * Cada campo é testado sozinho, e cada "o fiscal não lê" tem o contraponto do
 * RH lendo o MESMO registro — senão uma coluna vazia passaria por bloqueio.
 * Dados bancários e salário não têm coluna no modelo (docs/03); o que prova
 * que não aparecem é o quadro devolver exatamente a lista de docs/02.
 *
 * Por último, a varredura: toda resposta que a área do contratante recebe
 * (tabelas, funções e as consultas que as páginas usam) é serializada, e nenhum
 * dos valores restritos do fixture pode aparecer em lugar nenhum dela.
 */

const estado = vi.hoisted(() => ({ cliente: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => estado.cliente,
}));

type Cliente = SupabaseClient<Database>;

const SENHA = "portal3e2026";
const ORG = "1fac8b3c-4860-5606-836b-ca4c8dd420d0";
const EMAILS = {
  rhDp: "rh_dp@3e.com.br",
  suporte: "suporte_auditoria@3e.com.br",
  fiscal: "fiscal@hsaolucas.com.br",
} as const;
const FISCAL = "4a2ade92-25e1-58f2-afda-9198dd3da8df";
const PERFIL_FISCAL = "cb994b78-0287-5a88-b97d-bd99968e1a04";
const MARIA = { usuarioId: "2c739684-5dce-5ac4-a8f5-4bccfd9150e2", pessoaId: "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c", cpf: "01000791998" };
const C042 = "d594b950-e556-5f78-ae9b-98f6b1d12b63";
const C077 = "e716f5c1-3603-596b-a331-1d307ccf82f3";
const UNIDADE_CENTRAL = "79baf83d-a8c3-5a89-90bf-6ae7d29a2302";
const TIPOS = {
  comunicado: "fa73e13b-2b1c-54fe-b0f3-ed9702d3dab2",
  espelho: "941fb37f-659c-5222-9dfd-f2fc3b893e37",
} as const;

function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** CPF válido a partir de 9 dígitos — fora da faixa do seed (01000791998–01023757044). */
function cpfValido(base: string): string {
  const dv = (s: string) => {
    const soma = [...s].reduce((t, d, i) => t + Number(d) * (s.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return String(r === 10 ? 0 : r);
  };
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
}

/** Pessoa com TODOS os campos restritos preenchidos — cada um com valor único. */
const ATIVA = {
  nome: "Teste F51 Ativa",
  cpf: cpfValido("095100001"),
  matricula: "F51-001",
  data_nascimento: "1987-04-13",
  telefone: "51988776655",
  email_pessoal: "f51.ativa@teste-contratante.invalid",
  endereco: "Rua Restrita do Teste F51, 4321",
};
const ENCERRADA = { nome: "Teste F51 Encerrada", cpf: cpfValido("095100002") };
const VENCIDA = { nome: "Teste F51 Vigencia Vencida", cpf: cpfValido("095100003") };
const CAMPOS_RESTRITOS = ["cpf", "data_nascimento", "telefone", "email_pessoal", "endereco"] as const;
const IP_DA_CIENCIA = "203.0.113.51";
const AGENTE_DA_CIENCIA = "agente-restrito-f51";

let admin: Cliente;
const clientes = new Map<string, Cliente>();
const pessoas: { ativa?: string; encerrada?: string; vencida?: string } = {};
const alocacoes: { ativa?: string; encerrada?: string; vencida?: string } = {};
const documentos: string[] = [];
let coletivo042: string;
let coletivo077: string;
let espelhoDaAtiva: string;
let comunicadoDaAtiva: string;
let comunicadoDaEncerrada: string;
let cienciaDaMaria: string;
let deuAdministracao = false;

function ambiente() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    throw new Error(
      "Credenciais do Supabase ausentes. Este teste precisa do banco: rode `npm test` (ver a seção Testes do CLAUDE.md).",
    );
  }
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

async function novaPessoa(campos: { nome: string; cpf: string } & Record<string, string>): Promise<string> {
  return exigir(await admin.from("pessoas").insert({ org_id: ORG, ...campos }).select("id").single(), campos.nome).id;
}

async function novaAlocacao(pessoa: string, extra: { status: "ativa" | "encerrada"; data_fim?: string }) {
  return exigir(
    await admin
      .from("alocacoes")
      .insert({
        org_id: ORG,
        pessoa_id: pessoa,
        contrato_id: C042,
        unidade_id: UNIDADE_CENTRAL,
        funcao: "Recepcionista F51",
        data_inicio: "2026-01-05",
        ...extra,
      })
      .select("id")
      .single(),
    `alocação ${extra.status}`,
  ).id;
}

async function novoDocumento(doc: {
  tipo_id: string;
  escopo: "individual" | "coletivo";
  pessoa_id?: string;
  titulo: string;
}): Promise<string> {
  const id = exigir(
    await admin
      .from("documentos")
      .insert({
        org_id: ORG,
        ...doc,
        status: "publicado",
        arquivo_path: `teste-f51/${crypto.randomUUID()}.pdf`,
        arquivo_hash: "0".repeat(64),
        publicado_em: new Date().toISOString(),
        prazo_ciencia: "2026-12-31",
      })
      .select("id")
      .single(),
    doc.titulo,
  ).id;
  documentos.push(id);
  return id;
}

beforeAll(async () => {
  const { url, service } = ambiente();
  admin = createClient<Database>(url, service, { auth: { persistSession: false } });

  const { error: semMigracao } = await admin.rpc("quadro_do_contratante");
  if (semMigracao) throw new Error(`migração 0023 ausente no alvo de teste: ${semMigracao.message}`);

  const cpfs = [ATIVA.cpf, ENCERRADA.cpf, VENCIDA.cpf];
  const colisao = exigir(await admin.from("pessoas").select("cpf").in("cpf", cpfs), "colisão de CPF");
  if (colisao.length > 0) {
    throw new Error(
      `CPF de teste já existe em pessoas (${colisao.map((c) => c.cpf).join(", ")}). Sobra de execução que morreu: ` +
        "apague essas pessoas à mão. Este teste não sobrescreve.",
    );
  }
  const jaTem = exigir(
    await admin.from("perfil_permissoes").select("modulo").eq("perfil_id", PERFIL_FISCAL).eq("modulo", "administracao"),
    "permissões do fiscal",
  );
  if (jaTem.length > 0) {
    throw new Error("O perfil de fiscal já tem `administracao` — sujeira de outro teste. Este não vai sobrescrever.");
  }

  pessoas.ativa = await novaPessoa(ATIVA);
  pessoas.encerrada = await novaPessoa(ENCERRADA);
  pessoas.vencida = await novaPessoa(VENCIDA);
  alocacoes.ativa = await novaAlocacao(pessoas.ativa, { status: "ativa" });
  alocacoes.encerrada = await novaAlocacao(pessoas.encerrada, { status: "encerrada", data_fim: "2026-03-31" });
  // Situação ainda "ativa", mas a vigência acabou: a data manda.
  alocacoes.vencida = await novaAlocacao(pessoas.vencida, { status: "ativa", data_fim: "2026-02-28" });

  coletivo042 = await novoDocumento({ tipo_id: TIPOS.comunicado, escopo: "coletivo", titulo: "F51 comunicado do 042" });
  coletivo077 = await novoDocumento({ tipo_id: TIPOS.comunicado, escopo: "coletivo", titulo: "F51 comunicado do 077" });
  exigir(
    await admin
      .from("documento_destinatarios")
      .insert([
        { documento_id: coletivo042, contrato_id: C042 },
        { documento_id: coletivo077, contrato_id: C077 },
      ])
      .select("id"),
    "destinatários",
  );
  espelhoDaAtiva = await novoDocumento({
    tipo_id: TIPOS.espelho,
    escopo: "individual",
    pessoa_id: pessoas.ativa,
    titulo: "F51 espelho da Ativa",
  });
  comunicadoDaAtiva = await novoDocumento({
    tipo_id: TIPOS.comunicado,
    escopo: "individual",
    pessoa_id: pessoas.ativa,
    titulo: "F51 comunicado da Ativa",
  });
  comunicadoDaEncerrada = await novoDocumento({
    tipo_id: TIPOS.comunicado,
    escopo: "individual",
    pessoa_id: pessoas.encerrada,
    titulo: "F51 comunicado da Encerrada",
  });

  // Ciência de verdade, pelo caminho do servidor (0018), com IP e agente
  // únicos — para a varredura provar que nenhum dos dois sai.
  const ciencia = exigir(
    await admin.rpc("registrar_ciencia", {
      p_usuario: MARIA.usuarioId,
      p_documento: coletivo042,
      p_tipo: "confirmacao",
      p_justificativa: "",
      p_ip: IP_DA_CIENCIA,
      p_user_agent: AGENTE_DA_CIENCIA,
    }),
    "ciência da Maria",
  );
  cienciaDaMaria = ciencia[0].ciencia_id;
}, 60_000);

afterAll(async () => {
  if (!admin) return;
  if (deuAdministracao) {
    await admin.from("perfil_permissoes").delete().eq("perfil_id", PERFIL_FISCAL).eq("modulo", "administracao");
  }
  if (documentos.length > 0) {
    await admin.from("ciencias").delete().in("documento_id", documentos);
    await admin.from("notificacoes").delete().in("referencia_id", documentos);
    await admin.from("documentos").delete().in("id", documentos);
  }
  const ids = Object.values(pessoas).filter(Boolean) as string[];
  if (ids.length > 0) {
    await admin.from("alocacoes").delete().in("pessoa_id", ids);
    await admin.from("pessoas").delete().in("id", ids);
  }
});

describe("campos restritos de docs/02, um a um", () => {
  for (const campo of CAMPOS_RESTRITOS) {
    it(`${campo}: o fiscal não lê; o RH lê o mesmo registro`, async () => {
      const fiscal = await como(EMAILS.fiscal);
      const rh = await como(EMAILS.rhDp);

      const doFiscal = await fiscal.from("pessoas").select(campo).eq("id", pessoas.ativa!);
      expect(doFiscal.error).toBeNull();
      expect(doFiscal.data).toEqual([]);

      const doRh = await rh.from("pessoas").select(campo).eq("id", pessoas.ativa!);
      expect(doRh.data).toEqual([{ [campo]: ATIVA[campo] }]);
    });
  }

  it("a linha inteira de `pessoas` também não: 0 linhas para o fiscal, nem a dele próprio contrato", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const { data } = await fiscal.from("pessoas").select("*");
    expect(data).toEqual([]);
  });

  it("o quadro devolve exatamente os campos de docs/02, com o CPF nos 3 últimos dígitos", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const { data, error } = await fiscal.rpc("quadro_do_contratante");
    expect(error).toBeNull();
    const linha = data!.find((l) => l.pessoa_id === pessoas.ativa);
    expect(linha).toBeDefined();
    expect(Object.keys(linha!).sort()).toEqual([...CAMPOS_DO_QUADRO].sort());
    expect(linha).toMatchObject({
      nome: ATIVA.nome,
      matricula: ATIVA.matricula,
      cpf_final: ATIVA.cpf.slice(-3),
      funcao: "Recepcionista F51",
      contrato_id: C042,
      unidade_id: UNIDADE_CENTRAL,
      situacao: "ativa",
      data_inicio: "2026-01-05",
    });
  });

  it("o quadro é só do contratante: o RH recebe vazio (ele lê pessoas pela tabela)", async () => {
    const rh = await como(EMAILS.rhDp);
    const { data } = await rh.rpc("quadro_do_contratante");
    expect(data).toEqual([]);
  });
});

describe("só alocação vigente", () => {
  it("quem saiu (encerrada) e quem passou da vigência não estão no quadro; quem está, está", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const ids = new Set((await fiscal.rpc("quadro_do_contratante")).data!.map((l) => l.pessoa_id));
    expect(ids.has(pessoas.ativa!)).toBe(true);
    expect(ids.has(pessoas.encerrada!)).toBe(false);
    expect(ids.has(pessoas.vencida!)).toBe(false);
  });

  it("alocações: o fiscal lê só a vigente; o RH lê as três", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const rh = await como(EMAILS.rhDp);
    const tres = [alocacoes.ativa!, alocacoes.encerrada!, alocacoes.vencida!];
    const doFiscal = (await fiscal.from("alocacoes").select("id").in("id", tres)).data!.map((a) => a.id);
    const doRh = (await rh.from("alocacoes").select("id").in("id", tres)).data!.map((a) => a.id);
    expect(doFiscal).toEqual([alocacoes.ativa]);
    expect(doRh.sort()).toEqual([...tres].sort());
  });

  it("documento de quem saiu: o fiscal não lê; o de quem está, lê; o RH lê os dois", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const rh = await como(EMAILS.rhDp);
    const dois = [comunicadoDaAtiva, comunicadoDaEncerrada];
    expect((await fiscal.from("documentos").select("id").in("id", dois)).data!.map((d) => d.id)).toEqual([
      comunicadoDaAtiva,
    ]);
    expect((await rh.from("documentos").select("id").in("id", dois)).data).toHaveLength(2);
  });

  it("a Maria no 043 (encerrada, seed) não aparece ao fiscal do 042 por aquela alocação", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const { data } = await fiscal.rpc("quadro_do_contratante");
    expect(data!.filter((l) => l.pessoa_id === MARIA.pessoaId).every((l) => l.contrato_id === C042)).toBe(true);
  });
});

describe("ciência: agregada, sem IP, agente nem justificativa", () => {
  it("o fiscal não lê a linha de `ciencias`; o RH lê a mesma, com o IP", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const rh = await como(EMAILS.rhDp);
    expect((await fiscal.from("ciencias").select("id").eq("id", cienciaDaMaria)).data).toEqual([]);
    expect((await rh.from("ciencias").select("ip").eq("id", cienciaDaMaria)).data).toEqual([{ ip: IP_DA_CIENCIA }]);
  });

  it("a pendência conta o quadro vigente do 042 e a resposta da Maria", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const { data, error } = await fiscal.rpc("pendencias_de_ciencia_do_contratante");
    expect(error).toBeNull();
    const linha = data!.find((d) => d.documento_id === coletivo042);

    const vigentes = new Set(
      exigir(
        await admin.from("alocacoes").select("pessoa_id, status, data_fim, pessoas(status)").eq("contrato_id", C042),
        "alocações do 042",
      )
        .filter((a) => a.status !== "encerrada" && (!a.data_fim || a.data_fim >= hojeEmBrasilia()) && a.pessoas?.status === "ativo")
        .map((a) => a.pessoa_id),
    );
    expect(linha).toMatchObject({ alcancados: vigentes.size, respondidos: 1, pendentes: vigentes.size - 1 });
    expect(Object.keys(linha!)).not.toContain("pessoa_id");
  });

  it("não traz comunicado de outro contrato nem espelho — que o RH lê", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const rh = await como(EMAILS.rhDp);
    const ids = (await fiscal.rpc("pendencias_de_ciencia_do_contratante")).data!.map((d) => d.documento_id);
    expect(ids).not.toContain(coletivo077);
    expect(ids).not.toContain(espelhoDaAtiva);
    expect((await fiscal.from("documentos").select("id").eq("id", espelhoDaAtiva)).data).toEqual([]);
    expect((await rh.from("documentos").select("id").in("id", [espelhoDaAtiva, coletivo077])).data).toHaveLength(2);
  });
});

describe("varredura: nenhum valor restrito em nenhuma resposta da área", () => {
  it("tabelas, funções e as consultas das páginas, serializadas", async () => {
    const fiscal = await como(EMAILS.fiscal);
    const respostas: unknown[] = [];
    for (const tabela of [
      "pessoas",
      "alocacoes",
      "documentos",
      "documento_destinatarios",
      "ciencias",
      "solicitacoes",
      "solicitacao_eventos",
      "anexos",
      "usuarios",
      "contratos",
      "unidades",
      "notificacoes",
    ] as const) {
      respostas.push(await fiscal.from(tabela).select("*"));
    }
    respostas.push(await fiscal.rpc("quadro_do_contratante"));
    respostas.push(await fiscal.rpc("pendencias_de_ciencia_do_contratante"));

    estado.cliente = fiscal;
    vi.resetModules();
    const q = await import("./queries");
    respostas.push(await q.quadroDoContratante(), await q.pendenciasDeCiencia(), await q.solicitacoesAbertas(FISCAL));

    const tudo = JSON.stringify(respostas);
    // O quadro está lá (a varredura não passou por vazio)...
    expect(tudo).toContain(ATIVA.nome);
    // ...e nada do que docs/02 bloqueia.
    for (const valor of [
      ATIVA.cpf,
      ATIVA.data_nascimento,
      ATIVA.telefone,
      ATIVA.email_pessoal,
      ATIVA.endereco,
      MARIA.cpf,
      `${MARIA.cpf}@func`,
      IP_DA_CIENCIA,
      AGENTE_DA_CIENCIA,
      ENCERRADA.nome,
      VENCIDA.nome,
    ]) {
      expect(tudo, `vazou: ${valor}`).not.toContain(valor);
    }
  });
});

describe("guarda estrutural: administracao:ver não abre nada a contratante", () => {
  it("mesmo com a permissão dada ao perfil de fiscal, auditoria e usuários seguem fechados; o Suporte lê", async () => {
    exigir(
      await admin.from("perfil_permissoes").insert({ perfil_id: PERFIL_FISCAL, modulo: "administracao", acao: "ver" }).select("perfil_id"),
      "administracao:ver ao fiscal",
    );
    deuAdministracao = true;
    try {
      const fiscal = await como(EMAILS.fiscal);
      const suporte = await como(EMAILS.suporte);
      expect((await fiscal.from("auditoria").select("id").limit(5)).data).toEqual([]);
      expect((await fiscal.from("usuarios").select("id")).data!.map((u) => u.id)).toEqual([FISCAL]);
      expect((await fiscal.from("usuario_perfis").select("usuario_id")).data!.every((u) => u.usuario_id === FISCAL)).toBe(true);
      expect((await fiscal.from("usuario_escopos").select("usuario_id")).data!.every((u) => u.usuario_id === FISCAL)).toBe(true);

      expect((await suporte.from("auditoria").select("id").limit(5)).data!.length).toBeGreaterThan(0);
      expect((await suporte.from("usuarios").select("id")).data!.length).toBeGreaterThan(1);
    } finally {
      await admin.from("perfil_permissoes").delete().eq("perfil_id", PERFIL_FISCAL).eq("modulo", "administracao");
      deuAdministracao = false;
    }
  });
});
