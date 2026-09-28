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

export const metadata: Metadata = { title: "Pedido · Portal 3e" };

export default paginaProtegida(
  { tipo: "funcionario" },
  async function PaginaPedido({ params }: { params: Promise<{ id: string }> }, usuario) {
    const { id } = await params;
    if (!idValido(id)) notFound();
    const s = await buscarSolicitacao(id);
    if (!s) notFound();

    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">
        <Link href="/pedidos" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-texto-suave">
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-5" />
          Meus pedidos
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl">{ROTULO_TIPO[s.tipo]}</h1>
          <BadgeSituacao status={s.status} />
        </div>
        <p className="mt-1 text-texto-suave tabular-nums">Protocolo {s.protocolo}</p>
        {s.prazo && !encerrada(s.status) ? (
          <p className="text-texto-suave">Resposta prevista até {formatarData(s.prazo)}.</p>
        ) : null}

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
