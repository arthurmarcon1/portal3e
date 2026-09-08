import { z } from "zod";

/**
 * Entrada das telas de estrutura comercial: contratante, contrato e unidade.
 *
 * O mesmo esquema valida no cliente (zodResolver) e na Server Action. Vale a
 * do servidor.
 */

const texto = (rotulo: string, max = 160) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} pode ter no máximo ${max} caracteres.`);

/** Campo livre que aceita vazio e chega ao banco como null, nunca "". */
const opcional = (max = 160) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

const uuid = z.uuid("Selecione uma opção válida.");

/**
 * CNPJ: 14 dígitos, guardado sem máscara.
 *
 * Só o formato é validado. O dígito verificador entra junto com o de CPF na
 * F1.2, num utilitário só, para não ter duas implementações da mesma conta.
 */
const cnpj = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v === "" || v.length === 14, "CNPJ precisa ter 14 dígitos.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

/** Data ISO (yyyy-mm-dd) ou vazio. */
const data = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

export const STATUS = ["ativo", "inativo", "arquivado"] as const;
export const statusGenerico = z.enum(STATUS);

// ---------------------------------------------------------------------
// Contratante
// ---------------------------------------------------------------------

export const esquemaContratante = z.object({
  nome: texto("o nome do contratante"),
  cnpj,
});

export const esquemaContratanteEdicao = esquemaContratante.extend({ id: uuid });

// ---------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------

export const esquemaContrato = z
  .object({
    contratante_id: uuid,
    numero: texto("o número do contrato", 40),
    descricao: opcional(400),
    vigencia_inicio: data,
    vigencia_fim: data,
    /** Unidades vinculadas por `contrato_unidades`. Pode ser vazio. */
    unidades: z.array(uuid).default([]),
  })
  .refine(
    (d) =>
      !d.vigencia_inicio || !d.vigencia_fim || d.vigencia_inicio <= d.vigencia_fim,
    {
      path: ["vigencia_fim"],
      error: "O fim da vigência não pode ser antes do início.",
    },
  );

export const esquemaContratoEdicao = z.intersection(
  esquemaContrato,
  z.object({ id: uuid }),
);

// ---------------------------------------------------------------------
// Unidade
// ---------------------------------------------------------------------

export const esquemaUnidade = z.object({
  contratante_id: uuid,
  nome: texto("o nome da unidade"),
  endereco: opcional(240),
  cidade: opcional(120),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "UF tem 2 letras.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
});

export const esquemaUnidadeEdicao = esquemaUnidade.extend({ id: uuid });

// ---------------------------------------------------------------------
// Mudança de situação — desativar/reativar sem apagar (invariante 8)
// ---------------------------------------------------------------------

export const esquemaMudancaDeStatus = z.object({
  id: uuid,
  status: statusGenerico,
});

export type EntradaContratante = z.input<typeof esquemaContratante>;
export type EntradaContrato = z.input<typeof esquemaContrato>;
export type EntradaUnidade = z.input<typeof esquemaUnidade>;

/** Primeira mensagem de erro do Zod — a que vai ao toast. */
export function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Verifique os dados informados.";
}
