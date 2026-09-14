import { describe, expect, it } from "vitest";

import {
  analisarPlanilha,
  cpfDaPlanilha,
  ErroDeCabecalho,
  mapearColunas,
  normalizarData,
  type Catalogo,
} from "./importacao";

/**
 * A tela precisa dizer, antes de importar, quantas linhas valem e qual é o
 * erro de cada uma que não vale. É esta função que produz essa resposta, e
 * ela é pura — dá para provar cada caso sem banco.
 */

const CATALOGO: Catalogo = {
  contratos: [
    { numero: "042", unidades: ["Unidade Central", "Ala Norte"] },
    { numero: "077", unidades: ["Loja Centro"] },
  ],
  // Maria, do seed: CPF existente vira atualização.
  cpfsExistentes: ["01000791998"],
};

const CABECALHO = [
  "nome",
  "cpf",
  "matricula",
  "funcao",
  "contrato",
  "unidade",
  "data_inicio",
  "telefone",
];

function linha(over: Partial<Record<string, string>> = {}): string[] {
  const base = {
    nome: "Joao Teste",
    cpf: "01001583825",
    matricula: "9001",
    funcao: "Auxiliar de limpeza",
    contrato: "042",
    unidade: "Unidade Central",
    data_inicio: "2026-09-01",
    telefone: "51999998888",
    ...over,
  };
  return CABECALHO.map((c) => base[c as keyof typeof base] ?? "");
}

describe("mapearColunas", () => {
  it("aceita sinônimos, acentuação e ordem trocada", () => {
    const mapa = mapearColunas([
      "Matrícula",
      "Nome completo",
      "CPF",
      "Cargo",
      "Número do contrato",
      "Posto",
      "Admissão",
      "Celular",
    ]);
    expect(mapa.nome).toBe(1);
    expect(mapa.matricula).toBe(0);
    expect(mapa.funcao).toBe(3);
    expect(mapa.contrato).toBe(4);
    expect(mapa.unidade).toBe(5);
    expect(mapa.data_inicio).toBe(6);
    expect(mapa.telefone).toBe(7);
  });

  it("ignora coluna desconhecida", () => {
    expect(() => mapearColunas([...CABECALHO, "centro de custo"])).not.toThrow();
  });

  it("recusa planilha sem coluna obrigatória, dizendo qual falta", () => {
    expect(() => mapearColunas(["nome", "cpf"])).toThrowError(ErroDeCabecalho);
    try {
      mapearColunas(["nome", "cpf"]);
    } catch (erro) {
      expect((erro as Error).message).toContain("funcao");
      expect((erro as Error).message).toContain("contrato");
    }
  });
});

describe("normalizarData", () => {
  it("aceita ISO e dd/mm/aaaa", () => {
    expect(normalizarData("2026-09-01")).toBe("2026-09-01");
    expect(normalizarData("01/09/2026")).toBe("2026-09-01");
    expect(normalizarData("1/9/2026")).toBe("2026-09-01");
  });

  it("devolve vazio no que não reconhece", () => {
    expect(normalizarData("setembro")).toBe("");
    expect(normalizarData("")).toBe("");
  });
});

describe("cpfDaPlanilha", () => {
  it("devolve o zero à esquerda que o Excel comeu", () => {
    // 01000791998 salvo como número vira 1000791998.
    expect(cpfDaPlanilha("1000791998")).toBe("01000791998");
    expect(cpfDaPlanilha("010.007.919-98")).toBe("01000791998");
  });
});

describe("analisarPlanilha", () => {
  it("conta válidas, com erro, criadas e atualizadas", () => {
    const analise = analisarPlanilha(
      [
        CABECALHO,
        linha(),
        linha({ cpf: "01000791998", nome: "Maria Aparecida Ferreira" }), // já existe
        linha({ cpf: "12345678900" }), // DV inválido
      ],
      CATALOGO,
    );

    expect(analise.validas).toBe(2);
    expect(analise.comErro).toBe(1);
    expect(analise.criara).toBe(1);
    expect(analise.atualizara).toBe(1);
    expect(analise.linhas[1].atualiza).toBe(true);
  });

  it("aponta o erro de cada linha, com o número da linha da planilha", () => {
    // CPF distinto em cada linha: com o mesmo, a checagem de repetido
    // dispararia antes e esconderia o erro que cada caso quer provar.
    const analise = analisarPlanilha(
      [
        CABECALHO,
        linha({ nome: "" }),
        linha({ cpf: "99999999999" }),
        linha({ cpf: "01002375762", contrato: "999" }),
        // Unidade existe, mas não é atendida pelo contrato 042.
        linha({ cpf: "01003167608", unidade: "Loja Centro" }),
        linha({ cpf: "01003959539", data_inicio: "31/02/2026" }),
        linha({ cpf: "01004751400", telefone: "123" }),
      ],
      CATALOGO,
    );

    expect(analise.comErro).toBe(6);
    expect(analise.linhas[0].numero).toBe(2);
    expect(analise.linhas[0].erros[0]).toContain("Nome");
    expect(analise.linhas[1].erros[0]).toContain("CPF inválido");
    expect(analise.linhas[2].erros[0]).toContain("não existe");
    expect(analise.linhas[3].erros[0]).toContain("não é atendida pelo contrato");
    expect(analise.linhas[4].erros[0]).toContain("inexistente");
    expect(analise.linhas[5].erros[0]).toContain("Telefone");
  });

  it("acusa CPF repetido dentro da própria planilha, apontando a primeira ocorrência", () => {
    const analise = analisarPlanilha([CABECALHO, linha(), linha()], CATALOGO);

    expect(analise.comErro).toBe(1);
    expect(analise.linhas[1].erros[0]).toContain("linha 2");
  });

  it("ignora linha em branco no meio da planilha", () => {
    const analise = analisarPlanilha(
      [CABECALHO, linha(), ["", "", "", "", "", "", "", ""], linha({ cpf: "01002375762" })],
      CATALOGO,
    );

    expect(analise.linhas).toHaveLength(2);
    expect(analise.validas).toBe(2);
  });

  it("normaliza o que vai ao banco: CPF e telefone só com dígitos", () => {
    const analise = analisarPlanilha(
      [CABECALHO, linha({ cpf: "010.015.838-25", telefone: "(51) 99999-8888" })],
      CATALOGO,
    );

    expect(analise.linhas[0].dados.cpf).toBe("01001583825");
    expect(analise.linhas[0].dados.telefone).toBe("51999998888");
    expect(analise.linhas[0].erros).toEqual([]);
  });

  it("casa contrato e unidade sem depender de maiúscula", () => {
    const analise = analisarPlanilha(
      [CABECALHO, linha({ unidade: "unidade central" })],
      CATALOGO,
    );
    expect(analise.validas).toBe(1);
  });
});
