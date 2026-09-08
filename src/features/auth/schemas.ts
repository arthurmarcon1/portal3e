import { z } from "zod";

/**
 * Esquemas de entrada da autenticação.
 *
 * O mesmo objeto valida no cliente (via zodResolver) e no servidor. A
 * validação do cliente é conveniência; a que vale é a da Server Action.
 */

/** docs/03: mínimo 8 caracteres, sem exigência de símbolo. */
export const SENHA_MINIMA = 8;

const senha = z
  .string()
  .min(SENHA_MINIMA, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
  .max(72, "A senha pode ter no máximo 72 caracteres.");

const identificador = z
  .string()
  .trim()
  .min(1, "Informe seu CPF ou e-mail.")
  .max(120, "Identificador longo demais.");

export const esquemaLogin = z.object({
  identificador,
  senha: z.string().min(1, "Informe sua senha."),
  /** Para onde voltar depois de entrar. Validado de novo no servidor. */
  destino: z.string().max(400).optional(),
});

export const esquemaTrocaDeSenha = z
  .object({
    senha,
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ["confirmacao"],
    error: "As senhas não são iguais.",
  });

export const esquemaPedidoDeCodigo = z.object({ identificador });

export const esquemaRedefinicao = z
  .object({
    identificador,
    codigo: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "O código tem 6 dígitos."),
    senha,
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ["confirmacao"],
    error: "As senhas não são iguais.",
  });

export type EntradaLogin = z.infer<typeof esquemaLogin>;
export type EntradaTrocaDeSenha = z.infer<typeof esquemaTrocaDeSenha>;
export type EntradaPedidoDeCodigo = z.infer<typeof esquemaPedidoDeCodigo>;
export type EntradaRedefinicao = z.infer<typeof esquemaRedefinicao>;

/** Primeira mensagem de erro do Zod — é a que vai ao toast/alerta. */
export function primeiraMensagem(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Verifique os dados informados.";
}
