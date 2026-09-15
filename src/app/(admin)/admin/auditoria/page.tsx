import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  lerFiltros,
  paraQueryString,
  POR_PAGINA,
} from "@/features/auditoria/filtros";
import { listarAuditoria, opcoesDeFiltro } from "@/features/auditoria/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { FiltrosAuditoria } from "./filtros-auditoria";
import { TelaAuditoria } from "./tela-auditoria";

export const metadata: Metadata = { title: "Auditoria · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "administracao", acao: "ver" },
  async function PaginaAuditoria({
    searchParams,
  }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }) {
    const filtros = lerFiltros(await searchParams);

    const [{ eventos, total }, opcoes, podeExportar] = await Promise.all([
      listarAuditoria(filtros),
      opcoesDeFiltro(),
      temPermissao("administracao", "exportar"),
    ]);

    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (filtros.pagina > paginas) {
      redirect(`/admin/auditoria${paraQueryString({ ...filtros, pagina: paginas })}`);
    }

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl">Auditoria</h1>
        <p className="mb-5 text-sm text-texto-suave">
          Quem fez o quê, quando e de onde. A trilha só cresce: nenhum evento é editado ou
          apagado.
        </p>

        <FiltrosAuditoria
          // Remonta ao navegar: o formulário volta a refletir a URL, inclusive
          // depois de "Limpar" ou do botão voltar do navegador.
          key={paraQueryString({ ...filtros, pagina: 1 })}
          filtros={filtros}
          opcoes={opcoes}
          podeExportar={podeExportar}
        />

        <TelaAuditoria
          eventos={eventos}
          total={total}
          pagina={filtros.pagina}
          paginas={paginas}
          filtros={filtros}
        />
      </main>
    );
  },
);
