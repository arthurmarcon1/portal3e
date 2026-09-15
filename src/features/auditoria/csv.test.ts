import { describe, expect, it } from "vitest";

import { celula, dataHoraBrasilia, gerarCsvAuditoria } from "./csv";

describe("celula", () => {
  it("desarma texto que o Excel executaria como fórmula", () => {
    expect(celula("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(celula("+5511999")).toBe("'+5511999");
    expect(celula("-1")).toBe("'-1");
    expect(celula("@SOMA(A1)")).toBe("'@SOMA(A1)");
  });

  it("aspas o que tem separador, aspas ou quebra de linha", () => {
    expect(celula("a;b")).toBe('"a;b"');
    expect(celula('diz "oi"')).toBe('"diz ""oi"""');
    expect(celula("linha\nnova")).toBe('"linha\nnova"');
  });

  it("serializa objeto como JSON e nulo como vazio", () => {
    expect(celula(null)).toBe("");
    // JSON tem aspas, então sai entre aspas e com as internas dobradas.
    expect(celula({ antes: ["a"], depois: [] })).toBe('"{""antes"":[""a""],""depois"":[]}"');
  });
});

describe("dataHoraBrasilia", () => {
  it("converte para o fuso de Brasília em formato ordenável", () => {
    expect(dataHoraBrasilia("2026-09-14T18:53:28Z")).toBe("2026-09-14 15:53:28");
  });
});

describe("gerarCsvAuditoria", () => {
  it("abre com BOM, separa por ponto e vírgula e termina em CRLF", () => {
    const csv = gerarCsvAuditoria([
      {
        criado_em: "2026-09-14T18:00:00Z",
        usuario_nome: "RH / DP (teste)",
        usuario_email: "rh_dp@3e.com.br",
        acao: "mudar_escopo",
        entidade: "usuarios",
        entidade_id: "c4c1bbd3-90c6-5c43-ac35-857b37a96fd3",
        ip: "203.0.113.7",
        user_agent: "Mozilla/5.0",
        detalhes: { antes: [], depois: ["042"] },
      },
    ]);

    expect(csv.startsWith("﻿data_hora;usuario;email;acao;")).toBe(true);
    const [, linha] = csv.slice(1).split("\r\n");
    expect(linha).toBe(
      '2026-09-14 15:00:00;RH / DP (teste);rh_dp@3e.com.br;mudar_escopo;usuarios;' +
        'c4c1bbd3-90c6-5c43-ac35-857b37a96fd3;203.0.113.7;Mozilla/5.0;"{""antes"":[],""depois"":[""042""]}"',
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
