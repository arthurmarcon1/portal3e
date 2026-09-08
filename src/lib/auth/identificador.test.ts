import { describe, expect, it } from "vitest";

import {
  emailSintetico,
  mascararIdentificador,
  resolverIdentificador,
} from "./identificador";

describe("emailSintetico", () => {
  it("monta o domínio interno com o slug da organização", () => {
    expect(emailSintetico("010.007.919-98", "3e")).toBe("01000791998@func.3e.portal3e");
  });
});

describe("resolverIdentificador", () => {
  it("trata 11 dígitos como CPF, com ou sem máscara", () => {
    for (const entrada of ["01000791998", "010.007.919-98", " 010 007 919 98 "]) {
      expect(resolverIdentificador(entrada, "3e")).toEqual({
        tipo: "cpf",
        cpf: "01000791998",
        email: "01000791998@func.3e.portal3e",
      });
    }
  });

  it("trata qualquer coisa com @ como e-mail, normalizado", () => {
    expect(resolverIdentificador("  RH_DP@3e.com.br ", "3e")).toEqual({
      tipo: "email",
      email: "rh_dp@3e.com.br",
    });
  });

  it("não confunde e-mail com 11 dígitos no meio com CPF", () => {
    expect(resolverIdentificador("joao01000791998@x.com.br", "3e")).toEqual({
      tipo: "email",
      email: "joao01000791998@x.com.br",
    });
  });

  it("recusa entrada vazia e número com quantidade errada de dígitos", () => {
    expect(resolverIdentificador("", "3e")).toBeNull();
    expect(resolverIdentificador("   ", "3e")).toBeNull();
    expect(resolverIdentificador("0100079199", "3e")).toBeNull();
    expect(resolverIdentificador("010007919980", "3e")).toBeNull();
  });
});

describe("mascararIdentificador", () => {
  it("guarda só os 3 últimos dígitos do CPF", () => {
    expect(mascararIdentificador("010.007.919-98")).toBe("********998");
  });

  it("guarda só as 2 primeiras letras do e-mail", () => {
    expect(mascararIdentificador("rh_dp@3e.com.br")).toBe("rh***@3e.com.br");
  });

  it("não vaza nada quando a entrada não é reconhecida", () => {
    expect(mascararIdentificador("12345")).toBe("***");
  });
});
