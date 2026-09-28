import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { BadgeSituacao } from "@/components/solicitacoes/badge-situacao";
import { LinhaDoTempo, ListaDeAnexos } from "@/components/solicitacoes/linha-do-tempo";
import { idValido } from "@/features/documentos/entrega";
import { formatarData, formatarDataHora } from "@/features/documentos/formato";
import { hojeEmBrasilia } from "@/features/documentos/funcionario";
import { ROTULO_TIPO, TRANSICOES, vencida } from "@/features/solicitacoes/fluxo";
import { buscarSolicitacao, responsaveisPossiveis } from "@/features/solicitacoes/queries";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

import { PainelTratamento } from "./painel-tratamento";

export const metadata: Metadata = { title: "Solicitação · Portal 3e" };

export default paginaProtegida(
  { tipo: "interno", modulo: "solicitacoes", acao: "ver" },
  async function PaginaSolicitacao({ params }: { params: Promise<{ id: string }> }, usuario) {
    const { id } = await params;
    if (!idValido(id)) notFound();

    const podeEditar = await temPermissao("solicitacoes", "editar");
    const [s, responsaveis] = await Promise.all([
      buscarSolicitacao(id),
      podeEditar ? responsaveisPossiveis() : Promise.resolve([]),
    ]);
    // Inexistente e fora do escopo dão no mesmo 404.
    if (!s) notFound();

    const atrasada = vencida(s.prazo, s.status, hojeEmBrasilia());

    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Link
          href="/admin/solicitacoes"
          className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Solicitações
        </Link>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <h1 className="text-xl">{s.titulo}</h1>
          <BadgeSituacao status={s.status} perspectiva="interno" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section className="grid content-start gap-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Item rotulo="Protocolo"><span className="tabular-nums">{s.protocolo}</span></Item>
              <Item rotulo="Tipo">{ROTULO_TIPO[s.tipo]}</Item>
              <Item rotulo="Aberta por">
                {s.aberta_por_nome ?? "—"} · {formatarDataHora(s.criado_em)}
              </Item>
              <Item rotulo="Prazo">
                <span className={cn("tabular-nums", atrasada && "font-medium text-erro")}>
                  {s.prazo ? formatarData(s.prazo) : "sem prazo"}
                  {atrasada ? " · vencida" : ""}
                </span>
              </Item>
              {s.pessoa_nome ? <Item rotulo="Pessoa">{s.pessoa_nome}</Item> : null}
              {s.contrato_numero ? (
                <Item rotulo="Contrato">
                  {s.contrato_numero}
                  {s.unidade_nome ? ` · ${s.unidade_nome}` : ""}
                </Item>
              ) : null}
              <Item rotulo="Responsável">{s.responsavel_nome ?? "sem responsável"}</Item>
              {s.documento ? (
                <Item rotulo="Documento">
                  <Link href={`/admin/documentos/${s.documento.id}`} className="text-acao underline underline-offset-2">
                    {s.documento.titulo}
                  </Link>
                </Item>
              ) : null}
            </dl>

            {s.descricao ? (
              <div>
                <h2 className="mb-1 text-sm font-medium text-texto-suave">Descrição</h2>
                <p className="whitespace-pre-line">{s.descricao}</p>
              </div>
            ) : null}
            <ListaDeAnexos anexos={s.anexos} />

            <div>
              <h2 className="mb-2 text-base font-medium">Linha do tempo</h2>
              <LinhaDoTempo eventos={s.eventos} usuarioId={usuario.id} perspectiva="interno" />
            </div>
          </section>

          {podeEditar ? (
            <PainelTratamento
              solicitacaoId={s.id}
              status={s.status}
              proximos={[...TRANSICOES[s.status]]}
              responsavelId={s.responsavel_id}
              responsaveis={responsaveis}
            />
          ) : null}
        </div>
      </main>
    );
  },
);

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-texto-suave">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
