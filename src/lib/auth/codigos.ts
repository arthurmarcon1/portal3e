import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Código de uso único (`codigos_verificacao`).
 *
 * Usado na recuperação de senha e, a partir da F3.3, na verificação reforçada
 * para abrir documento sensível.
 *
 * Regras que não se negociam:
 * - só o hash sha256 vai para o banco;
 * - o código nunca é logado, nunca volta em resposta HTTP, nem em dev;
 * - validade curta e número máximo de tentativas.
 */

export const VALIDADE_MINUTOS = 10;
export const MAX_TENTATIVAS = 5;

export type Finalidade = "recuperacao_senha" | "acesso_documento";

function hashDoCodigo(codigo: string): string {
  return createHash("sha256").update(codigo, "utf8").digest("hex");
}

function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Gera um código de 6 dígitos e guarda apenas o hash.
 *
 * Invalida os códigos anteriores da mesma finalidade: só o último vale, então
 * pedir um novo cancela o anterior. Devolve o código em claro **apenas** para
 * quem vai entregá-lo (o envio de e-mail). Não o repasse adiante.
 */
export async function gerarCodigo(
  usuarioId: string,
  finalidade: Finalidade,
): Promise<string> {
  const admin = criarClienteAdmin();
  const agora = new Date();

  await admin
    .from("codigos_verificacao")
    .update({ usado_em: agora.toISOString() })
    .eq("usuario_id", usuarioId)
    .eq("finalidade", finalidade)
    .is("usado_em", null);

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");

  const { error } = await admin.from("codigos_verificacao").insert({
    usuario_id: usuarioId,
    codigo_hash: hashDoCodigo(codigo),
    finalidade,
    expira_em: new Date(agora.getTime() + VALIDADE_MINUTOS * 60_000).toISOString(),
  });

  if (error) throw new Error(`Não foi possível gravar o código: ${error.message}`);

  return codigo;
}

export type ResultadoValidacao = { ok: true } | { ok: false; erro: string };

/**
 * Confere o código informado e o invalida no sucesso.
 *
 * Cada tentativa errada incrementa `tentativas`; passando de `MAX_TENTATIVAS`
 * o código morre e a pessoa precisa pedir outro.
 */
export async function validarCodigo(
  usuarioId: string,
  finalidade: Finalidade,
  codigo: string,
): Promise<ResultadoValidacao> {
  const admin = criarClienteAdmin();
  const agora = new Date();

  const { data: registro } = await admin
    .from("codigos_verificacao")
    .select("id, codigo_hash, tentativas, expira_em")
    .eq("usuario_id", usuarioId)
    .eq("finalidade", finalidade)
    .is("usado_em", null)
    .gt("expira_em", agora.toISOString())
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!registro) {
    return { ok: false, erro: "Código expirado ou já utilizado. Peça um novo código." };
  }

  if (registro.tentativas >= MAX_TENTATIVAS) {
    await admin
      .from("codigos_verificacao")
      .update({ usado_em: agora.toISOString() })
      .eq("id", registro.id);
    return { ok: false, erro: "Número de tentativas excedido. Peça um novo código." };
  }

  if (!iguaisEmTempoConstante(hashDoCodigo(codigo), registro.codigo_hash)) {
    await admin
      .from("codigos_verificacao")
      .update({ tentativas: registro.tentativas + 1 })
      .eq("id", registro.id);
    const restantes = MAX_TENTATIVAS - (registro.tentativas + 1);
    return {
      ok: false,
      erro:
        restantes > 0
          ? `Código incorreto. Você ainda tem ${restantes} tentativa${restantes === 1 ? "" : "s"}.`
          : "Código incorreto. Peça um novo código.",
    };
  }

  await admin
    .from("codigos_verificacao")
    .update({ usado_em: agora.toISOString() })
    .eq("id", registro.id);

  return { ok: true };
}
