import { z } from "zod";

import {
  data,
  dataObrigatoria,
  opcional,
  primeiraMensagem,
  statusGenerico,
  texto,
  uuid,
} from "@/lib/campos-zod";
import { apenasDigitos, validarCpf } from "@/lib/cpf-cnpj";

/**
 * Entrada das telas de pessoas e alocações (F1.2).
 *
 * O mesmo esquema valida no cliente (zodResolver) e na Server Action. Vale a
 * do servidor.
 */

export { primeiraMensagem };

/**
 * CPF: máscara na tela, **somente dígitos no banco**.
 *
 * O `transform` roda antes dos `refine`, então o que chega ao Postgres já é a
 * string de 11 dígitos, tenha o usuário digitado com ponto e traço ou não.
 * Obrigatório: é por ele que o funcionário entra no Portal (docs/03).
 */
const cpf = z
  .string()
  .trim()
  .transform(apenasDigitos)
  .refine((v) => v.length > 0, "Informe o CPF.")
  .refine((v) => v.length === 11, "CPF precisa ter 11 dígitos.")
  .refine(validarCpf, "CPF inválido. Confira os dígitos.");

/** Telefone também vai sem máscara — o seed e a F1.3 gravam só dígitos. */
const telefone = z
  .string()
  .trim()
  .transform(apenasDigitos)
  .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

const emailPessoal = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

// ---------------------------------------------------------------------
// Pessoa
// ---------------------------------------------------------------------

export const esquemaPessoa = z.object({
  nome: texto("o nome da pessoa"),
  cpf,
  matricula: opcional(40),
  data_nascimento: data,
  telefone,
  email_pessoal: emailPessoal,
  endereco: opcional(240),
});

export const esquemaPessoaEdicao = esquemaPessoa.extend({ id: uuid });

export const esquemaMudancaDeStatusPessoa = z.object({
  id: uuid,
  status: statusGenerico,
});

// ---------------------------------------------------------------------
// Alocação
// ---------------------------------------------------------------------

/**
 * Criar alocação exige contrato + unidade + função + data de início.
 *
 * Os quatro são obrigatórios por decisão da F1.2: alocação sem um deles não
 * diz onde a pessoa trabalha, e é ela que define o que o contratante enxerga
 * (docs/03, decisão 3). A coerência entre contrato e unidade — a unidade
 * precisa estar vinculada ao contrato — depende do banco e é conferida na
 * Server Action.
 */
export const esquemaAlocacao = z.object({
  pessoa_id: uuid,
  contrato_id: uuid,
  unidade_id: uuid,
  funcao: texto("a função", 120),
  data_inicio: dataObrigatoria("a data de início"),
});

/**
 * Encerrar alocação pede data de fim e **não apaga o registro**: vira
 * `status = 'encerrada'` com `data_fim` preenchida. A comparação com a data
 * de início é feita na action, que é quem conhece a linha atual.
 */
export const esquemaEncerramento = z.object({
  id: uuid,
  data_fim: dataObrigatoria("a data de fim"),
});

export type EntradaPessoa = z.input<typeof esquemaPessoa>;
export type EntradaAlocacao = z.input<typeof esquemaAlocacao>;
export type EntradaEncerramento = z.input<typeof esquemaEncerramento>;

// ---------------------------------------------------------------------
// Importação por planilha (F1.3)
// ---------------------------------------------------------------------

/**
 * O lote que volta do navegador depois da pré-visualização.
 *
 * Aqui só se confere a **forma** — que é um array de linhas com as oito
 * colunas como texto. O conteúdo de cada linha é reavaliado por
 * `analisarPlanilha` na própria action, com o catálogo do banco em mãos:
 * aprovação na pré-visualização não sobrevive a uma viagem pelo cliente.
 */
const linhaImportacao = z.object({
  nome: z.string(),
  cpf: z.string(),
  matricula: z.string(),
  funcao: z.string(),
  contrato: z.string(),
  unidade: z.string(),
  data_inicio: z.string(),
  telefone: z.string(),
});

export const esquemaLoteImportacao = z.object({
  linhas: z
    .array(linhaImportacao)
    .min(1, "Nenhuma linha para importar.")
    .max(5000, "A planilha tem linhas demais. Divida em partes de até 5000."),
});
