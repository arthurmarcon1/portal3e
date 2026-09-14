/**
 * Módulos e ações do Portal — a lista canônica.
 *
 * Módulo puro, sem `server-only`: a grade de permissões em
 * `/admin/acessos/perfis` é Client Component e precisa das mesmas listas que
 * `exigirPermissao` usa no servidor. Uma segunda cópia no cliente divergiria
 * no primeiro módulo novo — e divergência aqui é tela oferecendo permissão que
 * o banco recusa.
 *
 * O `check` de `perfil_permissoes` reproduz estas listas no banco (migração
 * 0001). Módulo novo entra aqui, lá, e na matriz de docs/02.
 */

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
