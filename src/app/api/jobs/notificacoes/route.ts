import { timingSafeEqual } from "node:crypto";

import { enviarPendentes, gerarAvisosDePrazo } from "@/features/notificacoes/envio";

/**
 * Job das notificações (F4.3), chamado pelo cron da Vercel (vercel.json).
 *
 * Valida sozinho (invariante 9): sem usuário, a credencial é o
 * `CRON_SECRET` no `Authorization: Bearer …` — o que a Vercel manda nos
 * crons. Sem o segredo configurado, o job não roda: falha fechada.
 *
 * Duas etapas: (1) gerar lembretes e avisos de vencido do dia — idempotente,
 * pode rodar de hora em hora; (2) enviar a fila de e-mail, que só sai com a
 * flag ligada e dentro da janela de 8h às 20h de Brasília.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const recebido = request.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo ?? ""}`;
  const confere =
    Boolean(segredo) &&
    recebido.length === esperado.length &&
    timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
  if (!confere) return new Response("Não autorizado.", { status: 401 });

  try {
    const avisos = await gerarAvisosDePrazo();
    const envio = await enviarPendentes();
    return Response.json({ avisos, envio });
  } catch (erro) {
    console.error("[job notificacoes] falhou", erro);
    return new Response("O job de notificações falhou. Veja o log do servidor.", { status: 500 });
  }
}
