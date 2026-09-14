import "server-only";

import { criarClienteServidor } from "@/lib/supabase/server";
import type { Acao, Modulo } from "@/lib/auth/modulos";

/**
 * Leitura da administração de acesso.
 *
 * Com o client do usuário: `usuarios_leitura` exige `administracao:ver` para
 * enxergar alguém além de si mesmo, e é a RLS quem aplica isso — não um filtro
 * no código (CLAUDE.md, invariante 1).
 */

export type PerfilResumo = { id: string; nome: string; chave: string };

export type UsuarioAcesso = {
  id: string;
  nome: string;
  email_login: string;
  tipo: string;
  status: string;
  precisa_trocar_senha: boolean;
  ultimo_acesso: string | null;
  pessoa_id: string | null;
  perfis: PerfilResumo[];
  escopo: {
    contratos: { id: string; numero: string }[];
    unidades: { id: string; nome: string }[];
  };
};

export async function listarUsuarios(): Promise<UsuarioAcesso[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("usuarios")
    // String literal única: concatenar com `+` apaga a inferência de tipos do
    // supabase-js e o retorno vira `GenericStringError`.
    .select(
      "id, nome, email_login, tipo, status, precisa_trocar_senha, ultimo_acesso, pessoa_id, usuario_perfis(perfis(id, nome, chave)), usuario_escopos(contrato_id, unidade_id, contratos(numero), unidades(nome))",
    )
    .order("nome");

  if (error) throw new Error(error.message);

  return (data ?? []).map((u) => ({
    id: u.id,
    nome: u.nome,
    email_login: u.email_login,
    tipo: u.tipo,
    status: u.status,
    precisa_trocar_senha: u.precisa_trocar_senha,
    ultimo_acesso: u.ultimo_acesso,
    pessoa_id: u.pessoa_id,
    perfis: (u.usuario_perfis ?? [])
      .flatMap((v) => (v.perfis ? [v.perfis] : []))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    escopo: {
      contratos: (u.usuario_escopos ?? [])
        .flatMap((e) =>
          e.contrato_id && e.contratos
            ? [{ id: e.contrato_id, numero: e.contratos.numero }]
            : [],
        )
        .sort((a, b) => a.numero.localeCompare(b.numero, "pt-BR")),
      unidades: (u.usuario_escopos ?? [])
        .flatMap((e) =>
          e.unidade_id && e.unidades ? [{ id: e.unidade_id, nome: e.unidades.nome }] : [],
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    },
  }));
}

export type Perfil = {
  id: string;
  chave: string;
  nome: string;
  aplica_a: string;
  descricao: string | null;
  /** Duplas `modulo:acao` marcadas. */
  permissoes: string[];
  /** Quantos usuários carregam este perfil hoje. */
  usuarios: number;
};

export async function listarPerfis(): Promise<Perfil[]> {
  const supabase = await criarClienteServidor();

  const { data, error } = await supabase
    .from("perfis")
    .select(
      "id, chave, nome, aplica_a, descricao, perfil_permissoes(modulo, acao), usuario_perfis(usuario_id)",
    )
    .order("aplica_a")
    .order("nome");

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    chave: p.chave,
    nome: p.nome,
    aplica_a: p.aplica_a,
    descricao: p.descricao,
    permissoes: (p.perfil_permissoes ?? [])
      .map((v) => `${v.modulo}:${v.acao}`)
      .sort(),
    usuarios: p.usuario_perfis?.length ?? 0,
  }));
}

/** Pessoas ativas ainda SEM usuário, para o combo de criação de funcionário. */
export type PessoaSemUsuario = { id: string; nome: string; cpf: string; matricula: string | null };

export async function pessoasSemUsuario(): Promise<PessoaSemUsuario[]> {
  const supabase = await criarClienteServidor();

  const [pessoas, usuarios] = await Promise.all([
    supabase
      .from("pessoas")
      .select("id, nome, cpf, matricula")
      .eq("status", "ativo")
      .order("nome"),
    supabase.from("usuarios").select("pessoa_id"),
  ]);

  if (pessoas.error) throw new Error(pessoas.error.message);
  if (usuarios.error) throw new Error(usuarios.error.message);

  // Diferença no servidor em vez de `not.in` na query: a lista de ids cresce
  // com o quadro e viraria uma URL enorme no PostgREST.
  const comUsuario = new Set(
    (usuarios.data ?? []).flatMap((u) => (u.pessoa_id ? [u.pessoa_id] : [])),
  );

  return (pessoas.data ?? []).filter((p) => !comUsuario.has(p.id));
}

/** Contratos e unidades ativos, para montar o escopo. */
export async function opcoesDeEscopo(): Promise<{
  contratos: { id: string; nome: string }[];
  unidades: { id: string; nome: string }[];
}> {
  const supabase = await criarClienteServidor();

  const [contratos, unidades] = await Promise.all([
    supabase
      .from("contratos")
      .select("id, numero, contratantes(nome)")
      .eq("status", "ativo")
      .order("numero"),
    supabase
      .from("unidades")
      .select("id, nome, contratantes(nome)")
      .eq("status", "ativo")
      .order("nome"),
  ]);

  if (contratos.error) throw new Error(contratos.error.message);
  if (unidades.error) throw new Error(unidades.error.message);

  return {
    contratos: (contratos.data ?? []).map((c) => ({
      id: c.id,
      nome: `${c.numero} · ${c.contratantes?.nome ?? "—"}`,
    })),
    unidades: (unidades.data ?? []).map((u) => ({
      id: u.id,
      nome: `${u.nome} · ${u.contratantes?.nome ?? "—"}`,
    })),
  };
}

/** Só para a grade de perfis: a lista canônica de módulos e ações. */
export type CelulaMatriz = { modulo: Modulo; acao: Acao };
