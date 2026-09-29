import type { Acao, Modulo } from "@/lib/auth/modulos";

/**
 * Os seis relatórios da F5.3 (docs/05). Módulo puro: a lista é a mesma na
 * tela (Client e Server) e na rota de exportação.
 *
 * Cada relatório exige, além de `relatorios:ver` (tela) ou
 * `relatorios:exportar` (arquivo), a permissão do módulo de onde o dado sai —
 * relatório não é atalho para ler o que o perfil não lê. E o dado vem pelo
 * client do usuário: a RLS recorta o escopo de quem exporta.
 */

export type ChaveRelatorio = "pendencias" | "ciencias" | "solicitacoes" | "quadro" | "sst" | "acessos";
export type TipoDeFiltro = "nenhum" | "periodo" | "competencia";
export type Permissao = { modulo: Modulo; acao: Acao };

export type DefinicaoDeRelatorio = {
  chave: ChaveRelatorio;
  titulo: string;
  descricao: string;
  filtro: TipoDeFiltro;
  /** Para ver o relatório na tela. */
  ver: Permissao;
  /** Além de `relatorios:exportar`, para baixar o arquivo. */
  exportar: Permissao;
  /**
   * Abrir na tela também grava em `auditoria`, não só exportar. Só o de
   * acessos e downloads: é o relatório que audita quem audita — ler a trilha
   * de todos precisa deixar rastro na própria trilha.
   */
  auditaVisualizacao?: true;
};

export const RELATORIOS: readonly DefinicaoDeRelatorio[] = [
  {
    chave: "pendencias",
    titulo: "Pendências de ciência",
    descricao: "Quem ainda não respondeu a documentos publicados, por contrato, unidade e pessoa.",
    filtro: "nenhum",
    ver: { modulo: "documentos", acao: "ver" },
    exportar: { modulo: "documentos", acao: "ver" },
  },
  {
    chave: "ciencias",
    titulo: "Ciências registradas",
    descricao: "Confirmações e divergências da competência, com protocolo.",
    filtro: "competencia",
    ver: { modulo: "documentos", acao: "ver" },
    exportar: { modulo: "documentos", acao: "ver" },
  },
  {
    chave: "solicitacoes",
    titulo: "Solicitações",
    descricao: "Por tipo e situação, com tempo de atendimento e prazo.",
    filtro: "periodo",
    ver: { modulo: "solicitacoes", acao: "ver" },
    exportar: { modulo: "solicitacoes", acao: "ver" },
  },
  {
    chave: "quadro",
    titulo: "Quadro alocado",
    descricao: "Por contrato e unidade, com entradas e saídas do período.",
    filtro: "periodo",
    ver: { modulo: "pessoas", acao: "ver" },
    exportar: { modulo: "pessoas", acao: "ver" },
  },
  {
    chave: "sst",
    titulo: "Conformidade de SST",
    descricao: "ASO e treinamentos vencidos, a vencer e em dia.",
    filtro: "nenhum",
    ver: { modulo: "sst", acao: "ver" },
    exportar: { modulo: "sst", acao: "ver" },
  },
  {
    chave: "acessos",
    titulo: "Acessos e downloads",
    descricao: "Entradas no Portal, leituras de dado sensível e downloads, por usuário e período.",
    filtro: "periodo",
    // docs/02: trilha é de quem tem administracao:ver; exportá-la é
    // administracao:exportar (decisão de 2026-09-15 — Suporte lê, não exporta).
    ver: { modulo: "administracao", acao: "ver" },
    exportar: { modulo: "administracao", acao: "exportar" },
    auditaVisualizacao: true,
  },
];

export function definicaoDe(chave: string): DefinicaoDeRelatorio | undefined {
  return RELATORIOS.find((r) => r.chave === chave);
}

/** Ações da trilha que contam como acesso ou download (relatório 6). */
export const ACOES_DE_ACESSO = ["login", "logout", "falha_login", "login_bloqueado", "ver", "download"] as const;
