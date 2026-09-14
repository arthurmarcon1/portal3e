import { z } from "zod";

import {
  data,
  opcional,
  primeiraMensagem,
  statusGenerico,
  texto,
  uuid,
} from "@/lib/campos-zod";
import { apenasDigitos, validarCnpj } from "@/lib/cpf-cnpj";

/**
 * Entrada das telas de estrutura comercial: contratante, contrato e unidade.
 *
 * O mesmo esquema valida no cliente (zodResolver) e na Server Action. Vale a
 * do servidor.
 *
 * Os campos genéricos — texto, opcional, data, uuid — moram em
 * `@/lib/campos-zod` desde a F1.2, que precisa deles com as mesmas mensagens.
 */

// Reexportados porque as telas e as actions deste módulo já os importavam daqui.
export { primeiraMensagem, statusGenerico };
export { STATUS } from "@/lib/campos-zod";

/**
 * CNPJ: 14 dígitos com verificador conferido, guardado sem máscara.
 *
 * A conta mora em `@/lib/cpf-cnpj`, o mesmo utilitário que valida o CPF da
 * F1.2 — era isso que esta linha esperava desde a F1.1.
 */
const cnpj = z
  .string()
  .trim()
  .transform(apenasDigitos)
  .refine((v) => v === "" || v.length === 14, "CNPJ precisa ter 14 dígitos.")
  .refine((v) => v === "" || validarCnpj(v), "CNPJ inválido. Confira os dígitos.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

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
