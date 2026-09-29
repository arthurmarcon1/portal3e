import { celula } from "@/features/auditoria/csv";

/**
 * O relatório pronto, independente de formato — a tela, o CSV e o PDF leem
 * a mesma coisa. Puro.
 */

export type Valor = string | number | null;

export type Tabela = { colunas: string[]; linhas: Valor[][] };

export type Relatorio = {
  titulo: string;
  /** "Período de …", "Competência …", "Situação atual". */
  recorte: string;
  /** Agregado que abre o relatório (por contrato e unidade, por tipo...). */
  resumo: Tabela | null;
  detalhe: Tabela;
  /** Itens distintos do relatório, com o nome ("pendências", "ciências"). */
  total: { valor: number; rotulo: string };
};

const BOM = "﻿";

/**
 * CSV no mesmo padrão da auditoria (F2.2): `;`, BOM, CRLF e célula
 * protegida contra injeção de fórmula. Só o detalhe — o resumo é soma dele,
 * e planilha faz soma.
 */
export function gerarCsv(r: Relatorio): string {
  const linhas = [r.detalhe.colunas.map(celula).join(";")];
  for (const l of r.detalhe.linhas) linhas.push(l.map((v) => celula(typeof v === "number" ? String(v) : v)).join(";"));
  return BOM + linhas.join("\r\n") + "\r\n";
}

export function nomeDoArquivo(chave: string, hoje: string, extensao: "csv" | "pdf"): string {
  return `relatorio-${chave}-${hoje}.${extensao}`;
}
