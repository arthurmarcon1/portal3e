import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { gerarModeloXlsx, lerPlanilha } from "@/lib/planilha";
import type { Database } from "@/lib/supabase/types";

import { analisarPlanilha, COLUNAS, type Catalogo } from "./importacao";

/**
 * Importação de ponta a ponta, contra o Supabase de verdade.
 *
 * O que só o banco prova: que `public.importar_pessoas` é **atômica**. Esse é
 * o critério central da F1.3 — "se qualquer linha crítica falhar, nada é
 * gravado" — e nenhum dublê demonstraria isso, porque a garantia é da
 * transação do Postgres, não do código que a chama.
 *
 * Também cobre a leitura real do XLSX pelo exceljs, que os testes puros de
 * `importacao.test.ts` não tocam.
 *
 * **Regra de convivência com o seed.** A suíte inteira depende das personas e
 * das 30 pessoas de `supabase/seed.sql`. Este teste escreve, então:
 *   - usa CPFs de uma faixa que o seed não ocupa (ver CPFS_DE_TESTE);
 *   - confere no `beforeAll` que eles realmente não existem — se existirem, o
 *     teste falha alto em vez de sobrescrever alguém;
 *   - limpa no `afterAll`, aconteça o que acontecer.
 * Um CPF do seed aqui apagaria uma persona. Não troque estes números sem
 * conferir que não estão em seed.sql.
 */

const SENHA = "portal3e2026";

/** Fora da faixa do seed (que vai de 01000791998 a 01023757044). */
const CPFS_DE_TESTE = ["01024548971", "01025340890"] as const;

const CATALOGO: Catalogo = {
  contratos: [{ numero: "042", unidades: ["Unidade Central", "Ala Norte", "Ala Sul"] }],
  cpfsExistentes: [],
};

function linhaDeTeste(cpf: string) {
  return {
    nome: "Importacao Automatizada",
    cpf,
    matricula: "9110",
    funcao: "Auxiliar de teste automatizado",
    contrato: "042",
    unidade: "Unidade Central",
    data_inicio: "2026-09-01",
    telefone: "51988887777",
  };
}

let rh: SupabaseClient<Database>;

async function contarPessoas(): Promise<number | null> {
  const { count } = await rh.from("pessoas").select("id", { count: "exact", head: true });
  return count;
}

async function limpar() {
  const { data } = await rh.from("pessoas").select("id").in("cpf", [...CPFS_DE_TESTE]);
  for (const pessoa of data ?? []) {
    await rh.from("alocacoes").delete().eq("pessoa_id", pessoa.id);
    await rh.from("pessoas").delete().eq("id", pessoa.id);
  }
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes. Este teste fala com o Supabase: " +
        "preencha .env.local antes de rodar.",
    );
  }

  rh = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { error } = await rh.auth.signInWithPassword({
    email: "rh_dp@3e.com.br",
    password: SENHA,
  });
  if (error) throw new Error(`não foi possível autenticar rh_dp: ${error.message}`);

  // Guarda de segurança: escrever sobre um CPF do seed apagaria uma persona.
  const { data: colisao } = await rh
    .from("pessoas")
    .select("cpf, nome")
    .in("cpf", [...CPFS_DE_TESTE]);

  if (colisao && colisao.length > 0) {
    throw new Error(
      `CPF de teste já existe no banco (${colisao.map((p) => p.cpf).join(", ")}). ` +
        "Escolha outro fora da faixa do seed em vez de sobrescrever o registro.",
    );
  }
});

afterAll(limpar);

describe("leitura da planilha", () => {
  it("gera o modelo, relê o xlsx e normaliza o que vai ao banco", async () => {
    const buffer = await gerarModeloXlsx(COLUNAS, [
      "Fumaca XLSX",
      "010.015.838-25",
      "9100",
      "Auxiliar de teste",
      "042",
      "Unidade Central",
      "01/09/2026",
      "(51) 99999-8888",
    ]);

    const matriz = await lerPlanilha(new File([new Uint8Array(buffer)], "modelo.xlsx"));
    expect(matriz[0]).toEqual([...COLUNAS]);

    const analise = analisarPlanilha(matriz, CATALOGO);
    expect(analise.comErro).toBe(0);
    expect(analise.linhas[0].dados.cpf).toBe("01001583825");
    expect(analise.linhas[0].dados.telefone).toBe("51999998888");
    expect(analise.linhas[0].dados.data_inicio).toBe("2026-09-01");
  });

  it("lê CSV com ponto e vírgula e acento em windows-1252", async () => {
    const texto =
      "nome;cpf;matricula;funcao;contrato;unidade;data_inicio;telefone\r\n" +
      "José Antônio;010.023.757-62;9101;Auxiliar;042;Unidade Central;01/09/2026;\r\n";
    // Excel-BR salva CSV em ANSI, não em UTF-8.
    const bytes = Buffer.from(texto, "latin1");

    const matriz = await lerPlanilha(new File([new Uint8Array(bytes)], "quadro.csv"));
    const analise = analisarPlanilha(matriz, CATALOGO);

    expect(analise.linhas[0].dados.nome).toBe("José Antônio");
    expect(analise.comErro).toBe(0);
  });
});

describe("importar_pessoas (transação)", () => {
  it("não grava nada quando uma linha do lote falha", async () => {
    const antes = await contarPessoas();

    const { error } = await rh.rpc("importar_pessoas", {
      p_linhas: [
        linhaDeTeste(CPFS_DE_TESTE[0]),
        { ...linhaDeTeste(CPFS_DE_TESTE[1]), contrato: "CONTRATO-QUE-NAO-EXISTE" },
      ],
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("Linha 2");
    // A primeira linha era perfeitamente válida e mesmo assim não entrou.
    expect(await contarPessoas()).toBe(antes);
  });

  it("grava o lote válido e trata CPF existente como atualização", async () => {
    const antes = await contarPessoas();
    const linha = linhaDeTeste(CPFS_DE_TESTE[0]);

    const { data: primeira, error } = await rh.rpc("importar_pessoas", {
      p_linhas: [linha],
    });
    expect(error).toBeNull();
    expect(primeira).toMatchObject({
      total: 1,
      criados: 1,
      atualizados: 0,
      alocacoes_criadas: 1,
    });
    expect(await contarPessoas()).toBe((antes ?? 0) + 1);

    // Reimportar a mesma planilha não duplica pessoa nem alocação.
    const { data: segunda } = await rh.rpc("importar_pessoas", { p_linhas: [linha] });
    expect(segunda).toMatchObject({
      total: 1,
      criados: 0,
      atualizados: 1,
      alocacoes_criadas: 0,
    });
    expect(await contarPessoas()).toBe((antes ?? 0) + 1);
  });

  it("recusa importação de quem não é da equipe interna", async () => {
    const fiscal = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    await fiscal.auth.signInWithPassword({
      email: "fiscal@hsaolucas.com.br",
      password: SENHA,
    });

    const { error } = await fiscal.rpc("importar_pessoas", {
      p_linhas: [linhaDeTeste(CPFS_DE_TESTE[1])],
    });

    expect(error).not.toBeNull();
    expect(error?.message).toContain("Sem permissão");
  });
});
