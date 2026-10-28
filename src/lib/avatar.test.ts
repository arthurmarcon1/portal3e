import { describe, expect, it } from "vitest";

import { CORES_DE_AVATAR, corDoAvatar, iniciais } from "./avatar";

describe("iniciais", () => {
  it("primeiro e último nome, sem partícula", () => {
    expect(iniciais("Maria da Silva")).toBe("MS");
    expect(iniciais("João Pereira dos Santos")).toBe("JS");
    expect(iniciais("Ana e Souza")).toBe("AS");
  });

  it("uma palavra só dá uma letra", () => {
    expect(iniciais("Wesley")).toBe("W");
  });

  it("mantém acento, ignora pontuação e espaço sobrando", () => {
    expect(iniciais("  ângela   d'Ávila ")).toBe("ÂD");
    expect(iniciais("RH / DP (teste)")).toBe("RT");
  });

  it("nome vazio não quebra", () => {
    expect(iniciais("   ")).toBe("");
  });
});

describe("corDoAvatar", () => {
  it("é estável e fica no intervalo", () => {
    const id = "9af9c3c1-a1a7-5dd1-99a4-49cd1d80355c";
    expect(corDoAvatar(id)).toBe(corDoAvatar(id));
    expect(corDoAvatar(id)).toBeGreaterThanOrEqual(0);
    expect(corDoAvatar(id)).toBeLessThan(CORES_DE_AVATAR);
  });

  it("espalha ids diferentes pelas cores", () => {
    const usadas = new Set(
      Array.from({ length: 200 }, (_, i) => corDoAvatar(`00000000-0000-0000-0000-${String(i).padStart(12, "0")}`)),
    );
    expect(usadas.size).toBe(CORES_DE_AVATAR);
  });
});
