import { describe, expect, it } from "vitest";

import { idValido, nomeDoArquivo } from "./entrega";

describe("nomeDoArquivo", () => {
  it("tira acento e caractere de caminho, e troca espaço por hífen", () => {
    expect(nomeDoArquivo("Espelho de ponto — setembro/2026", 1)).toBe("Espelho-de-ponto-setembro2026.pdf");
  });

  it("marca a versão a partir da segunda", () => {
    expect(nomeDoArquivo("Norma interna", 2)).toBe("Norma-interna-v2.pdf");
  });

  it("título sem nada aproveitável vira 'documento'", () => {
    expect(nomeDoArquivo("///", 1)).toBe("documento.pdf");
  });
});

describe("idValido", () => {
  it("aceita uuid e recusa o resto", () => {
    expect(idValido("9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c")).toBe(true);
    expect(idValido("../../etc/passwd")).toBe(false);
    expect(idValido("9af9c3c1a1a75dd199a449cd1d80355c")).toBe(false);
  });
});
