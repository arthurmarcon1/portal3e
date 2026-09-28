"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { BadgeStatus } from "@/components/badge-status";
import { FiltroSelecao, TODOS } from "@/components/tabela/filtro-selecao";
import { criarColunas, TabelaDados, type ColunaDe } from "@/components/tabela/tabela-dados";
import { Button } from "@/components/ui/button";
import { formatarData, formatarDataHora, ROTULO_ESCOPO } from "@/features/documentos/formato";
import type { DocumentoLinha } from "@/features/documentos/queries";

const helper = criarColunas<DocumentoLinha>();

const OPCOES_STATUS = [
  { id: "rascunho", nome: "Rascunho" },
  { id: "publicado", nome: "Publicado" },
  { id: "arquivado", nome: "Arquivado" },
];

/**
 * Listagem de documentos. Daqui só se cria e se navega: publicar, arquivar e
 * retificar acontecem no detalhe, que mostra o arquivo e o público antes.
 *
 * Abre sem os arquivados: versão substituída por retificação vai para
 * `arquivado`, e mostrá-la ao lado da atual confunde qual vale.
 */
export function TelaDocumentos({
  dados,
  podeCriar,
}: {
  dados: DocumentoLinha[];
  podeCriar: boolean;
}) {
  const [status, setStatus] = useState(TODOS);
  const [tipo, setTipo] = useState(TODOS);

  const opcoesTipo = useMemo(
    () =>
      [...new Set(dados.map((d) => d.tipo_nome))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((t) => ({ id: t, nome: t })),
    [dados],
  );

  const visiveis = useMemo(
    () =>
      dados.filter(
        (d) =>
          (status === TODOS ? d.status !== "arquivado" : d.status === status) &&
          (tipo === TODOS || d.tipo_nome === tipo),
      ),
    [dados, status, tipo],
  );

  const colunas = useMemo<ColunaDe<DocumentoLinha>[]>(
    () =>
      helper.columns([
        helper.accessor("titulo", {
          header: "Título",
          cell: (ctx) => (
            <Link
              href={`/admin/documentos/${ctx.row.original.id}`}
              className="font-medium text-acao underline-offset-2 hover:underline"
            >
              {ctx.getValue()}
            </Link>
          ),
        }),
        helper.accessor("tipo_nome", { header: "Tipo" }),
        helper.display({
          id: "para",
          header: "Para",
          cell: (ctx) => {
            const d = ctx.row.original;
            if (d.escopo === "coletivo") return ROTULO_ESCOPO.coletivo;
            return d.pessoa_nome ?? <span className="text-texto-suave">—</span>;
          },
        }),
        helper.accessor("versao", {
          header: "Versão",
          cell: (ctx) => <span className="tabular-nums">v{ctx.getValue()}</span>,
        }),
        helper.accessor("publicado_em", {
          header: "Publicado em",
          cell: (ctx) => (
            <span className="tabular-nums whitespace-nowrap">
              {formatarDataHora(ctx.getValue())}
            </span>
          ),
        }),
        helper.accessor("prazo_ciencia", {
          header: "Prazo de ciência",
          cell: (ctx) => (
            <span className="tabular-nums">{formatarData(ctx.getValue())}</span>
          ),
        }),
        helper.accessor("status", {
          header: "Situação",
          cell: (ctx) => <BadgeStatus status={ctx.getValue()} />,
        }),
      ]) as ColunaDe<DocumentoLinha>[],
    [],
  );

  return (
    <TabelaDados
      colunas={colunas}
      dados={visiveis}
      camposDeBusca={(d) => `${d.titulo} ${d.tipo_nome} ${d.pessoa_nome ?? ""}`}
      rotuloBusca="Buscar por título, tipo ou pessoa"
      substantivo={["documento", "documentos"]}
      filtros={
        <>
          <FiltroSelecao rotulo="Tipo" opcoes={opcoesTipo} valor={tipo} aoMudar={setTipo} />
          <FiltroSelecao
            rotulo="Situação"
            opcoes={OPCOES_STATUS}
            valor={status}
            aoMudar={setStatus}
            rotuloTodos="Rascunhos e publicados"
            largura="w-52"
          />
        </>
      }
      acao={
        podeCriar ? (
          <Button type="button" asChild>
            <Link href="/admin/documentos/novo">
              <Plus aria-hidden strokeWidth={1.5} />
              Novo documento
            </Link>
          </Button>
        ) : undefined
      }
      vazio={{
        titulo: "Nenhum documento nesta lista.",
        descricao: podeCriar
          ? "Envie o PDF, escolha para quem vai, confira a prévia e publique."
          : "Quando a equipe publicar documentos, eles aparecem aqui.",
      }}
    />
  );
}
