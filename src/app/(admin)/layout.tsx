import type { ReactNode } from "react";

import { CabecalhoArea } from "@/components/cabecalho-area";
import { exigirTipo } from "@/lib/auth/sessao";

/**
 * Área da equipe interna da 3e.
 *
 * O `exigirTipo` abaixo É a barreira de autorização desta área. Não é
 * redundância do proxy, e não pode ser removido em nome de simplificar:
 * sem ele, qualquer sessão válida do Portal renderiza a área interna.
 *
 * O proxy (`src/proxy.ts`) é conveniência de roteamento — ele manda a pessoa
 * para a própria área antes de a tela piscar. Some com o proxy inteiro e nada
 * vaza; some com esta linha e vaza. A documentação do Next diz o mesmo: Proxy
 * é interceptação de requisição, não camada de autorização (e já houve CVE de
 * bypass de middleware).
 *
 * Depois desta vem a fronteira de módulo — `exigirPermissao` no layout de
 * cada módulo — e, por último, a RLS, que segura o dado mesmo se as duas
 * primeiras falharem.
 */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  const usuario = await exigirTipo("interno");

  return (
    <div className="flex min-h-dvh flex-col">
      <CabecalhoArea nome={usuario.nome} />
      {children}
    </div>
  );
}
