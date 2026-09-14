import { apenasDigitos, validarCpf } from "@/lib/cpf-cnpj";
import type { MatrizPlanilha } from "@/lib/planilha";

/**
 * Mapeamento e validação linha a linha da planilha do quadro (F1.3).
 *
 * Módulo puro de propósito: recebe a matriz já lida e o catálogo de contratos
 * e unidades, e devolve o diagnóstico. Sem banco e sem rede, é o que permite
 * cobrir com teste de unidade cada erro que a tela precisa saber explicar.
 *
 * A mesma função roda duas vezes: na pré-visualização e de novo na hora de
 * importar. A segunda não é desperdício — entre uma e outra o navegador
 * devolve as linhas, e nada que volta do cliente entra no banco sem ser
 * validado outra vez.
 */

export const COLUNAS = [
  "nome",
  "cpf",
  "matricula",
  "funcao",
  "contrato",
  "unidade",
  "data_inicio",
  "telefone",
] as const;

export type Coluna = (typeof COLUNAS)[number];

export const OBRIGATORIAS: readonly Coluna[] = [
  "nome",
  "cpf",
  "funcao",
  "contrato",
  "unidade",
  "data_inicio",
];

/**
 * Sinônimos aceitos no cabeçalho.
 *
 * Quem exporta da folha não renomeia coluna para agradar o Portal. Aceitar
 * "Nome completo" e "Matrícula" custa uma linha aqui e evita um suporte.
 */
const SINONIMOS: Record<string, Coluna> = {
  nome: "nome",
  nomecompleto: "nome",
  funcionario: "nome",
  cpf: "cpf",
  matricula: "matricula",
  registro: "matricula",
  funcao: "funcao",
  cargo: "funcao",
  contrato: "contrato",
  numerodocontrato: "contrato",
  numerocontrato: "contrato",
  unidade: "unidade",
  local: "unidade",
  posto: "unidade",
  datainicio: "data_inicio",
  datadeinicio: "data_inicio",
  inicio: "data_inicio",
  admissao: "data_inicio",
  telefone: "telefone",
  celular: "telefone",
  fone: "telefone",
};

/** "Matrícula" e "matricula " caem no mesmo lugar. */
function normalizarCabecalho(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type LinhaImportacao = Record<Coluna, string>;

export type LinhaAnalisada = {
  /** Número da linha na planilha, contando o cabeçalho como 1. */
  numero: number;
  dados: LinhaImportacao;
  /** Vazio = linha válida. */
  erros: string[];
  /** CPF já cadastrado: a importação atualiza em vez de criar. */
  atualiza: boolean;
};

export type Analise = {
  linhas: LinhaAnalisada[];
  validas: number;
  comErro: number;
  criara: number;
  atualizara: number;
};

/** O que o banco já tem, para a linha ser conferida antes de qualquer escrita. */
export type Catalogo = {
  /** Número do contrato → unidades que ele atende, por nome. */
  contratos: { numero: string; unidades: string[] }[];
  /** CPFs (só dígitos) já cadastrados na organização. */
  cpfsExistentes: string[];
};

export class ErroDeCabecalho extends Error {}

/**
 * Casa o cabeçalho da planilha com as colunas conhecidas.
 *
 * Aceita ordem trocada e coluna extra — o que não pode faltar é o
 * obrigatório. Coluna desconhecida é ignorada em silêncio: planilha de RH
 * costuma carregar coisas que não interessam ao Portal.
 */
export function mapearColunas(cabecalho: string[]): Partial<Record<Coluna, number>> {
  const mapa: Partial<Record<Coluna, number>> = {};

  cabecalho.forEach((celula, indice) => {
    const chave = SINONIMOS[normalizarCabecalho(celula ?? "")];
    // `!(chave in mapa)`: se a planilha repetir a coluna, a primeira vence.
    if (chave && !(chave in mapa)) mapa[chave] = indice;
  });

  const faltando = OBRIGATORIAS.filter((c) => mapa[c] === undefined);
  if (faltando.length > 0) {
    throw new ErroDeCabecalho(
      `A planilha não tem ${faltando.length === 1 ? "a coluna" : "as colunas"} ${faltando.join(", ")}. Baixe o modelo e confira a primeira linha.`,
    );
  }

  return mapa;
}

/**
 * Normaliza a data para ISO.
 *
 * Aceita o que a planilha entrega: ISO (célula de data, já convertida na
 * leitura) e dd/mm/aaaa, que é como a pessoa digita. Devolve "" quando não
 * reconhece — quem reclama é o validador, com o texto original na mensagem.
 */
export function normalizarData(valor: string): string {
  const bruto = valor.trim();
  if (bruto === "") return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto;

  const br = bruto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (br) {
    const [, dia, mes, ano] = br;
    return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }

  return "";
}

/** Data que existe de verdade: 31/02 não passa. */
function dataRealista(iso: string): boolean {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (ano < 1900 || ano > 2200) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
  );
}

