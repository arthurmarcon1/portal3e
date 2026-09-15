/**
 * CSV da trilha de auditoria.
 *
 * Feito para abrir no Excel em português sem assistente de importação:
 * separador `;` (a vírgula é decimal aqui), BOM de UTF-8 (sem ele o Excel lê
 * como Latin-1 e o "ç" vira lixo) e quebra de linha CRLF.
 *
 * Módulo puro — o route handler só junta os dados e chama.
 */

export type LinhaCsvAuditoria = {
  criado_em: string;
  usuario_nome: string | null;
  usuario_email: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  ip: string | null;
  user_agent: string | null;
  detalhes: unknown;
};

const CABECALHO = [
  "data_hora",
  "usuario",
  "email",
  "acao",
  "entidade",
  "entidade_id",
  "ip",
  "user_agent",
  "detalhes",
] as const;

const BOM = "﻿";

/**
 * Célula segura.
 *
 * Injeção de fórmula: texto que começa com `=`, `+`, `-`, `@`, TAB ou CR é
 * executado como fórmula pelo Excel. Boa parte do que está na trilha veio de
 * digitação de terceiros — o identificador de uma falha de login é o que o
 * atacante digitou. Um apóstrofo na frente desarma sem perder o texto.
 */
export function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let texto = typeof valor === "string" ? valor : JSON.stringify(valor);

  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;

  if (/[";\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/** Data e hora de Brasília, legível e ordenável: `2026-09-14 15:53:28`. */
export function dataHoraBrasilia(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // `sv-SE` formata como ISO (aaaa-mm-dd hh:mm:ss), que ordena como texto.
  return d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function gerarCsvAuditoria(linhas: readonly LinhaCsvAuditoria[]): string {
  const saida = [CABECALHO.join(";")];
  for (const l of linhas) {
    saida.push(
      [
        dataHoraBrasilia(l.criado_em),
        l.usuario_nome,
        l.usuario_email,
        l.acao,
        l.entidade,
        l.entidade_id,
        l.ip,
        l.user_agent,
        l.detalhes,
      ]
        .map(celula)
        .join(";"),
    );
  }
  return BOM + saida.join("\r\n") + "\r\n";
}
