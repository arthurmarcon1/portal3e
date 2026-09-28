import { describe, expect, it } from "vitest";

import { ErroDeAnexo, validarImagem } from "./anexo";

describe("validarImagem", () => {
  it("reconhece JPEG, PNG e WebP pelo conteúdo", () => {
    expect(validarImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])).mime).toBe("image/jpeg");
    expect(validarImagem(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])).mime).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(validarImagem(webp).mime).toBe("image/webp");
  });

  it("recusa PDF, texto e vazio", () => {
    expect(() => validarImagem(new TextEncoder().encode("%PDF-1.4"))).toThrow(ErroDeAnexo);
    expect(() => validarImagem(new TextEncoder().encode("oi"))).toThrow(/não é uma foto/);
    expect(() => validarImagem(new Uint8Array())).toThrow(/vazia/);
  });
});

describe("validarAnexo", () => {
  it("aceita PDF e foto; recusa o resto com mensagem de anexo", async () => {
    const { validarAnexo } = await import("./anexo");
    expect(validarAnexo(new TextEncoder().encode("%PDF-1.7")).mime).toBe("application/pdf");
    expect(validarAnexo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).mime).toBe("image/jpeg");
    expect(() => validarAnexo(new TextEncoder().encode("texto"))).toThrow(/foto \(JPG, PNG\) ou um PDF/);
  });
});
