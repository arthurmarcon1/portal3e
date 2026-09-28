import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";

import { BadgeSituacao } from "@/components/solicitacoes/badge-situacao";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora } from "@/features/documentos/formato";
import { ROTULO_TIPO } from "@/features/solicitacoes/fluxo";
import { listarSolicitacoes } from "@/features/solicitacoes/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

export const metadata: Metadata = { title: "Solicitações · Portal 3e" };

/**
 * Solicitações do contratante (F4.2): as do escopo dele. Pedido pessoal de
 * funcionário (férias, correção de ponto) nasce sem contrato e não chega
 * aqui — é assunto da pessoa com a 3e.
 */
export default paginaProtegida(
  { tipo: "contratante", modulo: "solicitacoes", acao: "ver" },
  async function PaginaSolicitacoesCliente() {
    const [lista, podeCriar] = await Promise.all([listarSolicitacoes(), temPermissao("solicitacoes", "criar")]);

    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Link href="/cliente" className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto">
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Painel
        </Link>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl">Solicitações</h1>
          {podeCriar ? (
            <Button asChild>
              <Link href="/cliente/solicitacoes/nova">
                <Plus aria-hidden strokeWidth={1.5} />
                Nova solicitação
              </Link>
            </Button>
          ) : null}
        </div>
        {lista.length === 0 ? (
          <p className="text-texto-suave">Nenhuma solicitação nos seus contratos ainda.</p>
        ) : (
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {lista.map((s) => (
              <li key={s.id}>
                <Link href={`/cliente/solicitacoes/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-fundo-alt">
                  <span>
                    <span className="block font-medium">{s.titulo}</span>
                    <span className="block text-sm text-texto-suave tabular-nums">
                      {ROTULO_TIPO[s.tipo]} · {s.protocolo} · {formatarDataHora(s.criado_em).slice(0, 10)}
                      {s.contrato_numero ? ` · contrato ${s.contrato_numero}` : ""}
                      {s.prazo ? ` · prazo ${formatarData(s.prazo)}` : ""}
                    </span>
                  </span>
                  <BadgeSituacao status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  },
);
