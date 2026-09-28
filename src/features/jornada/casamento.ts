/**
 * Casamento de arquivo de espelho com pessoa (F4.1).
 *
 * Puro: sem banco e sem `server-only`. A tela usa para mostrar o casamento na
 * hora, e a Server Action **refaz** tudo antes de publicar — o que chegou do
 * navegador não é prova de nada.
 *
 * A regra é uma expressão regular aplicada ao NOME do arquivo (sem pasta),
 * cuja chave é o primeiro grupo de captura (ou o casamento inteiro, se não
 * houver grupo), e um campo: CPF ou matrícula. A nomenclatura real do
 * PontoTel ainda não veio (docs/06); por isso a regra é dado.
 */

export type CampoChave = "cpf" | "matricula";

export type Regra = { expressao: string; campo: CampoChave };

/** Tamanho máximo da expressão e do nome: limita o custo da regex no servidor. */
export const MAX_EXPRESSAO = 200;
export const MAX_NOME = 255;

export class ErroDeRegra extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeRegra";
  }
}

/**
 * Compila a regra ou diz, em português, por que ela não serve.
 *
 * Sem flags: o nome é comparado como está. `u` não entra porque CPF e
 * matrícula são ASCII, e flags a mais só abrem espaço para a regra casar
 * coisa diferente na tela e no servidor.
 */
export function compilarRegra(expressao: string): RegExp {
  const texto = expressao.trim();
  if (!texto) throw new ErroDeRegra("Informe a expressão que acha o CPF ou a matrícula no nome do arquivo.");
  if (texto.length > MAX_EXPRESSAO) {
    throw new ErroDeRegra(`A expressão pode ter no máximo ${MAX_EXPRESSAO} caracteres.`);
  }
  try {
    return new RegExp(texto);
  } catch {
    throw new ErroDeRegra("A expressão não é válida. Confira parênteses e barras.");
  }
}

/** Só o nome do arquivo, sem pasta de dentro do ZIP. */
export function nomeBase(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho;
}

/**
 * A chave que o nome carrega, já normalizada, ou `null`.
 *
 * CPF vira só dígitos e precisa ter 11; matrícula é comparada sem espaços nas
 * pontas e sem diferença de caixa — o cadastro da F1.3 também não distingue.
 */
export function extrairChave(nome: string, regra: RegExp, campo: CampoChave): string | null {
  const base = nomeBase(nome).slice(0, MAX_NOME);
  const achou = regra.exec(base);
  if (!achou) return null;
  const bruto = (achou[1] ?? achou[0] ?? "").trim();
  if (campo === "cpf") {
    const digitos = bruto.replace(/\D/g, "");
    return digitos.length === 11 ? digitos : null;
  }
  return bruto ? bruto.toUpperCase() : null;
}

export type PessoaParaCasar = {
  id: string;
  nome: string;
  cpf: string;
  matricula: string | null;
};

export type ArquivoCasado = { arquivo: string; pessoaId: string; pessoaNome: string };

export type MotivoNaoCasado =
  | "sem_chave" // a regra não achou CPF/matrícula no nome
  | "sem_pessoa" // achou, mas ninguém do seu alcance tem essa chave
  | "repetido" // outro arquivo do lote já casou com a mesma pessoa
  | "ja_publicado"; // essa pessoa já tem espelho publicado nesta competência

export type ArquivoNaoCasado = { arquivo: string; motivo: MotivoNaoCasado; chave: string | null; pessoaNome?: string };

export type Casamento = {
  casados: ArquivoCasado[];
  naoCasados: ArquivoNaoCasado[];
  /** Pessoas esperadas que ficaram sem arquivo no lote. */
  semEspelho: { id: string; nome: string }[];
};

export const MOTIVOS: Record<MotivoNaoCasado, string> = {
  sem_chave: "O nome do arquivo não tem CPF ou matrícula que a regra reconheça.",
  sem_pessoa: "Nenhuma pessoa do seu alcance tem esse CPF ou matrícula.",
  repetido: "Outro arquivo do lote já é desta pessoa. Só o primeiro será publicado.",
  ja_publicado: "Esta pessoa já tem espelho publicado nesta competência. Para corrigir, retifique o documento.",
};

/**
 * Casa os arquivos do lote.
 *
 * - `pessoas`: quem pode receber (o que a RLS mostra ao usuário);
 * - `esperadas`: quem deveria ter espelho (pessoas com alocação vigente,
 *   filtradas pelo contrato, se houver) — para a lista de "sem espelho";
 * - `jaPublicadas`: quem já tem espelho publicado na competência.
 *
 * A ordem dos arquivos é preservada: em repetição, vale o primeiro.
 */
export function casarArquivos(
  arquivos: string[],
  regra: Regra,
  pessoas: PessoaParaCasar[],
  esperadas: { id: string; nome: string }[],
  jaPublicadas: Set<string>,
): Casamento {
  const expressao = compilarRegra(regra.expressao);
  const porChave = new Map<string, PessoaParaCasar>();
  for (const p of pessoas) {
    const chave = regra.campo === "cpf" ? p.cpf.replace(/\D/g, "") : p.matricula?.trim().toUpperCase();
    if (chave) porChave.set(chave, p);
  }

  const casados: ArquivoCasado[] = [];
  const naoCasados: ArquivoNaoCasado[] = [];
  const usadas = new Set<string>();

  for (const arquivo of arquivos) {
    const chave = extrairChave(arquivo, expressao, regra.campo);
    if (!chave) {
      naoCasados.push({ arquivo, motivo: "sem_chave", chave: null });
      continue;
    }
    const pessoa = porChave.get(chave);
    if (!pessoa) {
      naoCasados.push({ arquivo, motivo: "sem_pessoa", chave });
      continue;
    }
    if (jaPublicadas.has(pessoa.id)) {
      naoCasados.push({ arquivo, motivo: "ja_publicado", chave, pessoaNome: pessoa.nome });
      continue;
    }
    if (usadas.has(pessoa.id)) {
      naoCasados.push({ arquivo, motivo: "repetido", chave, pessoaNome: pessoa.nome });
      continue;
    }
    usadas.add(pessoa.id);
    casados.push({ arquivo, pessoaId: pessoa.id, pessoaNome: pessoa.nome });
  }

  // Só id e nome: a lista vai para a tela, e CPF não precisa ir junto.
  const semEspelho = esperadas
    .filter((p) => !usadas.has(p.id) && !jaPublicadas.has(p.id))
    .map((p) => ({ id: p.id, nome: p.nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { casados, naoCasados, semEspelho };
}

/** `2026-08` (input month) → `2026-08-01` (coluna `competencia`), ou `null`. */
export function competenciaDoMes(mes: string): string | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? `${mes}-01` : null;
}

/** `2026-08-01` → `08/2026`. */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}
