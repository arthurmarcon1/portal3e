import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TRANSICOES, vencida, type StatusSolicitacao } from "./fluxo";

/**
 * A tela oferece as transições de `TRANSICOES`; o banco aceita as de
 * `app.transicao_valida` (0020). Se as duas tabelas se desencontrarem, a tela
 * oferece botão que dá erro — ou esconde transição que vale. O teste lê a
 * função direto da migração.
 */
describe("TRANSICOES espelha app.transicao_valida", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260929100000_solicitacoes_sla_e_fluxo.sql"),
    "utf8",
  );
  const corpo = sql.slice(sql.indexOf("function app.transicao_valida"), sql.indexOf("else false"));
  const doBanco: Record<string, string[]> = {};
  for (const [, de, para] of corpo.matchAll(/when '(\w+)'\s+then p_para in \(([^)]*)\)/g)) {
    doBanco[de] = [...para.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
  }

  it("mesmas origens e mesmos destinos", () => {
    const daTela = Object.fromEntries(
      Object.entries(TRANSICOES)
        .filter(([, para]) => para.length > 0)
        .map(([de, para]) => [de, [...para].sort()]),
    );
    expect(daTela).toEqual(doBanco);
  });
});

describe("vencida", () => {
  const hoje = "2026-10-10";
  it("prazo antes de hoje e em aberto", () => {
    expect(vencida("2026-10-09", "em_analise", hoje)).toBe(true);
    expect(vencida("2026-10-10", "em_analise", hoje)).toBe(false);
  });
  it("encerrada ou decidida não vence", () => {
    for (const s of ["concluida", "cancelada", "aprovada", "recusada"] as StatusSolicitacao[]) {
      expect(vencida("2026-01-01", s, hoje)).toBe(false);
    }
  });
});
