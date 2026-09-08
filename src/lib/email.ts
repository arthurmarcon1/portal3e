import "server-only";

import { Resend } from "resend";

/**
 * Envio de e-mail transacional (Resend).
 *
 * Regra do produto: e-mail avisa e leva ao Portal. Nunca leva documento em
 * anexo nem dado sensível. O código de uso único é a única exceção, porque
 * ele só tem valor junto com a senha e expira em 10 minutos.
 */

export type Mensagem = {
  para: string;
  assunto: string;
  /** Texto puro. Cliente antigo e leitor de tela leem melhor. */
  texto: string;
};

let cliente: Resend | null = null;

function resend(): Resend {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) {
    throw new Error(
      "RESEND_API_KEY não definida. Sem ela o Portal não envia código de recuperação.",
    );
  }
  cliente ??= new Resend(chave);
  return cliente;
}

export async function enviarEmail({ para, assunto, texto }: Mensagem): Promise<void> {
  const remetente = process.env.EMAIL_REMETENTE;
  if (!remetente) {
    throw new Error("EMAIL_REMETENTE não definida.");
  }

  const { error } = await resend().emails.send({
    from: remetente,
    to: para,
    subject: assunto,
    text: texto,
  });

  if (error) {
    throw new Error(`Resend recusou o envio: ${error.message}`);
  }
}
