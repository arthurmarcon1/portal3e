import { z } from "zod";

/** Entradas das Server Actions de alimentação. Mensagens já em português. */

const id = (rotulo: string) => z.string().uuid(`${rotulo} inválido. Recarregue a página e tente de novo.`);

export const esquemaEnvio = z.object({
  contrato_id: id("Contrato"),
});

export const esquemaTranscricao = z.object({
  id: id("Alimentação"),
  transcricao: z
    .string()
    .trim()
    .min(3, "Escreva o que foi dito no áudio (ou o que a foto mostra).")
    .max(4000, "A transcrição passa de 4.000 caracteres. Resuma."),
});

export const esquemaConferencia = z.object({
  id: id("Alimentação"),
  rubrica_id: id("Rubrica").or(z.literal("").transform(() => null)).refine((v) => v !== null, "Escolha a rubrica."),
  unidade_id: id("Cliente").nullable().or(z.literal("").transform(() => null)),
  descricao: z.string().trim().min(3, "Escreva uma descrição.").max(500, "A descrição passa de 500 caracteres."),
  valor: z.coerce
    .number({ message: "Informe o valor em reais." })
    .positive("O valor precisa ser maior que zero.")
    .max(999_999_999, "Confira o valor: ele está alto demais."),
  competencia: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Informe o mês da competência.")
    .transform((v) => `${v}-01`),
});

export const esquemaRecusa = z.object({
  id: id("Alimentação"),
  motivo: z.string().trim().min(5, "Diga por que a alimentação foi recusada.").max(500),
});

export type EntradaConferencia = z.input<typeof esquemaConferencia>;

export function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Confira os campos e tente de novo.";
}
