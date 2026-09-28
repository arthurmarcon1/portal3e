import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

export const metadata: Metadata = { title: "Painel do cliente · Portal 3e" };

export default paginaProtegida(
  { tipo: "contratante" },
  async function PaginaContratante(_props, usuario) {
    const veSolicitacoes = await temPermissao("solicitacoes", "ver");
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="text-xl">Painel do contratante</h1>
        <p className="mt-2 text-texto-suave">
          Você entrou como <strong className="font-medium">{usuario.nome}</strong>. Os demais
          módulos desta área entram na Fase 5 — ver docs/05-roadmap-prompts.md.
        </p>
        {veSolicitacoes ? (
          <Link
            href="/cliente/solicitacoes"
            className="mt-6 flex max-w-md items-center justify-between rounded-lg border border-borda px-4 py-3 hover:bg-fundo-alt"
          >
            <span>
              <span className="block font-medium">Solicitações</span>
              <span className="block text-sm text-texto-suave">Ocorrências e substituições dos seus contratos</span>
            </span>
            <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 text-texto-suave" />
          </Link>
        ) : null}
      </main>
    );
  },
);
