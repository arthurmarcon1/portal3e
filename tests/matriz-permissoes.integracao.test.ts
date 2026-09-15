import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { ACOES, MODULOS } from "@/lib/auth/modulos";

import { clienteDeFixture, ORG } from "./rls/apoio";

/**
 * A matriz de docs/02 é a fonte da verdade; o seed é cópia dela. Este teste
 * compara as duas **célula a célula** e falha apontando cada divergência.
 *
 * É a coisa que mais silenciosamente sai de sincronia — e já saiu uma vez,
 * com as categorias (0003): o banco deixava todo interno ver `bancario` e
 * `folha` enquanto o doc dizia o contrário, e nenhuma tela mostrava isso.
 * Conferência manual não pega o próximo.
 *
 * Duas comparações:
 * - `perfil_permissoes` × as tabelas "Equipe interna" e "Contratante"
 *   (V C E X R por módulo);
 * - `perfil_categorias` × a tabela de categorias restritas.
 *
 * **Lê o banco com `service_role`, de propósito.** Isto não testa RLS — testa
 * dado. Uma leitura como persona poderia esconder uma linha pela policy e o
 * teste passaria com o banco divergente. As regras de "client da persona" do
 * CLAUDE.md valem para os testes de `tests/rls/`.
 *
 * Vale para a organização do seed, que é a que docs/02 descreve. Uma prestadora
 * com organograma próprio (F6.3) terá matriz própria — e aí este teste passa a
 * receber qual doc comparar.
 */

const DOC = join(process.cwd(), "docs", "02-matriz-permissoes.md");

/**
 * Cabeçalho de coluna em docs/02 → `perfis.chave` no banco. É a única ponte
 * escrita à mão; coluna nova no doc sem entrada aqui falha alto.
 */
const COLUNA_PARA_PERFIL: Record<string, string> = {
  "Admin geral": "admin_geral",
  "RH/DP": "rh_dp",
  Contratos: "contratos",
  Financeiro: "financeiro",
  SST: "sst",
  "Suporte/Auditoria": "suporte_auditoria",
  "Gestor do contrato": "gestor_contrato",
  Fiscal: "fiscal",
  "Gestor da unidade": "gestor_unidade",
  "Adm./Financeiro": "adm_financeiro",
};

const LETRA_PARA_ACAO: Record<string, (typeof ACOES)[number]> = {
  V: "ver",
  C: "criar",
  E: "editar",
  X: "excluir",
  R: "exportar",
};

// ---------------------------------------------------------------------
// Leitura do doc
// ---------------------------------------------------------------------

function celulas(linha: string): string[] {
  return linha
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/** Linhas de cada tabela markdown cujo primeiro cabeçalho é `primeiraColuna`. */
function tabelas(markdown: string, primeiraColuna: string): string[][][] {
  const linhas = markdown.split("\n");
  const encontradas: string[][][] = [];

  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].startsWith("|")) continue;
    const cabecalho = celulas(linhas[i]);
    if (cabecalho[0] !== primeiraColuna || !linhas[i + 1]?.startsWith("|---")) continue;

    const corpo: string[][] = [cabecalho];
    let j = i + 2;
    while (linhas[j]?.startsWith("|")) corpo.push(celulas(linhas[j++]));
    encontradas.push(corpo);
    i = j;
  }
  return encontradas;
}

type Posicao = { coluna: string; modulo: string; letra: string };

/** `perfil_chave → Set("modulo:acao")`, com a origem de cada célula para a mensagem. */
function matrizDoDoc(markdown: string) {
  const permissoes = new Map<string, Set<string>>();
  const origem = new Map<string, Posicao>();
  const problemas: string[] = [];

  for (const [cabecalho, ...corpo] of tabelas(markdown, "Módulo")) {
    const colunas = cabecalho.slice(1);

    for (const coluna of colunas) {
      const chave = COLUNA_PARA_PERFIL[coluna];
      if (!chave) problemas.push(`docs/02: coluna "${coluna}" sem perfil mapeado neste teste`);
      else permissoes.set(chave, new Set());
    }

    const modulosDaTabela = corpo.map((l) => l[0]);
    for (const modulo of MODULOS) {
      if (!modulosDaTabela.includes(modulo)) {
        problemas.push(`docs/02: tabela de "${colunas.join(", ")}" não tem a linha ${modulo}`);
      }
    }

    for (const [modulo, ...valores] of corpo) {
      if (!(MODULOS as readonly string[]).includes(modulo)) {
        problemas.push(`docs/02: linha "${modulo}" não é um módulo canônico`);
        continue;
      }
      valores.forEach((valor, k) => {
        const coluna = colunas[k];
        const chave = COLUNA_PARA_PERFIL[coluna];
        if (!chave || valor === "—") return;

        for (const letra of valor.split(/\s+/)) {
          const acao = LETRA_PARA_ACAO[letra];
          if (!acao) {
            problemas.push(`docs/02: ${coluna} · ${modulo} tem "${letra}", que não é V C E X R`);
            continue;
          }
          permissoes.get(chave)!.add(`${modulo}:${acao}`);
          origem.set(`${chave}|${modulo}:${acao}`, { coluna, modulo, letra });
        }
      });
    }
  }

  return { permissoes, origem, problemas };
}

