import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { BadgeSituacao } from "@/components/solicitacoes/badge-situacao";
import { FormularioResposta } from "@/components/solicitacoes/formulario-resposta";
import { LinhaDoTempo, ListaDeAnexos } from "@/components/solicitacoes/linha-do-tempo";
import { idValido } from "@/features/documentos/entrega";
import { formatarData } from "@/features/documentos/formato";
import { encerrada, ROTULO_TIPO } from "@/features/solicitacoes/fluxo";
import { buscarSolicitacao } from "@/features/solicitacoes/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

export const metadata: Metadata = { title: "Solicitação · Portal 3e" };

export default paginaProtegida(
  { tipo: "contratante", modulo: "solicitacoes", acao: "ver" },
  async function PaginaSolicitacaoCliente({ params }: { params: Promise<{ id: string }> }, usuario) {
    const { id } = await params;
    if (!idValido(id)) notFound();
    const s = await buscarSolicitacao(id);
    if (!s) notFound();

    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Link href="/cliente/solicitacoes" className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Solicitações
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl">{s.titulo}</h1>
          <BadgeSituacao status={s.status} />
        </div>
        <p className="mt-1 text-sm text-texto-suave tabular-nums">
          {ROTULO_TIPO[s.tipo]} · {s.protocolo}
          {s.contrato_numero ? ` · contrato ${s.contrato_numero}` : ""}
          {s.unidade_nome ? ` · ${s.unidade_nome}` : ""}
          {s.prazo && !encerrada(s.status) ? ` · resposta prevista até ${formatarData(s.prazo)}` : ""}
        </p>

        {s.status === "pendente_solicitante" && s.aberta_por === usuario.id ? (
          <div className="mt-4">
            <FormularioResposta solicitacaoId={s.id} />
          </div>
        ) : null}

        {s.descricao ? <p className="mt-4 whitespace-pre-line">{s.descricao}</p> : null}
        <div className="mt-2">
          <ListaDeAnexos anexos={s.anexos} />
        </div>
        <h2 className="mt-6 mb-2 font-medium">Andamento</h2>
        <LinhaDoTempo eventos={s.eventos} usuarioId={usuario.id} perspectiva="solicitante" />
      </main>
    );
  },
);
