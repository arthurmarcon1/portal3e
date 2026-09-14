import type { ReactNode } from "react";

import { exigirPermissao } from "@/lib/auth/sessao";

/**
 * Fronteira de MÓDULO (CLAUDE.md, invariante 9).
 *
 * Cobre a subárvore inteira de `/admin/pessoas` — listagem, ficha e o que
 * vier depois (a importação da F1.3 já nasce protegida por esta linha).
 *
 * A fronteira de ÁREA (tipo interno) fica um nível acima, em
 * `src/app/(admin)/layout.tsx`. As duas são necessárias: o fiscal de um
 * contratante tem `pessoas:ver` na matriz de docs/02, então só esta guarda
 * não o manteria fora daqui.
 *
 * A ação forte — criar, editar, desativar — é checada de novo em cada Server
 * Action, e a RLS é a palavra final.
 */
export default async function LayoutPessoas({ children }: { children: ReactNode }) {
  await exigirPermissao("pessoas", "ver");
  return <>{children}</>;
}