/** `categoria → Set(perfil_chave)` das categorias restritas, e as declaradas abertas. */
function categoriasDoDoc(markdown: string) {
  const restritas = new Map<string, Set<string>>();
  const abertas: string[] = [];
  const problemas: string[] = [];

  const [tabela] = tabelas(markdown, "Categoria");
  if (!tabela) return { restritas, abertas, problemas: ["docs/02: tabela de categorias não encontrada"] };

  for (const [categoriaBruta, quem, linha] of tabela.slice(1)) {
    const nomes = [...categoriaBruta.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    if (linha.startsWith("sim")) {
      const perfis = new Set<string>();
      for (const coluna of quem.split(",").map((q) => q.trim())) {
        const chave = COLUNA_PARA_PERFIL[coluna];
        if (!chave) problemas.push(`docs/02: categoria ${nomes[0]} cita "${coluna}", sem perfil mapeado`);
        else perfis.add(chave);
      }
      for (const n of nomes) restritas.set(n, perfis);
    } else {
      abertas.push(...nomes);
    }
  }
  return { restritas, abertas, problemas };
}

// ---------------------------------------------------------------------
// Leitura do banco
// ---------------------------------------------------------------------

type PerfilDoBanco = { chave: string; nome: string; permissoes: Set<string>; categorias: Set<string> };
let banco: Map<string, PerfilDoBanco>;
let markdown: string;

beforeAll(async () => {
  markdown = readFileSync(DOC, "utf8");

  const admin = clienteDeFixture();
  const { data, error } = await admin
    .from("perfis")
    .select("chave, nome, perfil_permissoes(modulo, acao), perfil_categorias(categoria)")
    .eq("org_id", ORG);
  if (error) throw new Error(`leitura dos perfis: ${error.message}`);

  banco = new Map(
    (data ?? []).map((p) => [
      p.chave,
      {
        chave: p.chave,
        nome: p.nome,
        permissoes: new Set((p.perfil_permissoes ?? []).map((x) => `${x.modulo}:${x.acao}`)),
        categorias: new Set((p.perfil_categorias ?? []).map((x) => x.categoria as string)),
      },
    ]),
  );
});

// ---------------------------------------------------------------------

describe("perfil_permissoes × docs/02", () => {
  it("o doc foi lido inteiro: 10 perfis, 9 módulos, nenhuma célula estranha", () => {
    const { permissoes, problemas } = matrizDoDoc(markdown);
    expect(problemas).toEqual([]);
    expect([...permissoes.keys()].sort()).toEqual(Object.values(COLUNA_PARA_PERFIL).sort());
    // Guarda contra passar no vazio: o Admin geral tem permissão em todo módulo.
    expect(permissoes.get("admin_geral")!.size).toBeGreaterThanOrEqual(MODULOS.length);
  });

  it("todo perfil do banco tem coluna na matriz, e vice-versa", () => {
    const { permissoes } = matrizDoDoc(markdown);
    const doDoc = [...permissoes.keys()].sort();
    const doBanco = [...banco.keys()].sort();

    const divergencias = [
      ...doBanco.filter((c) => !doDoc.includes(c)).map((c) => `perfil "${c}" existe no banco e não tem coluna em docs/02`),
      ...doDoc.filter((c) => !doBanco.includes(c)).map((c) => `perfil "${c}" tem coluna em docs/02 e não existe no banco`),
    ];
    expect(divergencias).toEqual([]);
  });

  it("célula a célula, o banco dá exatamente o que docs/02 marca", () => {
    const { permissoes, origem } = matrizDoDoc(markdown);
    const divergencias: string[] = [];

    for (const [chave, doDoc] of permissoes) {
      const perfil = banco.get(chave);
      if (!perfil) continue; // já apontado no caso acima

      for (const celula of [...doDoc].sort()) {
        if (!perfil.permissoes.has(celula)) {
          const { coluna, letra } = origem.get(`${chave}|${celula}`)!;
          divergencias.push(
            `${coluna} (${chave}) · ${celula} — docs/02 marca ${letra}, o banco NÃO tem`,
          );
        }
      }
      for (const celula of [...perfil.permissoes].sort()) {
        if (!doDoc.has(celula)) {
          divergencias.push(
            `${perfil.nome} (${chave}) · ${celula} — o banco TEM, docs/02 não marca`,
          );
        }
      }
    }

    expect(divergencias).toEqual([]);
  });
});

describe("perfil_categorias × docs/02", () => {
  it("o doc foi lido: categorias restritas e abertas encontradas", () => {
    const { restritas, abertas, problemas } = categoriasDoDoc(markdown);
    expect(problemas).toEqual([]);
    expect([...restritas.keys()].sort()).toEqual(["bancario", "folha", "jornada", "medico", "pessoal"]);
    expect(abertas.sort()).toEqual(["contratual", "geral", "sst"]);
  });

  it("cada perfil tem exatamente as categorias restritas que docs/02 lhe dá", () => {
    const { restritas, abertas } = categoriasDoDoc(markdown);
    const divergencias: string[] = [];

    for (const perfil of banco.values()) {
      const esperadas = new Set(
        [...restritas].filter(([, perfis]) => perfis.has(perfil.chave)).map(([c]) => c),
      );
      for (const c of [...esperadas].sort()) {
        if (!perfil.categorias.has(c)) {
          divergencias.push(`${perfil.nome} (${perfil.chave}) · categoria ${c} — docs/02 dá, o banco NÃO tem`);
        }
      }
      for (const c of [...perfil.categorias].sort()) {
        if (esperadas.has(c)) continue;
        divergencias.push(
          abertas.includes(c)
            ? `${perfil.nome} (${perfil.chave}) · categoria ${c} — é aberta em docs/02 e não deveria ter linha`
            : `${perfil.nome} (${perfil.chave}) · categoria ${c} — o banco TEM, docs/02 não dá`,
        );
      }
    }

    expect(divergencias).toEqual([]);
  });
});
