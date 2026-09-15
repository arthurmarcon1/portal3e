import type { ReactNode } from "react";

import { CabecalhoArea } from "@/components/cabecalho-area";
import { exigirTipo } from "@/lib/auth/sessao";

/**
 * Área do funcionário.
 *
 * O `exigirTipo` abaixo protege o que ESTE layout desenha (cabeçalho, nome
 * do usuário). Ele não segura as páginas: no Next 16 o layout não
 * controla se o resto da rota renderiza — os segmentos rodam em paralelo e
 * entram no RSC payload mesmo que o layout redirecione. Quem segura cada
 * página é `paginaProtegida`, que refaz o tipo e checa o módulo antes de a
 * página começar (ver `src/lib/auth/pagina-protegida.tsx`).
 *
 * O proxy (`src/proxy.ts`) é conveniência de roteamento — ele manda a pessoa
 * para a própria área antes de a tela piscar. Some com o proxy inteiro e nada
 * vaza. A documentação do Next diz o mesmo: Proxy é interceptação de
 * requisição, não camada de autorização (e já houve CVE de bypass de
 * middleware).
 *
 * Por último, a RLS, que segura o dado mesmo se as camadas de cima falharem.
 */
export default async function LayoutFuncionario({ children }: { children: ReactNode }) {
  const usuario = await exigirTipo("funcionario");

  return (
    <div className="flex min-h-dvh flex-col">
      <CabecalhoArea nome={usuario.nome} />
      {children}
    </div>
  );
}
