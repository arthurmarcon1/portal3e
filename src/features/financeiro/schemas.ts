import { z } from "zod";

import { opcional, primeiraMensagem, texto, uuid } from "@/lib/campos-zod";

import { CATEGORIAS, CHAVES_CATEGORIA } from "./categorias";
import { primeiroDiaDoMes } from "./painel";

/**
 * Entrada das telas do financeiro do contrato. O mesmo esquema valida no
 * cliente e na Server Action; vale a do servidor.
 */

export { primeiraMensagem };

/** "2026-11" (input type=month) ou "2026-11-01" → "2026-11-01". */
export const mes = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normal = primeiroDiaDoMes(v);
    if (!normal) {
      ctx.addIssue({ code: "custom", message: "Informe o mês (mês e ano)." });
      return z.NEVER;
    }
    return normal;
  });

/** Valor em reais: aceita "1.234,56", "1234,56" e "1234.56". */
export const valorEmReais = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const n =
      typeof v === "number"
        ? v
        : Number(
            v.trim().replace(/^R\$\s*/i, "").includes(",")
              ? v.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".")
              : v.trim().replace(/^R\$\s*/i, ""),
          );
    if (!Number.isFinite(n) || n <= 0) {
      ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero." });
      return z.NEVER;
    }
    if (n > 99_999_999) {
      ctx.addIssue({ code: "custom", message: "Valor alto demais. Confira os dígitos." });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

export const esquemaImportacao = z.object({
  contrato_id: uuid,
  vigente_desde: mes,
  observacao: opcional(400),
});

export const esquemaAbrirCompetencia = z.object({
  contrato_id: uuid,
  mes,
});

export const esquemaMudarCompetencia = z.object({
  competencia_id: uuid,
  status: z.enum(["aberta", "fechada"]),
});

export const esquemaLancamento = z
  .object({
    competencia_id: uuid,
    categoria: z.enum(CHAVES_CATEGORIA, "Escolha o tipo do lançamento."),
    descricao: texto("a descrição", 240),
    valor: valorEmReais,
    data_documento: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .default(null),
    posto_id: z
      .string()
      .trim()
      .transform((v) => (v === "" || v === "nenhum" ? null : v))
      .pipe(uuid.nullable())
      .nullable()
      .default(null),
  })
  .transform((d) => ({ ...d, natureza: CATEGORIAS[d.categoria].natureza }));

export const esquemaConferencia = z
  .object({
    lancamento_id: uuid,
    categoria: z.enum(CHAVES_CATEGORIA, "Escolha o tipo do lançamento."),
    descricao: texto("a descrição", 240),
    valor: valorEmReais,
  })
  .transform((d) => ({ ...d, natureza: CATEGORIAS[d.categoria].natureza }));

export const esquemaDescarte = z.object({
  lancamento_id: uuid,
  motivo: texto("o motivo do descarte", 240),
});

export type EntradaLancamento = z.input<typeof esquemaLancamento>;
