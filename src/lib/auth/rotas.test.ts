import { describe, expect, it } from "vitest";

import { areaDoCaminho, destinoPermitido, ehRotaPublica, rotaInicial } from "./rotas";

describe("rotaInicial", () => {
  it("manda cada tipo para a própria área", () => {
    expect(rotaInicial("funcionario")).toBe("/inicio");
    expect(rotaInicial("contratante")).toBe("/cliente");
    expect(rotaInicial("interno")).toBe("/admin");
  });
});

describe("ehRotaPublica", () => {
  it("abre só login e recuperação de senha", () => {
    expect(ehRotaPublica("/login")).toBe(true);
    expect(ehRotaPublica("/recuperar-senha")).toBe(true);
    expect(ehRotaPublica("/primeiro-acesso")).toBe(false);
    expect(ehRotaPublica("/admin")).toBe(false);
  });

  it("não deixa prefixo parecido passar por rota pública", () => {
    expect(ehRotaPublica("/loginfalso")).toBe(false);
  });
});

describe("areaDoCaminho", () => {
  it("reconhece a área de cada prefixo, inclusive nas subrotas", () => {
    expect(areaDoCaminho("/admin/pessoas")).toBe("interno");
    expect(areaDoCaminho("/cliente")).toBe("contratante");
    expect(areaDoCaminho("/documentos/abc")).toBe("funcionario");
  });

  it("devolve null nas rotas comuns", () => {
    expect(areaDoCaminho("/")).toBeNull();
    expect(areaDoCaminho("/primeiro-acesso")).toBeNull();
    expect(areaDoCaminho("/api/documentos/1/download")).toBeNull();
  });
});

describe("destinoPermitido", () => {
  it("aceita rota da área do próprio tipo, com query", () => {
    expect(destinoPermitido("/admin/pessoas?pagina=2", "interno")).toBe(
      "/admin/pessoas?pagina=2",
    );
    expect(destinoPermitido("/documentos/abc", "funcionario")).toBe("/documentos/abc");
  });

  it("recusa rota de outra área", () => {
    expect(destinoPermitido("/admin", "funcionario")).toBeNull();
    expect(destinoPermitido("/cliente", "interno")).toBeNull();
  });

  it("recusa destino externo e caminho fora de área", () => {
    expect(destinoPermitido("https://exemplo.com", "interno")).toBeNull();
    expect(destinoPermitido("//exemplo.com", "interno")).toBeNull();
    expect(destinoPermitido("/primeiro-acesso", "interno")).toBeNull();
    expect(destinoPermitido(undefined, "interno")).toBeNull();
  });
});
