import { describe, expect, it } from "vitest";

import {
  apenasDigitos,
  formatarCnpj,
  formatarCpf,
  validarCnpj,
  validarCpf,
} from "./cpf-cnpj";

/**
 * O utilitário é puro de propósito: dígito verificador é conta, e conta se
 * prova sem banco. Os CPFs usados aqui são os do seed — se a conta mudar, o
 * seed que a suíte inteira depende para de valer, e este teste avisa antes.
 */

describe("apenasDigitos", () => {
  it("remove máscara, espaço e qualquer outro caractere", () => {
    expect(apenasDigitos("010.007.919-98")).toBe("01000791998");
    expect(apenasDigitos(" 11.222.333/0001-81 ")).toBe("11222333000181");
    expect(apenasDigitos("sem dígito")).toBe("");
  });
});

describe("validarCpf", () => {
  it("aceita os CPFs do seed, com e sem máscara", () => {
    expect(validarCpf("01000791998")).toBe(true);
    expect(validarCpf("010.007.919-98")).toBe(true);
    expect(validarCpf("01023757044")).toBe(true);
  });

  it("recusa dígito verificador errado", () => {
    // O último dígito do primeiro CPF do seed, trocado.
    expect(validarCpf("01000791997")).toBe(false);
    expect(validarCpf("12345678900")).toBe(false);
  });

  it("recusa sequência de dígito repetido, que passa no módulo 11", () => {
    for (const d of "0123456789") {
      expect(validarCpf(d.repeat(11))).toBe(false);
    }
  });

  it("recusa tamanho diferente de 11 dígitos", () => {
    expect(validarCpf("")).toBe(false);
    expect(validarCpf("0100079199")).toBe(false);
    expect(validarCpf("010007919980")).toBe(false);
  });
});

describe("validarCnpj", () => {
  it("aceita CNPJ válido, com e sem máscara", () => {
    expect(validarCnpj("11222333000181")).toBe(true);
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("09876543000141")).toBe(true);
  });

  it("recusa dígito verificador errado e repetição total", () => {
    expect(validarCnpj("11222333000180")).toBe(false);
    expect(validarCnpj("44555666000172")).toBe(false);
    expect(validarCnpj("11111111111111")).toBe(false);
  });

  it("recusa tamanho diferente de 14 dígitos", () => {
    expect(validarCnpj("112223330001")).toBe(false);
    expect(validarCnpj("")).toBe(false);
  });
});

describe("formatação", () => {
  it("aplica a máscara de exibição", () => {
    expect(formatarCpf("01000791998")).toBe("010.007.919-98");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("devolve o valor como veio quando o tamanho não bate", () => {
    // Cadastro torto não é escondido pela camada de exibição.
    expect(formatarCpf("123")).toBe("123");
    expect(formatarCnpj("123")).toBe("123");
  });
});
