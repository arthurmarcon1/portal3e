import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { rotaInicial, type TipoUsuario } from "@/lib/auth/rotas";
import { ErroDePermissao } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/server";

/**
 * Sessão, perfis e permissões.
 *
 * Ponto de partida de toda tela e de toda Server Action. As funções são
 * memoizadas por requisição com `cache()` do React: a mesma renderização pode
 * chamar `temPermissao` dez vezes sem dez idas ao banco.
 *
 * O mapa de rotas mora em `./rotas` porque o proxy também precisa dele e não
 * pode importar nada que use `next/headers`.
 */

export { rotaInicial };
export type { TipoUsuario };

export const MODULOS = [
  "pessoas",
  "contratos",
  "documentos",
  "jornada",
  "solicitacoes",
  "comunicacao",
  "sst",
  "relatorios",
  "administracao",
] as const;

export const ACOES = ["ver", "criar", "editar", "excluir", "exportar"] as const;

export type Modulo = (typeof MODULOS)[number];
export type Acao = (typeof ACOES)[number];

export type UsuarioSessao = {
  id: string;
  orgId: string;
  pessoaId: string | null;
  tipo: TipoUsuario;
  nome: string;
  emailLogin: string;
  precisaTrocarSenha: boolean;
};

/**
 * Usuário da sessão, ou `null`.
 *
 * `getUser()` valida o token no servidor do Supabase — não confia no cookie.
 * A linha de `usuarios` vem pela policy `usuarios_leitura` (o usuário sempre
 * lê a si mesmo). Usuário sem linha em `usuarios`, ou com status diferente de
 * `ativo`, é tratado como não autenticado: falha fechada.
 */
export const getUsuario = cache(async (): Promise<UsuarioSessao | null> => {
  const supabase = await criarClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("id, org_id, pessoa_id, tipo, nome, email_login, precisa_trocar_senha, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || data.status !== "ativo") return null;

  return {
    id: data.id,
    orgId: data.org_id,
    pessoaId: data.pessoa_id,
    tipo: data.tipo,
    nome: data.nome,
    emailLogin: data.email_login,
    precisaTrocarSenha: data.precisa_trocar_senha,
  };
});

/** Igual a `getUsuario`, mas manda para o login em vez de devolver `null`. */
export async function exigirUsuario(): Promise<UsuarioSessao> {
  const usuario = await getUsuario();
  if (!usuario) redirect("/login");
  return usuario;
}

/** Só deixa passar quem é do tipo esperado; os demais vão para a própria área. */
export async function exigirTipo(tipo: TipoUsuario): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();
  if (usuario.tipo !== tipo) redirect(rotaInicial(usuario.tipo));
  return usuario;
}

/**
 * Permissões efetivas do usuário, no formato `modulo:acao`.
 *
 * Vem de `usuario_perfis` × `perfil_permissoes` — banco, nunca constante no
 * código (docs/03, decisão 4: permissão é dado). Mudar o que um perfil pode
 * fazer é `insert`, não deploy.
 */
export const permissoesDoUsuario = cache(async (): Promise<ReadonlySet<string>> => {
  const usuario = await getUsuario();
  if (!usuario) return new Set<string>();

  const supabase = await criarClienteServidor();

  const { data: vinculos, error: erroVinculos } = await supabase
    .from("usuario_perfis")
    .select("perfil_id")
    .eq("usuario_id", usuario.id);

  if (erroVinculos || !vinculos?.length) return new Set<string>();

  const { data: permissoes, error } = await supabase
    .from("perfil_permissoes")
    .select("modulo, acao")
    .in(
      "perfil_id",
      vinculos.map((v) => v.perfil_id),
    );

  if (error || !permissoes) return new Set<string>();

  return new Set(permissoes.map((p) => `${p.modulo}:${p.acao}`));
});

export async function temPermissao(modulo: Modulo, acao: Acao): Promise<boolean> {
  const permissoes = await permissoesDoUsuario();
  return permissoes.has(`${modulo}:${acao}`);
}

/**
 * Barreira de permissão das Server Actions e das telas internas.
 *
 * Lança `ErroDePermissao`; quem chama devolve `{ ok: false, erro }` com
 * `mensagemDeErro`. Isto é a primeira camada — a segunda, que vale de fato, é
 * a RLS no banco.
 */
export async function exigirPermissao(modulo: Modulo, acao: Acao): Promise<UsuarioSessao> {
  const usuario = await exigirUsuario();
  if (!(await temPermissao(modulo, acao))) {
    throw new ErroDePermissao();
  }
  return usuario;
}
