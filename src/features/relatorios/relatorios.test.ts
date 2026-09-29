import { describe, expect, it } from "vitest";

import { RELATORIOS } from "./definicoes";
import { lerRecorte } from "./filtros";
import { montarPendencias, montarQuadro, montarSolicitacoes, type Pendencia } from "./montagem";
import { gerarCsv, type Relatorio } from "./relatorio";

const HOJE = "2026-09-30";

describe("definições", () => {
  it("acessos e downloads: ver pede administracao:ver; exportar, administracao:exportar", () => {
    const acessos = RELATORIOS.find((r) => r.chave === "acessos")!;
    expect(acessos.ver).toEqual({ modulo: "administracao", acao: "ver" });
    expect(acessos.exportar).toEqual({ modulo: "administracao", acao: "exportar" });
  });

  it("os seis de docs/05, cada um com o módulo de onde o dado sai", () => {
    expect(RELATORIOS.map((r) => [r.chave, r.ver.modulo])).toEqual([
      ["pendencias", "documentos"],
      ["ciencias", "documentos"],
      ["solicitacoes", "solicitacoes"],
      ["quadro", "pessoas"],
      ["sst", "sst"],
      ["acessos", "administracao"],
    ]);
  });
});

describe("lerRecorte", () => {
  it("período padrão: últimos 30 dias", () => {
    expect(lerRecorte("periodo", new URLSearchParams(), HOJE)).toEqual({
      ok: true,
      recorte: { tipo: "periodo", de: "2026-08-31", ate: HOJE },
    });
  });

  it("recusa início depois do fim, data impossível e mais de 366 dias", () => {
    expect(lerRecorte("periodo", new URLSearchParams("de=2026-09-10&ate=2026-09-01"), HOJE).ok).toBe(false);
    expect(lerRecorte("periodo", new URLSearchParams("de=2026-02-30&ate=2026-03-01"), HOJE).ok).toBe(false);
    expect(lerRecorte("periodo", new URLSearchParams("de=2024-01-01&ate=2026-01-01"), HOJE).ok).toBe(false);
  });

  it("competência padrão é o mês corrente; formato aaaa-mm", () => {
    expect(lerRecorte("competencia", new URLSearchParams(), HOJE)).toEqual({
      ok: true,
      recorte: { tipo: "competencia", competencia: "2026-09" },
    });
    expect(lerRecorte("competencia", new URLSearchParams("competencia=2026-13"), HOJE).ok).toBe(false);
  });
});

describe("montagem", () => {
  const p = (x: Partial<Pendencia>): Pendencia => ({
    documento_id: "d1",
    titulo: "Comunicado",
    tipo_nome: "Comunicado",
    publicado_em: "2026-09-01T10:00:00Z",
    prazo_ciencia: "2026-10-10",
    pessoa_id: "p1",
    pessoa_nome: "Ana",
    matricula: "1",
    ...x,
  });

  it("pendências: total conta pares documento×pessoa, mesmo com a pessoa em duas unidades", () => {
    const r = montarPendencias(
      [p({}), p({ documento_id: "d2", prazo_ciencia: "2026-09-20" }), p({ pessoa_id: "p2", pessoa_nome: "Bia" })],
      [
        { pessoa_id: "p1", contrato: "042", unidade: "Central" },
        { pessoa_id: "p1", contrato: "042", unidade: "Anexo" },
      ],
      HOJE,
      "Situação atual",
    );
    expect(r.total.valor).toBe(3);
    expect(r.detalhe.linhas).toHaveLength(5); // p1 em 2 unidades × 2 docs + p2 sem lotação
    expect(r.resumo!.linhas).toContainEqual(["042", "Central", 1, 2, 1]);
    expect(r.resumo!.linhas).toContainEqual(["—", "sem alocação vigente", 1, 1, 0]);
  });

  it("solicitações: tempo em dias corridos até o encerramento, ou até hoje", () => {
    const r = montarSolicitacoes(
      [
        { protocolo: "1", tipo: "ferias", status: "concluida", contrato: null, criado_em: "2026-09-01T12:00:00Z", prazo: "2026-09-08", concluida_em: "2026-09-10T12:00:00Z" },
        { protocolo: "2", tipo: "ferias", status: "aberta", contrato: null, criado_em: "2026-09-20T12:00:00Z", prazo: "2026-10-05", concluida_em: null },
      ],
      HOJE,
      "",
      (t) => t,
      (s) => s,
    );
    expect(r.detalhe.linhas.map((l) => [l[0], l[7], l[8]])).toEqual([
      ["1", 9, "não"],
      ["2", 10, "sim"],
    ]);
  });

  it("quadro: entrada e saída no período; alocação encerrada antes do período fica de fora", () => {
    const base = { pessoa_nome: "Ana", matricula: null, contrato: "042", unidade: "Central", funcao: "Vigia" };
    const r = montarQuadro(
      [
        { ...base, data_inicio: "2026-09-10", data_fim: null, status: "ativa" },
        { ...base, pessoa_nome: "Bia", data_inicio: "2025-01-01", data_fim: "2026-09-15", status: "encerrada" },
        { ...base, pessoa_nome: "Caio", data_inicio: "2024-01-01", data_fim: "2025-01-01", status: "encerrada" },
        { ...base, pessoa_nome: "Duda", data_inicio: "2024-01-01", data_fim: null, status: "ativa" },
      ],
      "2026-09-01",
      HOJE,
      "",
    );
    expect(r.resumo!.linhas).toEqual([["042", "Central", 2, 1, 1]]);
    expect(r.detalhe.linhas.map((l) => [l[2], l[8]])).toEqual([
      ["Ana", "entrada"],
      ["Bia", "saída"],
      ["Duda", null],
    ]);
  });
});

describe("CSV", () => {
  it("BOM, ponto e vírgula, e fórmula desarmada", () => {
    const r: Relatorio = {
      titulo: "t",
      recorte: "",
      resumo: null,
      detalhe: { colunas: ["A", "B"], linhas: [["=HYPERLINK(1)", 3]] },
      total: { valor: 1, rotulo: "" },
    };
    expect(gerarCsv(r)).toBe("﻿A;B\r\n'=HYPERLINK(1);3\r\n");
  });
});
