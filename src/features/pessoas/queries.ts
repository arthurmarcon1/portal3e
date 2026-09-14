import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Leitura de pessoas e alocações.
 *
 * Sempre com o client do usuário: quem filtra por organização e escopo é a
 * RLS, nunca um `where` no código (CLAUDE.md, invariante 1). Em especial,
 * `pessoas_leitura` já garante que o contratante só alcance quem tem alocação
 * no escopo dele — esta camada não repete a regra, e não pode contradizê-la.
 */

export type Alocacao = {
  id: string;
  funcao: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  contrato_id: string;
  contrato_numero: string;
  unidade_id: string;
  unidade_nome: string;
};

export type Pessoa = {
  id: string;
  nome: string;
  cpf: string;
  matricula: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  email_pessoal: string | null;
  endereco: string | null;
  status: string;
  criado_em: string;
  /** Histórico completo, em ordem cronológica inversa. */
  alocacoes: Alocacao[];
};

/**
 * Linha da listagem: a pessoa mais as alocações que ainda valem hoje.
 *
 * Campos que só a ficha usa (nascimento, endereço, e-mail) ficam de fora da
 * consulta de propósito — listagem não carrega dado pessoal que a tela não
 * mostra.
 */
export type PessoaLinha = {
  id: string;
  nome: string;
  cpf: string;
  matricula: string | null;
  status: string;
  /** Alocações não encerradas. Vazio = pessoa sem posto no momento. */
  vigentes: Alocacao[];
};

// String literal única: concatenar com `+` apaga a inferência de tipos do
// supabase-js e o retorno vira `GenericStringError`.
const CAMPOS_ALOCACAO =
  "id, funcao, status, data_inicio, data_fim, contrato_id, unidade_id, contratos(numero), unidades(nome)";

type AlocacaoBruta = {
  id: string;
  funcao: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  contrato_id: string;
  unidade_id: string;
  contratos: { numero: string } | null;
  unidades: { nome: string } | null;
};

function montarAlocacao(a: AlocacaoBruta): Alocacao {
  return {
    id: a.id,
    funcao: a.funcao,
    status: a.status,
    data_inicio: a.data_inicio,
    data_fim: a.data_fim,
    contrato_id: a.contrato_id,
    contrato_numero: a.contratos?.numero ?? "—",
    unidade_id: a.unidade_id,
    unidade_nome: a.unidades?.nome ?? "—",
  };
}

/** Mais recente primeiro. É a ordem que a ficha mostra (F1.2). */
function maisRecentePrimeiro(a: Alocacao, b: Alocacao): number {
  return b.data_inicio.localeCompare(a.data_inicio);
}

export async function listarPessoas(): Promise<PessoaLinha[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("pessoas")
    .select(
      `id, nome, cpf, matricula, status, alocacoes(${CAMPOS_ALOCACAO})`,
    )
    .order("nome");

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    cpf: p.cpf,
    matricula: p.matricula,
    status: p.status,
    vigentes: (p.alocacoes ?? [])
      .map(montarAlocacao)
      .filter((a) => a.status !== "encerrada")
      .sort(maisRecentePrimeiro),
  }));
}

/**
 * Ficha completa de uma pessoa, ou `null` se ela não existe — ou se a RLS não
 * deixa este usuário vê-la. Os dois casos são o mesmo `null` de propósito: a
 * tela não confirma a existência de quem o usuário não pode alcançar.
 */
export async function buscarPessoa(id: string): Promise<Pessoa | null> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("pessoas")
    .select(
      `id, nome, cpf, matricula, data_nascimento, telefone, email_pessoal, endereco, status, criado_em, alocacoes(${CAMPOS_ALOCACAO})`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    cpf: data.cpf,
    matricula: data.matricula,
    data_nascimento: data.data_nascimento,
    telefone: data.telefone,
    email_pessoal: data.email_pessoal,
    endereco: data.endereco,
    status: data.status,
    criado_em: data.criado_em,
    alocacoes: (data.alocacoes ?? []).map(montarAlocacao).sort(maisRecentePrimeiro),
  };
}

/** Contrato ativo com as unidades que ele atende, para o formulário de alocação. */
export type ContratoComUnidades = {
  id: string;
  numero: string;
  contratante_nome: string;
  unidades: { id: string; nome: string }[];
};

/**
 * Só contratos ativos: alocar gente em contrato desativado é erro de
 * digitação, não caso de uso. O histórico já alocado continua visível na
 * ficha — nada é escondido, só não se cria mais.
 */
export async function contratosParaAlocacao(): Promise<ContratoComUnidades[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id, numero, status, contratantes(nome), contrato_unidades(unidades(id, nome, status))",
    )
    .eq("status", "ativo")
    .order("numero");

  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    contratante_nome: c.contratantes?.nome ?? "—",
    unidades: (c.contrato_unidades ?? [])
      // flatMap em vez de map+filter: preserva a tipagem que o supabase-js
      // inferiu, sem precisar redeclarar a forma da linha num type predicate.
      .flatMap((v) => (v.unidades ? [v.unidades] : []))
      .filter((u) => u.status === "ativo")
      .map((u) => ({ id: u.id, nome: u.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }));
}
