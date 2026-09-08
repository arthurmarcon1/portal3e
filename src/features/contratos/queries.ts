import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Leitura da estrutura comercial.
 *
 * Sempre com o client do usuário: quem filtra por organização e escopo é a
 * RLS, nunca um `where` no código (CLAUDE.md, invariante 1).
 */

export type Contratante = {
  id: string;
  nome: string;
  cnpj: string | null;
  status: string;
  contratos: number;
  unidades: number;
};

export type Contrato = {
  id: string;
  numero: string;
  descricao: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  status: string;
  contratante_id: string;
  contratante_nome: string;
  unidades: { id: string; nome: string }[];
};

export type Unidade = {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  status: string;
  contratante_id: string;
  contratante_nome: string;
  contratos: number;
};

/** Opção de combo: só o necessário para preencher um `select`. */
export type Opcao = { id: string; nome: string };

export async function listarContratantes(): Promise<Contratante[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("contratantes")
    .select("id, nome, cnpj, status, contratos(id), unidades(id)")
    .order("nome");

  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    cnpj: c.cnpj,
    status: c.status,
    contratos: c.contratos?.length ?? 0,
    unidades: c.unidades?.length ?? 0,
  }));
}

export async function listarContratos(): Promise<Contrato[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("contratos")
    // String literal única: concatenar com `+` apaga a inferência de tipos do
    // supabase-js e o retorno vira `GenericStringError`.
    .select(
      "id, numero, descricao, vigencia_inicio, vigencia_fim, status, contratante_id, contratantes(nome), contrato_unidades(unidades(id, nome))",
    )
    .order("numero");

  if (error) throw new Error(error.message);

  return (data ?? []).map((c) => ({
    id: c.id,
    numero: c.numero,
    descricao: c.descricao,
    vigencia_inicio: c.vigencia_inicio,
    vigencia_fim: c.vigencia_fim,
    status: c.status,
    contratante_id: c.contratante_id,
    contratante_nome: c.contratantes?.nome ?? "—",
    unidades: (c.contrato_unidades ?? [])
      .map((v) => v.unidades)
      .filter((u): u is { id: string; nome: string } => u !== null)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }));
}

export async function listarUnidades(): Promise<Unidade[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("unidades")
    .select(
      "id, nome, endereco, cidade, uf, status, contratante_id, contratantes(nome), contrato_unidades(contrato_id)",
    )
    .order("nome");

  if (error) throw new Error(error.message);

  return (data ?? []).map((u) => ({
    id: u.id,
    nome: u.nome,
    endereco: u.endereco,
    cidade: u.cidade,
    uf: u.uf,
    status: u.status,
    contratante_id: u.contratante_id,
    contratante_nome: u.contratantes?.nome ?? "—",
    contratos: u.contrato_unidades?.length ?? 0,
  }));
}

/** Contratantes ativos, para os combos de contrato e unidade. */
export async function opcoesContratantes(): Promise<Opcao[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("contratantes")
    .select("id, nome")
    .eq("status", "ativo")
    .order("nome");

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Unidades ativas agrupadas por contratante.
 *
 * O formulário de contrato usa isso para oferecer só as unidades do
 * contratante escolhido — vincular unidade de um cliente ao contrato de outro
 * não faz sentido, e a policy da migração 0005 também não deixaria.
 */
export async function unidadesPorContratante(): Promise<
  Record<string, Opcao[]>
> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("unidades")
    .select("id, nome, contratante_id")
    .eq("status", "ativo")
    .order("nome");

  if (error) throw new Error(error.message);

  const agrupado: Record<string, Opcao[]> = {};
  for (const u of data ?? []) {
    (agrupado[u.contratante_id] ??= []).push({ id: u.id, nome: u.nome });
  }
  return agrupado;
}
