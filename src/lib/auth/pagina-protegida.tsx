import "server-only";

import type { ReactNode } from "react";

import { SemPermissao } from "@/components/sem-permissao";

import type { Acao, Modulo } from "./modulos";
import { exigirTipo, temPermissao, type TipoUsuario, type UsuarioSessao } from "./sessao";

/**
 * Barreira de autorização de TODA página das áreas logadas.
 *
 * Por que na página e não no layout: no Next 16 o layout **não controla se o
 * resto da rota renderiza**. Os segmentos são renderizados pelo router em
 * paralelo; um layout que lança, redireciona ou troca `children` não impede a
 * página de rodar nem de entrar no RSC payload (docs do Next, guia de
 * autenticação, "Layouts"). Medido aqui: com `exigirPermissao` lançando no
 * layout de `/admin/auditoria`, o RH/DP recebia um 500 que carregava, dentro,
 * o RSC completo da página — cabeçalho, filtros e o resultado das consultas.
 * Só não vazou dado porque a RLS cortou.
 *
 * Então a checagem acontece antes de a página começar, e a página só é
 * chamada depois dela:
 *
 * 1. tipo de usuário errado → `redirect` para a própria área (`exigirTipo`);
 * 2. sem a permissão do módulo → tela `SemPermissao`, que diz qual permissão
 *    falta e a quem pedir. **Nunca 500**: 500 é defeito, não autorização.
 *
 * Uso — a página recebe as props do Next e o usuário já resolvido:
 *
 *   export default paginaProtegida(
 *     { tipo: "interno", modulo: "pessoas", acao: "ver" },
 *     async function PaginaPessoas({ searchParams }, usuario) { ... },
 *   );
 *
 * `src/app/paginas-protegidas.test.ts` falha se alguma `page.tsx` das áreas
 * não passar por aqui. A ação forte (criar, editar…) continua checada de novo
 * na Server Action com `exigirPermissao`, e a RLS segue sendo a palavra final.
 */

export type Exigencia =
  | { tipo: TipoUsuario; modulo: Modulo; acao: Acao }
  /** Página da área sem módulo próprio (a página inicial de cada área). */
  | { tipo: TipoUsuario; modulo?: never; acao?: never };

export function paginaProtegida<P extends object>(
  exigencia: Exigencia,
  pagina: (props: P, usuario: UsuarioSessao) => Promise<ReactNode> | ReactNode,
) {
  return async function PaginaProtegida(props: P): Promise<ReactNode> {
    const usuario = await exigirTipo(exigencia.tipo);

    if (exigencia.modulo && !(await temPermissao(exigencia.modulo, exigencia.acao))) {
      return (
        <SemPermissao
          tipo={usuario.tipo}
          emailLogin={usuario.emailLogin}
          modulo={exigencia.modulo}
          acao={exigencia.acao}
        />
      );
    }

    // Chamada só depois da checagem: nenhuma consulta da página começa antes.
    return pagina(props, usuario);
  };
}
