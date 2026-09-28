import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { contratosDoEscopo } from "@/features/solicitacoes/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { FormularioOcorrencia } from "./formulario-ocorrencia";

export const metadata: Metadata = { title: "Nova solicitação · Portal 3e" };

export default paginaProtegida(
  { tipo: "contratante", modulo: "solicitacoes", acao: "criar" },
  async function PaginaNovaSolicitacao() {
    const contratos = await contratosDoEscopo();
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Link href="/cliente/solicitacoes" className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Solicitações
        </Link>
        <h1 className="mb-5 text-xl">Nova solicitação</h1>
        {contratos.length === 0 ? (
          <p className="text-texto-suave">
            Nenhum contrato ativo no seu acesso. Fale com a 3e para liberar o contrato.
          </p>
        ) : (
          <FormularioOcorrencia contratos={contratos} />
        )}
      </main>
    );
  },
);
