import type { ReactNode } from "react";

import { exigirPermissao } from "@/lib/auth/sessao";

/**
 * Fronteira de MÓDULO (CLAUDE.md, invariante 9).
 *
 * A trilha é de quem tem `administracao:ver` — Admin geral e
 * Suporte/Auditoria, pela matriz de docs/02. A exportação pede
 * `administracao:exportar` de novo no route handler, que valida sozinho.
 */
export default async function LayoutAuditoria({ children }: { children: ReactNode }) {
  await exigirPermissao("administracao", "ver");
  return <>{children}</>;
}
