import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { buscarDocumento } from "@/features/documentos/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { FormularioRetificacao } from "./formulario-retificacao";

export const metadata: Metadata = { title: "Retificar documento · Portal 3e" };

/**
 * Retificação: versão nova de um publicado, com arquivo novo (F3.1).
 *
 * Mesmo tipo, escopo, pessoa e público — o banco recusa qualquer diferença
 * (0015). Nasce como rascunho; a versão anterior só é arquivada quando esta
 * for publicada, e toda pessoa alcançada precisa dar ciência de novo.
 */
export default paginaProtegida(
  { tipo: "interno", modulo: "documentos", acao: "editar" },
  async function PaginaRetificar({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

    const documento = await buscarDocumento(id);
    if (!documento) notFound();
    // Só publicado se retifica; o resto volta ao detalhe, que explica o estado.
    if (documento.status !== "publicado") redirect(`/admin/documentos/${id}`);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Link
          href={`/admin/documentos/${id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          {documento.titulo}
        </Link>

        <h1 className="mb-1 text-xl">Retificar documento</h1>
        <p className="mb-5 max-w-2xl text-sm text-texto-suave">
          Cria a versão {documento.versao + 1} como rascunho, para o mesmo público. A versão{" "}
          {documento.versao} continua valendo até você publicar a nova; aí ela é arquivada,
          com as ciências já dadas preservadas
          {documento.tipo.exige_ciencia ? ", e todos precisam dar ciência de novo" : ""}.
        </p>

        <FormularioRetificacao
          documentoId={documento.id}
          titulo={documento.titulo}
          descricao={documento.descricao}
        />
      </main>
    );
  },
);
