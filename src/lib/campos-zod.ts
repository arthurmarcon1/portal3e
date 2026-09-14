import { z } from "zod";

/**
 * Primitivos de validação compartilhados pelos módulos.
 *
 * Nasceram na F1.1, dentro de `features/contratos/schemas.ts`. A F1.2 precisa
 * dos mesmos campos com as mesmas mensagens — e duas cópias divergem no
 * primeiro ajuste de texto. Aqui ficam só as peças genéricas: o que é regra
 * de um módulo continua no `schemas.ts` dele.
 */

/** Campo obrigatório de texto curto. O rótulo entra na mensagem de erro. */
export const texto = (rotulo: string, max = 160) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .max(max, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} pode ter no máximo ${max} caracteres.`);

/** Campo livre que aceita vazio e chega ao banco como null, nunca "". */
export const opcional = (max = 160) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const uuid = z.uuid("Selecione uma opção válida.");

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Data ISO (yyyy-mm-dd) ou vazio. */
export const data = z
  .string()
  .trim()
  .refine((v) => v === "" || ISO.test(v), "Data inválida.")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .default(null);

/** Data ISO obrigatória. O rótulo entra na mensagem de erro. */
export const dataObrigatoria = (rotulo: string) =>
  z.string().trim().regex(ISO, `Informe ${rotulo}.`);

export const STATUS = ["ativo", "inativo", "arquivado"] as const;
export const statusGenerico = z.enum(STATUS);

/** Primeira mensagem do Zod — a que vai ao toast. */
export function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Verifique os dados informados.";
}
