import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { opcoesDePublicacao } from "@/features/documentos/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { FormularioDocumento } from "./formulario-documento";

export const metadata: Metadata = { title: "Novo documento · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "documentos", acao: "criar" },
  async function PaginaNovoDocumento() {
    const opcoes = await opcoesDePublicacao();

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Link
          href="/admin/documentos"
          className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Documentos
        </Link>

        <h1 className="mb-1 text-xl">Novo documento</h1>
        <p className="mb-5 text-sm text-texto-suave">
          O documento é salvo como rascunho. Ninguém recebe nada até você conferir a
          prévia e publicar.
        </p>

        {opcoes.tipos.length === 0 ? (
          <div className="rounded-lg border border-borda bg-fundo-alt px-4 py-8 text-center">
            <p className="font-medium">Nenhum tipo de documento liberado para o seu perfil.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-texto-suave">
              Peça ao administrador do Portal a categoria do documento que você precisa
              publicar.
            </p>
          </div>
        ) : (
          <FormularioDocumento opcoes={opcoes} />
        )}
      </main>
    );
  },
);
