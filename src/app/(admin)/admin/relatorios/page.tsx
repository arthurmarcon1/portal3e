import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { RELATORIOS } from "@/features/relatorios/definicoes";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

export const metadata: Metadata = { title: "Relatórios · Portal 3e" };

/**
 * Relatórios (F5.3). A lista mostra só o que o perfil pode abrir; cada tela
 * confere de novo (paginaProtegida) e a rota de exportação, uma terceira vez.
 */
export default paginaProtegida(
  { tipo: "interno", modulo: "relatorios", acao: "ver" },
  async function PaginaRelatorios() {
    const visiveis = [];
    for (const r of RELATORIOS) if (await temPermissao(r.ver.modulo, r.ver.acao)) visiveis.push(r);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl">Relatórios</h1>
        <p className="mb-5 text-sm text-texto-suave">
          Sempre no seu escopo de contratos e unidades. Toda exportação em CSV ou PDF fica registrada na auditoria.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {visiveis.map((r) => (
            <li key={r.chave}>
              <Link
                href={`/admin/relatorios/${r.chave}`}
                className="flex h-full items-center justify-between gap-3 rounded-lg border border-borda px-4 py-3 hover:bg-fundo-alt"
              >
                <span>
                  <span className="block font-medium">{r.titulo}</span>
                  <span className="block text-sm text-texto-suave">{r.descricao}</span>
                </span>
                <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 shrink-0 text-texto-suave" />
              </Link>
            </li>
          ))}
        </ul>
      </main>
    );
  },
);
