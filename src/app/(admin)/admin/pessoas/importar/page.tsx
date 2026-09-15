import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaImportacao } from "./tela-importacao";

export const metadata: Metadata = { title: "Importar pessoas · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "pessoas", acao: "criar" },
  async function PaginaImportarPessoas() {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Link
          href="/admin/pessoas"
          className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Pessoas
        </Link>

        <h1 className="mb-1 text-xl">Importar pessoas</h1>
        <p className="mb-5 text-sm text-texto-suave">
          Envie a planilha do quadro. Nada é gravado antes de você conferir a
          pré-visualização.
        </p>

        <TelaImportacao />
      </main>
    );
  },
);
