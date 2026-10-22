import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { idValido } from "@/features/documentos/entrega";
import { documentoParaCiencia, hojeEmBrasilia } from "@/features/documentos/funcionario";
import { ATENDIMENTO, linhaDoPrazo, textosDaResposta, tituloParaFuncionario } from "@/features/funcionario/textos";
import { paginaProtegida } from "@/lib/auth/pagina-protegida";
import { cn } from "@/lib/utils";

import { Protocolo } from "./protocolo";
import { TelaCiencia } from "./tela-ciencia";
import { VisualizadorPdf } from "./visualizador-pdf";

export const metadata: Metadata = { title: "Documento · Portal 3e" };

/**
 * Documento do funcionário e a tela de ciência (F3.4).
 *
 * Três situações, decididas aqui no servidor:
 * - pede ciência e ainda não foi respondido → documento + pergunta + ações;
 * - já respondido → o protocolo em cima e o documento embaixo, sem ações
 *   (ciência é uma só por versão, e imutável);
 * - arquivado (versão substituída) → só leitura, com o caminho para a atual.
 *   É o que a 0016 garante: quem respondeu a v1 continua abrindo a v1.
 */
export default paginaProtegida(
  { tipo: "funcionario" },
  async function PaginaDocumento({
    params,
    searchParams,
  }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ respondido?: string; aviso?: string }>;
  }) {
    const { id } = await params;
    const { respondido, aviso } = await searchParams;
    if (!idValido(id)) notFound();

    const documento = await documentoParaCiencia(id);
    // Inexistente e fora do alcance da RLS dão no mesmo 404.
    if (!documento) notFound();

    const hoje = hojeEmBrasilia();
    const titulo = tituloParaFuncionario(documento.titulo);
    const aguardando =
      documento.status === "publicado" && documento.tipo.exige_ciencia && !documento.resposta;

    // Logo depois de responder: a tela de protocolo, com o número lido do
    // banco. Só aparece se a resposta existe de fato — o parâmetro sozinho
    // não inventa protocolo.
    if (respondido === "1" && documento.resposta) {
      return (
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">
          <h1 className="sr-only">{titulo}</h1>
          <p className="mb-2 text-texto-suave">{titulo}</p>
          <Protocolo
            cienciaId={documento.resposta.id}
            tipo={documento.resposta.tipo}
            protocolo={documento.resposta.protocolo}
            respondidoEm={documento.resposta.respondido_em}
            solicitacaoProtocolo={documento.solicitacao_protocolo}
            aviso={
              aviso === "foto"
                ? `Seu aviso de erro foi registrado, mas a foto não chegou. Mostre a foto para ${ATENDIMENTO.contato} e diga o número do comprovante.`
                : null
            }
            destaque
          />
        </main>
      );
    }

    const visualizador = <VisualizadorPdf documentoId={documento.id} titulo={titulo} />;
    const textos = aguardando ? textosDaResposta(documento.tipo.chave, documento.titulo) : null;
    const prazo = aguardando && documento.prazo_ciencia ? linhaDoPrazo(documento.prazo_ciencia, hoje) : null;

    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-3 pb-6">
        <Link
          href="/inicio"
          className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-1 text-texto-suave"
        >
          <ChevronLeft aria-hidden strokeWidth={1.5} className="size-5" />
          Início
        </Link>

        <p className="text-sm text-texto-suave">
          {documento.tipo.nome}
          {documento.versao > 1 ? ` · versão ${documento.versao}` : ""}
        </p>
        <h1 className="text-xl leading-snug">{titulo}</h1>
        {prazo ? (
          <p className={cn("mt-1", prazo.vencido ? "text-erro" : "text-alerta")}>{prazo.texto}</p>
        ) : null}
        {documento.descricao ? <p className="mt-2">{documento.descricao}</p> : null}
        {/* Antes de o documento abrir: o que fazer e o que acontece depois (docs/04). */}
        {textos ? <p className="mt-3">{textos.instrucao}</p> : null}

        {documento.status === "arquivado" ? (
          <div className="mt-3 rounded-lg border border-borda bg-fundo-alt p-3">
            <p>Esta versão foi substituída por uma versão corrigida.</p>
            {documento.versao_atual_id ? (
              <Link
                href={`/documentos/${documento.versao_atual_id}`}
                className="mt-1 inline-flex min-h-11 items-center font-medium text-acao underline underline-offset-2"
              >
                Abrir a versão atual
              </Link>
            ) : null}
          </div>
        ) : null}

        {documento.resposta ? (
          <div className="mt-3">
            <Protocolo
              cienciaId={documento.resposta.id}
            tipo={documento.resposta.tipo}
              protocolo={documento.resposta.protocolo}
              respondidoEm={documento.resposta.respondido_em}
              solicitacaoProtocolo={documento.solicitacao_protocolo}
            />
          </div>
        ) : null}

        <div className="mt-4">
          {textos ? (
            <TelaCiencia documentoId={documento.id} textos={textos}>
              {visualizador}
            </TelaCiencia>
          ) : (
            visualizador
          )}
        </div>
      </main>
    );
  },
);
