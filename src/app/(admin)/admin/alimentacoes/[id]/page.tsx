import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { BadgeStatus } from "@/components/badge-status";
import { buscarAlimentacao, opcoesDeConferencia } from "@/features/alimentacoes/queries";
import { formatarDataHora } from "@/features/documentos/formato";
import { idValido } from "@/features/documentos/entrega";
import { temPermissao } from "@/lib/auth/sessao";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";

import { PainelConferencia, TranscricaoEditavel } from "./painel-conferencia";

export const metadata: Metadata = { title: "Conferir alimentação · Portal 3e" };

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function competenciaPorExtenso(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(ano, mes - 1, 1)),
  );
}

/**
 * Conferência de uma alimentação: o original e a transcrição de um lado, a
 * sugestão editável do outro. Decidida, vira só leitura — não muda mais (0029).
 */
export default paginaProtegida(
  { tipo: "interno", modulo: "alimentacoes", acao: "ver" },
  async function PaginaAlimentacao({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    if (!idValido(id)) notFound();

    const alimentacao = await buscarAlimentacao(id);
    // Inexistente e fora do alcance da RLS dão no mesmo 404.
    if (!alimentacao) notFound();

    const [podeEditar, opcoes] = await Promise.all([
      temPermissao("alimentacoes", "editar"),
      opcoesDeConferencia(alimentacao.contrato_id),
    ]);
    const pendente = alimentacao.status === "pendente";
    const arquivo = `/api/alimentacoes/${alimentacao.id}/arquivo`;

    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <Link
          href="/admin/alimentacoes"
          className="mb-4 inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-4" />
          Alimentações
        </Link>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            {alimentacao.tipo === "audio" ? "Áudio" : "Foto"} de {formatarDataHora(alimentacao.criado_em)}
          </h1>
          <BadgeStatus status={alimentacao.status} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="original" className="superficie grid h-fit gap-4 p-5">
            <div>
              <h2 id="original" className="text-base font-semibold">
                O que o produtor mandou
              </h2>
              <p className="mt-1 text-xs text-texto-suave">
                Contrato {alimentacao.contrato_numero}
                {alimentacao.enviada_por_nome ? ` · enviado por ${alimentacao.enviada_por_nome}` : ""}
              </p>
            </div>

            {alimentacao.tipo === "audio" ? (
              // preload="none": cada vez que alguém ouve, fica um download auditado — e só então.
              <audio controls preload="none" src={arquivo} className="w-full">
                <a href={arquivo}>Baixar o áudio</a>
              </audio>
            ) : (
              <a href={arquivo} target="_blank" rel="noreferrer" className="text-sm text-acao underline-offset-2 hover:underline">
                Abrir a foto em outra aba
              </a>
            )}

            {pendente && podeEditar ? (
              <TranscricaoEditavel
                id={alimentacao.id}
                transcricao={alimentacao.transcricao}
                tipo={alimentacao.tipo}
              />
            ) : (
              <div>
                <p className="text-sm font-medium">{alimentacao.tipo === "audio" ? "Transcrição" : "Descrição da foto"}</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{alimentacao.transcricao ?? "—"}</p>
              </div>
            )}
            {alimentacao.transcricao_origem ? (
              <p className="text-xs text-texto-suave">
                {alimentacao.transcricao_origem === "manual"
                  ? "Texto digitado ou corrigido na conferência."
                  : `Transcrição automática (${alimentacao.transcricao_origem.replace(/^groq:/, "")}).`}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="conferencia" className="superficie h-fit p-5">
            <h2 id="conferencia" className="mb-4 text-base font-semibold">
              {pendente ? "Sugestão para conferir" : "Decisão"}
            </h2>

            {pendente && podeEditar ? (
              <PainelConferencia
                id={alimentacao.id}
                extracao={alimentacao.extracao}
                rubricas={opcoes.rubricas}
                unidades={opcoes.unidades}
              />
            ) : pendente ? (
              <p className="text-sm text-texto-suave">Aguardando conferência de quem tem permissão para conferir.</p>
            ) : alimentacao.status === "conferida" && alimentacao.lancamento ? (
              <dl className="grid gap-3 text-sm">
                <Item rotulo="Cliente">{alimentacao.lancamento.unidade_nome ?? "—"}</Item>
                <Item rotulo="Rubrica">{alimentacao.lancamento.rubrica_nome}</Item>
                <Item rotulo="Descrição">{alimentacao.lancamento.descricao}</Item>
                <Item rotulo="Valor">
                  <span className="tabular-nums">{MOEDA.format(alimentacao.lancamento.valor)}</span>
                </Item>
                <Item rotulo="Competência">{competenciaPorExtenso(alimentacao.lancamento.competencia)}</Item>
                <Item rotulo="Conferida">
                  {formatarDataHora(alimentacao.decidida_em)}
                  {alimentacao.decidida_por_nome ? ` por ${alimentacao.decidida_por_nome}` : ""}
                </Item>
              </dl>
            ) : (
              <dl className="grid gap-3 text-sm">
                <Item rotulo="Motivo da recusa">{alimentacao.motivo_recusa ?? "—"}</Item>
                <Item rotulo="Recusada">
                  {formatarDataHora(alimentacao.decidida_em)}
                  {alimentacao.decidida_por_nome ? ` por ${alimentacao.decidida_por_nome}` : ""}
                </Item>
              </dl>
            )}
          </section>
        </div>
      </main>
    );
  },
);

function Item({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-suave">{rotulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
