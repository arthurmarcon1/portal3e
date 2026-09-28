import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { BadgeSituacao } from "@/components/solicitacoes/badge-situacao";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/features/documentos/formato";
import { ROTULO_TIPO } from "@/features/solicitacoes/fluxo";
import { listarSolicitacoes } from "@/features/solicitacoes/queries";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

export const metadata: Metadata = { title: "Meus pedidos · Portal 3e" };

/** Pedidos do funcionário (F4.2). A RLS entrega só os dele. */
export default paginaProtegida({ tipo: "funcionario" }, async function PaginaPedidos() {
  const pedidos = await listarSolicitacoes();
  const aguardando = pedidos.filter((p) => p.status === "pendente_solicitante");

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">
      <Link href="/inicio" className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-texto-suave">
        <ChevronLeft aria-hidden strokeWidth={1.5} className="size-5" />
        Início
      </Link>
      <h1 className="text-xl">Meus pedidos</h1>
      {aguardando.length ? (
        <p className="mt-1 text-alerta">
          {aguardando.length === 1 ? "1 pedido está esperando resposta sua." : `${aguardando.length} pedidos estão esperando resposta sua.`}
        </p>
      ) : null}

      <Button asChild className="mt-4 h-12 w-full text-base">
        <Link href="/pedidos/novo">
          <Plus aria-hidden strokeWidth={1.5} />
          Fazer um pedido
        </Link>
      </Button>

      {pedidos.length === 0 ? (
        <p className="mt-6 text-texto-suave">
          Você ainda não fez nenhum pedido. Férias, afastamento, correção de ponto e atualização de
          cadastro são pedidos por aqui.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-borda rounded-lg border border-borda">
          {pedidos.map((p) => (
            <li key={p.id}>
              <Link href={`/pedidos/${p.id}`} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block">{ROTULO_TIPO[p.tipo]}</span>
                  <span className="block text-sm text-texto-suave tabular-nums">
                    {p.protocolo} · {formatarDataHora(p.criado_em).slice(0, 10)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <BadgeSituacao status={p.status} />
                  <ChevronRight aria-hidden strokeWidth={1.5} className="size-5 text-texto-suave" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
});
