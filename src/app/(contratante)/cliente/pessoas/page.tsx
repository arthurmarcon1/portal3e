import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { quadroDoContratante } from "@/features/contratante/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaQuadro } from "./tela-quadro";

export const metadata: Metadata = { title: "Pessoas · Portal 3e" };

/**
 * Quadro alocado, visto pelo contratante (F5.1). Só os campos de docs/02 —
 * e não porque a tela escolhe: é tudo o que `quadro_do_contratante` devolve.
 */
export default paginaProtegida(
  { tipo: "contratante", modulo: "pessoas", acao: "ver" },
  async function PaginaPessoasCliente() {
    const quadro = await quadroDoContratante();
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Link href="/cliente" className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Painel
        </Link>
        <h1 className="mb-1 text-xl">Pessoas</h1>
        <p className="mb-5 text-sm text-texto-suave">Quem está alocado hoje nos seus contratos e unidades.</p>
        <TelaQuadro dados={quadro} />
      </main>
    );
  },
);
