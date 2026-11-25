import { describe, expect, it } from "vitest";

import { CATEGORIAS, ehCategoria } from "./categorias";
import {
  ALIQUOTAS_DE_REFERENCIA,
  calcularProvisoesDaFolha,
  calcularProvisoesDaFolhaDoMes,
  taxaDeEncargos,
  taxaDeProvisoes,
  type AliquotasDeProvisao,
} from "./provisoes";

const porCategoria = (linhas: { categoria: string; valor: number }[]) =>
  Object.fromEntries(linhas.map((l) => [l.categoria, l.valor]));

describe("calcularProvisoesDaFolha", () => {
  it("quebra o salário em folha, encargos e provisão de 13º/férias", () => {
    // salário 3000, alíquotas de referência:
    //   encargos  = 0,20 + 0,02 + 0,058 + 0,08 = 0,358 → 3000 × 0,358 = 1074,00
    //   13º/férias = 1/12 + 1/12 + 1/36 = 0,194444… → 3000 × … = 583,33
    const linhas = calcularProvisoesDaFolha(3000);
    expect(porCategoria(linhas)).toEqual({
      folha: 3000,
      encargos: 1074,
      ferias_13: 583.33,
    });
  });

  it("as três categorias existem em CATEGORIAS e são do grupo pessoal", () => {
    for (const linha of calcularProvisoesDaFolha(2500)) {
      expect(ehCategoria(linha.categoria)).toBe(true);
      expect(CATEGORIAS[linha.categoria].grupo).toBe("pessoal");
      expect(CATEGORIAS[linha.categoria].sinal).toBe(1);
    }
  });

  it("respeita alíquotas passadas: contrato desonerado (INSS patronal zero)", () => {
    const desonerado: AliquotasDeProvisao = { ...ALIQUOTAS_DE_REFERENCIA, inssPatronal: 0 };
    const linhas = calcularProvisoesDaFolha(1000, desonerado);
    // encargos = 0 + 0,02 + 0,058 + 0,08 = 0,158 → 158,00
    expect(porCategoria(linhas).encargos).toBe(158);
  });

  it("arredonda para centavos", () => {
    const linhas = calcularProvisoesDaFolha(1333.33);
    for (const l of linhas) expect(l.valor).toBe(Math.round(l.valor * 100) / 100);
  });

  it("provisão é linear: a folha do mês = a soma dos salários estimada uma vez", () => {
    const umPorUm = [3000, 2000, 1500].map((s) => calcularProvisoesDaFolha(s));
    const somaDasLinhas = (cat: string) =>
      umPorUm.reduce((s, linhas) => s + porCategoria(linhas)[cat], 0);
    const doMes = porCategoria(calcularProvisoesDaFolhaDoMes([3000, 2000, 1500]));
    for (const cat of ["folha", "encargos", "ferias_13"]) {
      expect(doMes[cat]).toBeCloseTo(somaDasLinhas(cat), 2);
    }
  });
});

describe("taxas", () => {
  it("encargo de referência é 35,8% e provisão é 19,44…%", () => {
    expect(taxaDeEncargos(ALIQUOTAS_DE_REFERENCIA)).toBeCloseTo(0.358, 5);
    expect(taxaDeProvisoes(ALIQUOTAS_DE_REFERENCIA)).toBeCloseTo(0.194444, 5);
  });
});
