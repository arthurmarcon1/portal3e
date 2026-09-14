import type { ReactNode } from "react";

import { exigirPermissao } from "@/lib/auth/sessao";

/**
 * Fronteira de MÓDULO (CLAUDE.md, invariante 9).
 *
 * Cobre `/admin/acessos` inteiro — usuários e perfis. Pela matriz de docs/02,
 * `administracao` é de Admin geral e de Suporte/Auditoria; RH/DP e Contratos
 * não entram aqui, embora tenham acesso ao resto do painel.
 *
 * Suporte/Auditoria tem `administracao:ver` mas não `editar`: enxerga a tela e
 * é barrado em cada Server Action. Por isso `ver` aqui e `criar`/`editar` lá —
 * esconder botão é conveniência, a barreira é a action (e a RLS depois dela).
 */
export default async function LayoutAcessos({ children }: { children: ReactNode }) {
  await exigirPermissao("administracao", "ver");
  return <>{children}</>;
}
