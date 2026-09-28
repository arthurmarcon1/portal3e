import type { Metadata } from "next";

import { listarDocumentos } from "@/features/documentos/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { TelaDocumentos } from "./tela-documentos";

export const metadata: Metadata = { title: "Documentos · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "documentos", acao: "ver" },
  async function PaginaDocumentos() {
    const [dados, podeCriar] = await Promise.all([
      listarDocumentos(),
      temPermissao("documentos", "criar"),
    ]);

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-xl">Documentos</h1>
        <p className="mb-5 text-sm text-texto-suave">
          Comunicados, normas, espelhos e holerites publicados no Portal, com a versão e o
          prazo de ciência de cada um.
        </p>
        <TelaDocumentos dados={dados} podeCriar={podeCriar} />
      </main>
    );
  },
);
