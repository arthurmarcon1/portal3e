import "server-only";

import ExcelJS from "exceljs";
import Papa from "papaparse";

/**
 * Leitura de planilha: XLSX ou CSV, sempre para a mesma matriz de texto.
 *
 * Quem entende de colunas é o módulo de importação; aqui o trabalho é só
 * transformar bytes em linhas de string, resolvendo as três armadilhas que
 * planilha brasileira sempre traz:
 *
 * 1. **Zero à esquerda comido pelo Excel.** Célula numérica devolve `1000791998`
 *    onde a pessoa digitou `01000791998`. Números viram texto aqui, e o
 *    preenchimento do zero fica na validação do CPF, que é quem sabe o
 *    tamanho esperado.
 * 2. **Data como objeto `Date`.** Célula formatada como data não chega como
 *    texto; normalizamos para ISO (yyyy-mm-dd) já aqui.
 * 3. **CSV do Excel-BR.** Separador `;`, e não `,`. O Papa detecta sozinho.
 *
 * O `xlsx` do npm (SheetJS 0.18.5) foi descartado de propósito: tem prototype
 * pollution sem correção publicada no registro (CVE-2023-30533) e o gatilho é
 * justamente ler arquivo enviado por terceiro, que é o caso desta tela.
 */

export type MatrizPlanilha = string[][];

/** Limite de linhas, para uma planilha errada não virar consumo de memória. */
export const MAX_LINHAS = 5000;

export class ErroDePlanilha extends Error {}

function textoDaCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  if (valor instanceof Date) {
    // exceljs entrega data em UTC; a fatia ISO é a data que a pessoa digitou.
    return valor.toISOString().slice(0, 10);
  }

  if (typeof valor === "object") {
    // Célula com fórmula ou rich text: o que interessa é o resultado visível.
    const objeto = valor as { result?: unknown; richText?: { text: string }[]; text?: string };
    if (objeto.richText) return objeto.richText.map((p) => p.text).join("");
    if (objeto.result !== undefined) return textoDaCelula(objeto.result);
    if (objeto.text !== undefined) return String(objeto.text);
    return "";
  }

  return String(valor).trim();
}

async function lerXlsx(bytes: ArrayBuffer): Promise<MatrizPlanilha> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);

  const aba = workbook.worksheets[0];
  if (!aba) throw new ErroDePlanilha("A planilha não tem nenhuma aba com dados.");

  const linhas: MatrizPlanilha = [];
  aba.eachRow({ includeEmpty: false }, (linha) => {
    if (linhas.length >= MAX_LINHAS) return;
    // `values` do exceljs é 1-based: a posição 0 vem sempre vazia.
    const valores = Array.isArray(linha.values) ? linha.values.slice(1) : [];
    linhas.push(valores.map(textoDaCelula));
  });

  return linhas;
}

/**
 * Decodifica o CSV tentando UTF-8 e caindo para windows-1252.
 *
 * "José" salvo pelo Excel-BR em ANSI vira "Jos�" quando lido como UTF-8.
 * O caractere de substituição é o sinal de que a aposta errada foi feita.
 */
function decodificar(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(bytes);
}

function lerCsv(bytes: ArrayBuffer): MatrizPlanilha {
  const texto = decodificar(bytes);

  const resultado = Papa.parse<string[]>(texto, {
    skipEmptyLines: "greedy",
    // Sem `header`: o mapeamento de colunas é do módulo de importação, que
    // aceita sinônimos e acentuação.
  });

  return resultado.data
    .slice(0, MAX_LINHAS)
    .map((linha) => linha.map((celula) => (celula ?? "").trim()));
}

/** Extensões aceitas na tela de importação. */
export const EXTENSOES = [".xlsx", ".csv"] as const;

export async function lerPlanilha(arquivo: File): Promise<MatrizPlanilha> {
  const nome = arquivo.name.toLowerCase();
  const bytes = await arquivo.arrayBuffer();

  if (nome.endsWith(".csv")) return lerCsv(bytes);

  if (nome.endsWith(".xlsx")) {
    try {
      return await lerXlsx(bytes);
    } catch (erro) {
      if (erro instanceof ErroDePlanilha) throw erro;
      console.error("[planilha] falha ao ler xlsx", erro);
      throw new ErroDePlanilha(
        "Não foi possível ler este arquivo .xlsx. Confira se ele abre no Excel e tente de novo.",
      );
    }
  }

  // .xls antigo é formato binário diferente e não é aceito — dizer isso é
  // mais útil do que falhar na leitura.
  throw new ErroDePlanilha(
    "Formato não aceito. Envie um arquivo .xlsx ou .csv — no Excel, use Salvar como e escolha um dos dois.",
  );
}

/** Monta o modelo de planilha que a tela oferece para download. */
export async function gerarModeloXlsx(
  cabecalho: readonly string[],
  exemplo: readonly string[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const aba = workbook.addWorksheet("Pessoas");

  aba.addRow([...cabecalho]);
  aba.addRow([...exemplo]);

  aba.getRow(1).font = { bold: true };
  aba.columns = cabecalho.map((titulo) => ({ width: Math.max(14, titulo.length + 4) }));

  // Texto em tudo: é o que impede o Excel de comer o zero à esquerda do CPF
  // e da matrícula quando a pessoa preencher o modelo.
  for (const coluna of aba.columns) coluna.numFmt = "@";

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
