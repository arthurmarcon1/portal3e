import { describe, expect, it } from "vitest";

import {
  intervaloDoPeriodo,
  lerFiltros,
  paginasVisiveis,
  paraQueryString,
} from "./filtros";

const UUID = "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3";

describe("lerFiltros", () => {
  it("lê o recorte completo da URL", () => {
    expect(
      lerFiltros({
        de: "2026-09-01",
        ate: "2026-09-14",
        usuario: UUID,
        acao: "falha_login",
        entidade: "usuarios",
        pagina: "3",
      }),
    ).toEqual({
      de: "2026-09-01",
      ate: "2026-09-14",
      usuario: UUID,
      acao: "falha_login",
      entidade: "usuarios",
      pagina: 3,
    });
  });

  it("parâmetro inválido vira ausência de filtro, não erro", () => {
    expect(
      lerFiltros({ de: "2026-02-31", ate: "ontem", usuario: "abc", pagina: "-2", acao: "" }),
    ).toEqual({ pagina: 1 });
  });

  it("aceita URLSearchParams e usa o primeiro valor repetido", () => {
    expect(lerFiltros(new URLSearchParams("acao=login&acao=logout")).acao).toBe("login");
    expect(lerFiltros({ acao: ["login", "logout"] }).acao).toBe("login");
  });
});

describe("paraQueryString", () => {
  it("omite o vazio e a primeira página", () => {
    expect(paraQueryString({ pagina: 1 })).toBe("");
    expect(paraQueryString({ acao: "login", pagina: 1 })).toBe("?acao=login");
    expect(paraQueryString({ acao: "login", pagina: 2 })).toBe("?acao=login&pagina=2");
  });

  it("faz ida e volta com lerFiltros", () => {
    const filtros = lerFiltros({ de: "2026-09-01", usuario: UUID, pagina: "4" });
    expect(lerFiltros(new URLSearchParams(paraQueryString(filtros)))).toEqual(filtros);
  });
});

describe("intervaloDoPeriodo", () => {
  it("usa o dia civil de Brasília, com o fim inclusivo", () => {
    expect(intervaloDoPeriodo({ de: "2026-09-01", ate: "2026-09-14" })).toEqual({
      desde: "2026-09-01T00:00:00-03:00",
      antesDe: "2026-09-15T00:00:00-03:00",
    });
  });

  it("vira o mês e o ano", () => {
    expect(intervaloDoPeriodo({ ate: "2026-12-31" }).antesDe).toBe("2027-01-01T00:00:00-03:00");
  });

  it("sem período, sem limite", () => {
    expect(intervaloDoPeriodo({})).toEqual({ desde: null, antesDe: null });
  });
});

describe("paginasVisiveis", () => {
  it("mostra todas quando são poucas", () => {
    expect(paginasVisiveis(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("marca os saltos com null", () => {
    expect(paginasVisiveis(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(paginasVisiveis(1, 20)).toEqual([1, 2, null, 20]);
    expect(paginasVisiveis(20, 20)).toEqual([1, null, 19, 20]);
  });
});