/**
 * CPF da planilha, com o zero à esquerda devolvido.
 *
 * Célula numérica perde o zero inicial: `01000791998` vira `1000791998`. Dez
 * dígitos só podem ser isso, então completamos — e o dígito verificador
 * continua sendo quem diz se o número presta.
 */
export function cpfDaPlanilha(valor: string): string {
  const digitos = apenasDigitos(valor);
  return digitos.length === 10 ? `0${digitos}` : digitos;
}

export function analisarPlanilha(matriz: MatrizPlanilha, catalogo: Catalogo): Analise {
  const [cabecalho, ...corpo] = matriz;
  if (!cabecalho) {
    throw new ErroDeCabecalho("A planilha está vazia.");
  }

  const mapa = mapearColunas(cabecalho);

  const unidadesPorContrato = new Map(
    catalogo.contratos.map((c) => [
      c.numero.trim().toLowerCase(),
      new Set(c.unidades.map((u) => u.trim().toLowerCase())),
    ]),
  );
  const existentes = new Set(catalogo.cpfsExistentes);
  const cpfsNoArquivo = new Map<string, number>();

  const linhas: LinhaAnalisada[] = [];

  corpo.forEach((bruta, indice) => {
    const numero = indice + 2; // +1 pelo cabeçalho, +1 porque planilha conta do 1
    const valor = (coluna: Coluna): string => {
      const posicao = mapa[coluna];
      return posicao === undefined ? "" : (bruta[posicao] ?? "").trim();
    };

    const dados: LinhaImportacao = {
      nome: valor("nome"),
      cpf: cpfDaPlanilha(valor("cpf")),
      matricula: valor("matricula"),
      funcao: valor("funcao"),
      contrato: valor("contrato"),
      unidade: valor("unidade"),
      data_inicio: normalizarData(valor("data_inicio")),
      telefone: apenasDigitos(valor("telefone")),
    };

    // Linha inteiramente em branco no meio da planilha não é erro: é sobra.
    const vazia = OBRIGATORIAS.every((c) => dados[c] === "");
    if (vazia) return;

    const erros: string[] = [];

    if (dados.nome === "") erros.push("Nome em branco.");

    if (dados.cpf === "") {
      erros.push("CPF em branco.");
    } else if (!validarCpf(dados.cpf)) {
      erros.push(`CPF inválido (${valor("cpf")}).`);
    } else {
      const jaVisto = cpfsNoArquivo.get(dados.cpf);
      if (jaVisto) {
        erros.push(`CPF repetido na planilha — já aparece na linha ${jaVisto}.`);
      } else {
        cpfsNoArquivo.set(dados.cpf, numero);
      }
    }

    if (dados.funcao === "") erros.push("Função em branco.");

    const unidades = unidadesPorContrato.get(dados.contrato.toLowerCase());
    if (dados.contrato === "") {
      erros.push("Contrato em branco.");
    } else if (!unidades) {
      erros.push(`Contrato "${dados.contrato}" não existe ou não está ativo.`);
    } else if (dados.unidade === "") {
      erros.push("Unidade em branco.");
    } else if (!unidades.has(dados.unidade.toLowerCase())) {
      erros.push(
        `A unidade "${dados.unidade}" não é atendida pelo contrato ${dados.contrato}.`,
      );
    }

    if (dados.data_inicio === "") {
      const original = valor("data_inicio");
      erros.push(
        original === ""
          ? "Data de início em branco."
          : `Data de início não reconhecida (${original}). Use dd/mm/aaaa.`,
      );
    } else if (!dataRealista(dados.data_inicio)) {
      erros.push(`Data de início inexistente (${valor("data_inicio")}).`);
    }

    if (dados.telefone !== "" && (dados.telefone.length < 10 || dados.telefone.length > 13)) {
      erros.push(`Telefone inválido (${valor("telefone")}).`);
    }

    linhas.push({
      numero,
      dados,
      erros,
      atualiza: erros.length === 0 && existentes.has(dados.cpf),
    });
  });

  const validas = linhas.filter((l) => l.erros.length === 0);

  return {
    linhas,
    validas: validas.length,
    comErro: linhas.length - validas.length,
    criara: validas.filter((l) => !l.atualiza).length,
    atualizara: validas.filter((l) => l.atualiza).length,
  };
}
