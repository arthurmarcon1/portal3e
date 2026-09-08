import type { ReactNode } from "react";

import { exigirPermissao } from "@/lib/auth/sessao";

/**
 * Fronteira de MÓDULO (CLAUDE.md, invariante 9).
 *
 * Contratantes, contratos e unidades são as três telas do módulo `contratos`
 * da matriz de docs/02. Este layout cobre a subárvore inteira: qualquer página
 * nova aqui dentro já nasce protegida, sem depender de alguém lembrar.
 *
 * A fronteira de ÁREA (tipo interno) fica um nível acima, em
 * `src/app/(admin)/layout.tsx`. As duas são necessárias: o fiscal de um
 * contratante tem `contratos:ver` na matriz, então só esta guarda não o
 * manteria fora daqui.
 *
 * A ação forte — criar, editar, desativar — é checada de novo em cada Server
 * Action, e a RLS é a palavra final.
 */
export default async function LayoutComercial({ children }: { children: ReactNode }) {
  await exigirPermissao("contratos", "ver");
  return <>{children}</>;
}
