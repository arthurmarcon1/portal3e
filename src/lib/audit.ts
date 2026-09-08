import "server-only";

import { headers } from "next/headers";

import { getUsuario } from "@/lib/auth/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Helper único de log (CLAUDE.md, invariante 6 e docs/03 — "Auditoria").
 *
 * Escreve com `service_role` de propósito: `auditoria` não tem policy de
 * insert para `authenticated`. O log não pode depender da boa vontade de quem
 * está sendo auditado.
 */

export type Auditavel = {
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  detalhes?: Record<string, unknown> | null;
  /**
   * Por padrão saem da sessão. Informe explicitamente quando não houver
   * sessão ainda — falha de login, por exemplo.
   */
  usuarioId?: string | null;
  orgId?: string | null;
};

/** Primeiro IP do `x-forwarded-for`, ou `null` se o valor não servir para `inet`. */
function extrairIp(cabecalhos: Headers): string | null {
  const bruto =
    cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    cabecalhos.get("x-real-ip")?.trim() ??
    null;
  if (!bruto) return null;

  // Postgres rejeita `inet` inválido e derrubaria o insert inteiro.
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  const ipv6 = /^[0-9a-fA-F:]+$/;
  if (ipv4.test(bruto) || (bruto.includes(":") && ipv6.test(bruto))) return bruto;
  return null;
}

/**
 * Grita no console do servidor quando um evento não foi gravado.
 *
 * Leva o evento inteiro de propósito: se a linha não entrou em `auditoria`,
 * este log é o único lugar onde ela ainda existe. Sem o conteúdo, resta saber
 * que "algo falhou" — que é o mesmo que não saber nada.
 */
function avisarFalha(evento: Auditavel, ids: IdsResolvidos, causa: unknown): void {
  console.error(
    `[auditoria] EVENTO NÃO GRAVADO — acao=${evento.acao} entidade=${evento.entidade} ` +
      `entidade_id=${evento.entidadeId ?? "-"} usuario_id=${ids.usuarioId ?? "-"} ` +
      `org_id=${ids.orgId ?? "-"}`,
    { detalhes: evento.detalhes ?? null, causa },
  );
}

type IdsResolvidos = { usuarioId: string | null; orgId: string | null };

/**
 * Grava um evento em `auditoria`.
 *
 * Nunca lança: um log que falha não pode derrubar o login nem a mutação que
 * ele acompanha. Mas também nunca falha calado — ver `avisarFalha`. O retorno
 * diz se gravou, para quem quiser tratar.
 */
export async function registrarAuditoria(
  evento: Auditavel,
): Promise<{ ok: boolean }> {
  // Fora do try: o catch precisa dos ids para o aviso, mesmo que a falha
  // tenha acontecido antes de resolvê-los.
  const ids: IdsResolvidos = {
    usuarioId: evento.usuarioId ?? null,
    orgId: evento.orgId ?? null,
  };

  try {
    const cabecalhos = await headers();
    const admin = criarClienteAdmin();

    // Sessão só é consultada quando o chamador não informou — a falha de
    // login precisa gravar um usuário que ainda não está autenticado.
    const daSessao =
      evento.usuarioId === undefined || evento.orgId === undefined
        ? await getUsuario()
        : null;
    if (evento.usuarioId === undefined) ids.usuarioId = daSessao?.id ?? null;
    if (evento.orgId === undefined) ids.orgId = daSessao?.orgId ?? null;

    const { error } = await admin.from("auditoria").insert({
      acao: evento.acao,
      entidade: evento.entidade,
      entidade_id: evento.entidadeId ?? null,
      detalhes: (evento.detalhes ?? null) as never,
      usuario_id: ids.usuarioId,
      org_id: ids.orgId,
      ip: extrairIp(cabecalhos),
      user_agent: cabecalhos.get("user-agent"),
    });

    if (error) {
      avisarFalha(evento, ids, error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (erro) {
    avisarFalha(evento, ids, erro);
    return { ok: false };
  }
}
